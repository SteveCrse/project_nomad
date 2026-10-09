import type {
  Battle,
  CardId,
  DownAction,
  GameConfig,
  GameState,
  ItemCard,
  PartCard,
  PlayerState,
  RerouteMove,
  Ship,
  SideRef,
  SlotIndex,
} from '@engine/types';
import { abilityEffects, attackOf, combat, expectedDamage, hitChance, outputOf, ship as shipEngine } from '@engine';
import { CONTENT, getCard, getPart } from '@data';

/**
 * View-side derivations for the combat surface.
 *
 * The engine owns legality; this module only asks it questions on behalf of
 * the UI so buttons can be disabled with the engine's own reason attached.
 */

export const battleOf = (state: GameState): Battle | null =>
  state.combat ? { party: state.party, combat: state.combat } : null;

/** A down, and the engine's verdict on it. */
export interface Option {
  action: DownAction;
  /** null when the down can be spent this way right now. */
  error: string | null;
}

/** Everything one module on the acting ship can do with a down. */
export interface ModuleOptions {
  slot: SlotIndex;
  part: PartCard;
  energy: number;
  max: number;
  destroyed: boolean;
  /** Attack strength, 0 when it has none. */
  attack: number;
  /** d6 ≤ energy, as a fraction. */
  hitChance: number;
  /** attack × energy ÷ 6 — the rules' balancing line. */
  expected: number;
  /** What a generate action adds. */
  output: number;
  fire: Option | null;
  generate: Option | null;
  use: Option | null;
}

const verdict = (battle: Battle, config: GameConfig, side: SideRef, action: DownAction): Option => ({
  action,
  error: combat.actionError(CONTENT, battle, config, side, action),
});

/**
 * The enemy module the seat is aiming at: the one picked on the table if it
 * can be reached, else where an attack lands by default — the front shield,
 * or the cockpit once the shields are gone.
 */
export function aimAt(state: GameState, picked: SlotIndex | null, precision = false): SlotIndex | undefined {
  const enemy = state.combat?.enemy.ship;
  if (!enemy) return undefined;
  if (picked !== null && shipEngine.canTarget(CONTENT, enemy, picked, precision)) return picked;
  return shipEngine.defaultTargetSlot(CONTENT, enemy);
}

/** Every module on the acting seat's ship, with what each can do. */
export function moduleOptions(
  state: GameState,
  config: GameConfig,
  side: SideRef,
  picked: SlotIndex | null,
  manualDamage = 0,
): ModuleOptions[] {
  const battle = battleOf(state);
  if (!battle) return [];
  const ship = combat.shipOf(battle, side);
  if (!ship) return [];

  return ship.slots.map((slot): ModuleOptions => {
    const part = getPart(slot.partId)!;
    const attack = attackOf(part);
    const output = outputOf(part);
    const abilities = abilityEffects(part);
    const targetSlot = aimAt(state, picked, !!part.targetsModule);
    const aimed = targetSlot !== undefined ? { targetSlot } : {};
    return {
      slot: slot.index,
      part,
      energy: slot.energy,
      max: part.energyCapacity,
      destroyed: slot.destroyed,
      attack,
      hitChance: hitChance(slot.energy),
      expected: expectedDamage(attack, slot.energy),
      output,
      fire: attack > 0 ? verdict(battle, config, side, { type: 'attack', slot: slot.index, ...aimed }) : null,
      generate: shipEngine.isProducer(part)
        ? verdict(battle, config, side, { type: 'generate', slot: slot.index })
        : null,
      use:
        abilities.length > 0
          ? verdict(battle, config, side, {
              type: 'use-module',
              slot: slot.index,
              ...aimed,
              ...(manualDamage > 0 ? { manualDamage } : {}),
            })
          : null,
    };
  });
}

/** The items in the acting seat's hand, each with the engine's verdict. */
export function handOptions(
  state: GameState,
  config: GameConfig,
  side: SideRef,
  picked: SlotIndex | null,
  manualDamage = 0,
): { cardId: CardId; card: ItemCard; option: Option }[] {
  const battle = battleOf(state);
  if (!battle || side.kind !== 'player') return [];
  const player = combat.playerOf(battle, side.id);
  if (!player) return [];
  return player.hand.flatMap((cardId) => {
    const card = getCard(cardId);
    if (card?.kind !== 'item') return [];
    const precision = (card.effects ?? []).some((e) => e.type === 'damage-module');
    const targetSlot = aimAt(state, picked, precision);
    const action: DownAction = {
      type: 'play-card',
      cardId,
      ...(targetSlot !== undefined ? { targetSlot } : {}),
      ...(manualDamage > 0 ? { manualDamage } : {}),
    };
    return [{ cardId, card, option: verdict(battle, config, side, action) }];
  });
}

/** Downed teammates the acting seat could revive, when the switch allows it. */
export function reviveOptions(state: GameState, config: GameConfig, side: SideRef): { player: PlayerState; option: Option }[] {
  const battle = battleOf(state);
  if (!battle || config.downedPlayer !== 'revive') return [];
  return state.party.players
    .filter((p) => p.destroyed && battle.combat.participants.includes(p.id))
    .map((player) => ({ player, option: verdict(battle, config, side, { type: 'revive', playerId: player.id }) }));
}

/**
 * A reroute being built, played out: the ship as it would be, what each
 * module can still send this reroute, and why the plan can't go ahead if it
 * can't.
 */
export function reroutePlan(ship: Ship, moves: RerouteMove[]) {
  const run = shipEngine.runReroute(CONTENT, ship, moves);
  return {
    ship: run.ship,
    error: run.error,
    /** ⚡ each module started with that it can still pass on. */
    sendable: run.sendable,
    /** Room left in each module, with the plan applied. */
    room: run.ship.slots.map((s) => shipEngine.roomIn(CONTENT, s)),
  };
}

/** Whether rerouting is free on this ship right now. */
export const freeReroute = (ship: Ship): boolean => shipEngine.hasFreeReroute(CONTENT, ship);

export function activePlayer(state: GameState): PlayerState | undefined {
  const side = state.combat?.turn;
  if (side?.kind !== 'player') return undefined;
  return state.party.players.find((p) => p.id === side.id);
}

export const sideLabelOf = (state: GameState, side: SideRef | undefined): string => {
  const battle = battleOf(state);
  if (!battle || !side) return '—';
  return combat.sideName(battle, side);
};

/** The seat the enemy is aiming at right now. */
export function aggroOf(state: GameState) {
  const battle = battleOf(state);
  return battle ? combat.aggroTarget(battle) : null;
}

export const scrapCapacityFor = (player: PlayerState, config: GameConfig): number =>
  config.scrapCap + shipEngine.scrapCapBonus(CONTENT, player.ship);

/** The cockpit's numbers, for gauges. */
export function cockpitStats(ship: Ship) {
  const cockpit = shipEngine.cockpitOf(CONTENT, ship);
  return {
    energy: cockpit?.slot.energy ?? 0,
    max: cockpit?.part.energyCapacity ?? 0,
    destroyed: !!cockpit?.slot.destroyed,
    part: cockpit?.part,
  };
}

/** The size readout for a ship under the rule in play. */
export function sizeReadout(ship: Ship, config: GameConfig) {
  const used = shipEngine.sizeUsed(CONTENT, ship, config.shipSizeRule);
  const limit = shipEngine.sizeLimit(CONTENT, ship, config.shipSizeRule);
  const unit = config.shipSizeRule === 'slots' ? 'SLOTS' : config.shipSizeRule === 'budget' ? 'UPKEEP' : 'MODULES';
  return {
    used,
    limit,
    unit,
    over: used > limit,
    /** "MODULES 3", "SLOTS 2/3". */
    text: Number.isFinite(limit) ? `${unit} ${used}/${limit}` : `${unit} ${used}`,
  };
}

/** The key the effects layer finds a module by. */
export const fxKey = (side: SideRef, slot: SlotIndex): string => `${side.kind}:${side.id}:${slot}`;
