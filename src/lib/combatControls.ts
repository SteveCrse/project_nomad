import type { CardEffect, DownAction, GameConfig, GameState, PlayerState, Ship, SlotIndex } from '@engine/types';
import { abilityEffects, activeEffects, attackOf, combat, hitChance, isDamageEffect, ship as shipEngine, spendRange } from '@engine';
import { CONTENT, getCard, getPart } from '@data';
import type { PanelControls } from '@/components/game/PlayerPanel';
import { battleOf, moduleOptions, reroutePlan, type ModuleOptions } from '@/lib/combatView';
import type { CombatMode } from '@/store/uiStore';

/**
 * What the seat on the clock can click right now.
 *
 * Every action is two steps at most: pick the module that does it, then — if
 * it aims — the module on the enemy it aims at. This works out, for the action
 * in hand, which of the seat's modules are live, which enemy modules are in
 * reach, and what the reroute being built would leave on the ship. The engine
 * decides every one of those; this only asks it.
 */
export interface CombatControls {
  acting: PlayerState | null;
  options: ModuleOptions[];
  /** The seat's ship as drawn — with a reroute's plan applied while one is built. */
  ship: Ship | null;
  controls: PanelControls | undefined;
  /** Enemy modules the action in hand can be aimed at. */
  targets: SlotIndex[];
  /** Where it would land by default. */
  aimed: SlotIndex | null;
  /** The reroute being built, played out. */
  plan: ReturnType<typeof reroutePlan> | null;
  /** One line on what to click next. */
  prompt: string;
  /** Attack: what the shot may spend, and what it's set to. */
  spend: { min: number; max: number; value: number } | null;
  /** Reroute: what the picked module can still send, and how much a click moves. */
  move: { max: number; value: number } | null;
}

/** Does firing these need a module on the enemy picked? */
export const aimsAtEnemy = (effects: CardEffect[], manualDamage: number): boolean =>
  effects.some((e) => isDamageEffect(e.type) || e.type === 'emp' || (e.type === 'manual' && manualDamage > 0));

export function combatControls(
  state: GameState,
  config: GameConfig,
  mode: CombatMode | null,
  manualDamage: number,
  act: {
    setMode: (mode: CombatMode | null) => void;
    take: (action: DownAction) => void;
    pickSource: (slot: SlotIndex | null) => void;
    addLeg: (from: SlotIndex, to: SlotIndex, amount: number) => void;
  },
): CombatControls {
  const fight = state.combat;
  const battle = battleOf(state);
  const side = fight && !fight.outcome ? fight.turn : null;
  const acting = side?.kind === 'player' ? (state.party.players.find((p) => p.id === side.id) ?? null) : null;
  const none: CombatControls = { acting, options: [], ship: acting?.ship ?? null, controls: undefined, targets: [], aimed: null, plan: null, prompt: '', spend: null, move: null };
  if (!fight || !battle || !side || !acting || fight.turnOver) return none;

  const enemy = fight.enemy.ship;
  const options = moduleOptions(state, config, side, null, manualDamage);
  const ok = (pick: (o: ModuleOptions) => { error: string | null } | null) =>
    options.filter((o) => !o.destroyed && pick(o) && !pick(o)!.error).map((o) => o.slot);
  const reach = (legal: (slot: SlotIndex) => boolean, precision: boolean) =>
    shipEngine.exposedSlots(CONTENT, enemy, precision).filter(legal);
  const legal = (action: DownAction) => !combat.actionError(CONTENT, battle, config, side, action);
  const name = (slot: SlotIndex) => getPart(acting.ship.slots[slot]?.partId)?.name ?? 'module';
  const base: CombatControls = { ...none, options };

  if (!mode) return { ...base, prompt: 'Pick an action below.' };

  switch (mode.kind) {
    case 'attack': {
      const guns = ok((o) => o.fire);
      const pick = (slot: SlotIndex) => act.setMode({ kind: 'attack', slot });
      if (mode.slot === null) {
        return {
          ...base,
          controls: { armed: guns, open: [], selected: null, deltas: {}, onSlotClick: pick, drag: null },
          prompt: guns.length ? 'Pick the module to fire — the cockpit counts.' : 'Nothing on your ship can fire right now.',
        };
      }
      const gun = mode.slot;
      const part = getPart(acting.ship.slots[gun]?.partId);
      const range = part ? spendRange(part, acting.ship.slots[gun]?.energy ?? 0) : { min: 1, max: 0 };
      const spend = Math.min(range.max, Math.max(range.min, mode.spend ?? range.max));
      const targets = reach((t) => legal({ type: 'attack', slot: gun, spend, targetSlot: t }), !!part?.targetsModule);
      return {
        ...base,
        controls: { armed: guns, open: [], selected: gun, deltas: {}, onSlotClick: (s) => (s === gun ? act.setMode({ kind: 'attack', slot: null }) : pick(s)), drag: null },
        targets,
        aimed: shipEngine.defaultTargetSlot(CONTENT, enemy),
        spend: { ...range, value: spend },
        prompt: `${name(gun)}: spend ${spend}⚡ — hits on a d6 of ${Math.min(spend, 6)} or less (${Math.round(hitChance(spend) * 100)}%) for ${part ? attackOf(part) : 0}⚔. Pick its target on the enemy.`,
      };
    }

    case 'generate': {
      const producers = ok((o) => o.generate);
      return {
        ...base,
        controls: {
          armed: producers,
          open: [],
          selected: null,
          deltas: {},
          onSlotClick: (slot) => act.take({ type: 'generate', slot }),
          drag: null,
        },
        prompt: producers.length ? 'Pick a generator or the cockpit — its output lands on itself.' : 'No producer can generate: all full.',
      };
    }

    case 'reroute': {
      const plan = reroutePlan(acting.ship, mode.moves);
      const ship = plan.ship;
      const live = (i: SlotIndex) => !!ship.slots[i] && !ship.slots[i]!.destroyed;
      const room = (i: SlotIndex) => (plan.room[i] ?? 0) > 0;
      const sendable = (i: SlotIndex) => (plan.sendable[i] ?? 0) > 0;
      const can = (from: SlotIndex, to: SlotIndex) =>
        from !== to && live(from) && live(to) && sendable(from) && room(to) && shipEngine.connected(ship, from, to);
      const sources = ship.slots
        .filter((s) => sendable(s.index) && shipEngine.neighbours(ship, s.index).some((n) => can(s.index, n)))
        .map((s) => s.index);
      const deltas: Record<number, number> = {};
      for (const s of ship.slots) {
        const d = s.energy - (acting.ship.slots[s.index]?.energy ?? s.energy);
        if (d !== 0) deltas[s.index] = d;
      }
      const from = mode.from;
      const open = from !== null ? shipEngine.neighbours(ship, from).filter((n) => can(from, n)) : [];
      const most = from !== null ? (plan.sendable[from] ?? 0) : 0;
      const move = most > 0 ? { max: most, value: Math.min(most, Math.max(1, mode.amount ?? most)) } : null;
      // A click or drop moves the picked amount (or, dragged from another
      // module, all it can) — never more than the far side has room for.
      const leg = (a: SlotIndex, b: SlotIndex) => {
        const want = a === from && move ? move.value : (plan.sendable[a] ?? 0);
        const amount = Math.min(want, plan.sendable[a] ?? 0, plan.room[b] ?? 0);
        if (amount > 0) act.addLeg(a, b, amount);
      };
      return {
        ...base,
        ship,
        plan,
        move,
        controls: {
          armed: from === null ? sources : sources.filter((s) => s !== from),
          open,
          selected: from,
          deltas,
          onSlotClick: (slot) => {
            if (from !== null && slot === from) act.pickSource(null);
            else if (from !== null && open.includes(slot)) leg(from, slot);
            else if (sources.includes(slot)) act.pickSource(slot);
          },
          drag: { source: sendable, accepts: can, onDrop: leg },
        },
        prompt:
          from === null
            ? 'Pick a module to move ⚡ out of — or drag ⚡ from one module onto one it touches. Each token moves one step.'
            : move
              ? `Moving ${move.value}⚡ out of ${name(from)}: click a lit neighbour (or drag) — as much as it has room for. Click ${name(from)} again to let go.`
              : `${name(from)} has no ⚡ of its own left to move. Click it again to let go.`,
      };
    }

    case 'use': {
      const users = ok((o) => o.use);
      if (mode.slot === null) {
        return {
          ...base,
          controls: {
            armed: users,
            open: [],
            selected: null,
            deltas: {},
            onSlotClick: (slot) => {
              const part = getPart(acting.ship.slots[slot]?.partId);
              if (part && aimsAtEnemy(abilityEffects(part), manualDamage)) act.setMode({ kind: 'use', slot });
              else act.take({ type: 'use-module', slot, ...(manualDamage > 0 ? { manualDamage } : {}) });
            },
            drag: null,
          },
          prompt: users.length ? 'Pick the module whose ability to use.' : 'No module has an ability it can use right now.',
        };
      }
      const slot = mode.slot;
      const targets = reach((t) => legal({ type: 'use-module', slot, targetSlot: t, ...(manualDamage > 0 ? { manualDamage } : {}) }), false);
      return {
        ...base,
        controls: { armed: users, open: [], selected: slot, deltas: {}, onSlotClick: () => act.setMode({ kind: 'use', slot: null }), drag: null },
        targets,
        aimed: shipEngine.defaultTargetSlot(CONTENT, enemy),
        prompt: `${name(slot)}: pick its target on the enemy.`,
      };
    }

    case 'item': {
      if (!mode.cardId) return { ...base, prompt: 'Pick an item from your hand.' };
      const card = getCard(mode.cardId);
      const precise = (card?.effects ?? []).some((e) => e.type === 'damage-module');
      const effects = card ? activeEffects(card) : [];
      const cardId = mode.cardId;
      const targets = aimsAtEnemy(effects, manualDamage)
        ? reach((t) => legal({ type: 'play-card', cardId, targetSlot: t, ...(manualDamage > 0 ? { manualDamage } : {}) }), precise)
        : [];
      return {
        ...base,
        targets,
        aimed: shipEngine.defaultTargetSlot(CONTENT, enemy),
        prompt: `${card?.name ?? 'Item'}: pick its target on the enemy. Items land without a roll.`,
      };
    }
  }
}

/** What clicking an enemy module does with the action in hand. */
export function targetAction(mode: CombatMode | null, manualDamage: number, target: SlotIndex, spend?: number) {
  const manual = manualDamage > 0 ? { manualDamage } : {};
  if (mode?.kind === 'attack' && mode.slot !== null) {
    return { type: 'attack' as const, slot: mode.slot, targetSlot: target, ...(spend !== undefined ? { spend } : {}) };
  }
  if (mode?.kind === 'use' && mode.slot !== null) return { type: 'use-module' as const, slot: mode.slot, targetSlot: target, ...manual };
  if (mode?.kind === 'item' && mode.cardId) return { type: 'play-card' as const, cardId: mode.cardId, targetSlot: target, ...manual };
  return null;
}
