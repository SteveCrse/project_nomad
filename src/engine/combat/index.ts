import type {
  Battle,
  CombatLogEntry,
  CombatState,
  DownAction,
  DownResult,
  SideRef,
  SlotRef,
  TableEvent,
} from '../types/combat';
import type { ActionCard, Card, CardEffect, DiceSpec, PartCard } from '../types/card';
import type { EnemyInstance } from '../types/enemy';
import type { PlayerState } from '../types/player';
import type { Ship } from '../types/ship';
import type { GameConfig } from '../types/config';
import type { PlayerId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Rng } from '../rng';
import {
  ACTION_LABEL,
  HIT_DIE,
  abilityEffects,
  activeEffects,
  attackOf,
  costOf,
  effectParam,
  outputOf,
} from '../cards';
import { isDamageEffect } from '../effects';
import { actionDeckSize, buildActionDecks, cycleActionCard } from '../deck';
import {
  canTarget,
  chargeSlot,
  cockpitIndex,
  defaultTargetSlot,
  hasFreeReroute,
  hitSlot,
  isOnline,
  isProducer,
  liveSlots,
  restoreCockpit,
  rerouteError,
  rollDice,
  roomIn,
  runReroute,
  setEnergy,
} from '../ship';
import type { DiceRoll, HitReport } from '../ship';

/**
 * Combat — the 1st-down system.
 *
 * A seat gets `downCount` downs. Destroying a module with the 1st-down icon
 * ends its turn and hands it to the next seat — the enemy never gets a look
 * in; running out of downs hands it to the enemy instead. Either way the turn
 * waits for the seat to end it, so nothing flips over before the table has
 * seen what happened. The enemy plays its downs off one action deck each,
 * restarts at Down 1 whenever it earns a 1st down of its own, and gives the
 * turn back to the seat after the one that failed.
 *
 * Every attack is a d6 against the energy on the module firing it, and every
 * hit takes energy off the module it lands on — energy is hit chance and HP at
 * once. A module at 0 is offline; one more hit destroys it; destroying the
 * cockpit destroys the ship.
 *
 * Everything that happens is also recorded as a `TableEvent` — every die
 * rolled, every hit, every ⚡ moved — so the table can be shown it rather than
 * just handed the result.
 */

export const sideKey = (side: SideRef): string => `${side.kind}:${side.id}`;
export const sameSide = (a: SideRef, b: SideRef): boolean => a.kind === b.kind && a.id === b.id;
export const playerSide = (id: PlayerId): SideRef => ({ kind: 'player', id });
export const enemySide = (combat: CombatState): SideRef => ({ kind: 'enemy', id: combat.enemy.instanceId });

// ---------------------------------------------------------------- accessors

export const playerOf = (battle: Battle, id: PlayerId | null | undefined): PlayerState | undefined =>
  id ? battle.party.players.find((p) => p.id === id) : undefined;

export const livingParticipants = (battle: Battle): PlayerState[] =>
  battle.combat.participants
    .map((id) => playerOf(battle, id))
    .filter((p): p is PlayerState => !!p && !p.destroyed);

export const currentSide = (combat: CombatState): SideRef => combat.turn;

export function shipOf(battle: Battle, side: SideRef): Ship | undefined {
  return side.kind === 'player' ? playerOf(battle, side.id)?.ship : battle.combat.enemy.ship;
}

export function sideName(battle: Battle, side: SideRef): string {
  return side.kind === 'player'
    ? (playerOf(battle, side.id)?.label ?? side.id)
    : battle.combat.enemy.name;
}

/**
 * Who the enemy is shooting at: the aggressor — the player who attacked last.
 * Before anyone has, it's the seat whose turn handed the enemy its turn, and
 * past that the first seat still flying.
 */
export function aggroTarget(battle: Battle): PlayerId | null {
  const alive = livingParticipants(battle);
  const pick = (id: PlayerId | null) => alive.find((p) => p.id === id)?.id ?? null;
  return pick(battle.combat.aggressor) ?? pick(battle.combat.handedBy) ?? alive[0]?.id ?? null;
}

/** The ship on the far side of a fight from `side`, and which ship that is. */
function opposingShip(
  battle: Battle,
  side: SideRef,
  target?: PlayerId,
): { side: SideRef; ship: Ship } | null {
  if (side.kind === 'player') {
    return { side: enemySide(battle.combat), ship: battle.combat.enemy.ship };
  }
  const id = target ?? aggroTarget(battle);
  const player = livingParticipants(battle).find((p) => p.id === id);
  return player ? { side: playerSide(player.id), ship: player.ship } : null;
}

// ---------------------------------------------------------------- writes

function logged(
  combat: CombatState,
  side: SideRef,
  message: string,
  tone: CombatLogEntry['tone'] = 'info',
): CombatState {
  return { ...combat, log: [...combat.log, { round: combat.round, side, message, tone }] };
}

/** Record something the table should be shown. */
function emit(battle: Battle, event: TableEvent): Battle {
  return { ...battle, combat: { ...battle.combat, events: [...battle.combat.events, event] } };
}

export function withShip(battle: Battle, side: SideRef, ship: Ship): Battle {
  if (side.kind === 'player') {
    return {
      ...battle,
      party: {
        ...battle.party,
        players: battle.party.players.map((p) =>
          p.id === side.id ? { ...p, ship, destroyed: ship.destroyed } : p,
        ),
      },
    };
  }
  return { ...battle, combat: { ...battle.combat, enemy: { ...battle.combat.enemy, ship } } };
}

function withPlayer(battle: Battle, id: PlayerId, patch: Partial<PlayerState>): Battle {
  return {
    ...battle,
    party: {
      ...battle.party,
      players: battle.party.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    },
  };
}

// ---------------------------------------------------------------- dice

/** A dice spec's hit rule as printed: "≤ 2", "≥ 5", or null when the dice are summed. */
export function diceRule(spec: DiceSpec): string | null {
  const parts: string[] = [];
  if (spec.hitUnder !== undefined) parts.push(`≤ ${spec.hitUnder}`);
  if (spec.hitOver !== undefined) parts.push(`≥ ${spec.hitOver}`);
  return parts.length > 0 ? parts.join(' or ') : null;
}

/** Record a card's own dice as a roll the table sees. */
function emitDice(
  battle: Battle,
  side: SideRef,
  label: string,
  spec: DiceSpec,
  roll: DiceRoll,
  outcome: string,
): Battle {
  if (roll.dice.length === 0) return battle;
  return emit(battle, {
    kind: 'roll',
    side,
    label,
    die: spec.die,
    dice: roll.dice,
    rule: diceRule(spec),
    success: roll.hitRule ? roll.hits > 0 : null,
    outcome,
  });
}

// ---------------------------------------------------------------- legality

const damageEffects = (card: Card): CardEffect[] =>
  activeEffects(card).filter((e) => isDamageEffect(e.type));

/** Does a set of effects need an enemy module picked? */
const aimsAtEnemy = (effects: CardEffect[], manualDamage = 0): boolean =>
  effects.some(
    (e) => isDamageEffect(e.type) || e.type === 'emp' || (e.type === 'manual' && manualDamage > 0),
  );

/** Why an action can't be taken, or null when it can. */
export function actionError(
  content: Content,
  battle: Battle,
  config: GameConfig,
  side: SideRef,
  action: DownAction,
): string | null {
  const combat = battle.combat;
  if (combat.outcome) return 'combat is over';
  if (!sameSide(combat.turn, side)) return 'not this side’s turn';
  if (combat.turnOver) return 'the turn is over — end it';
  if (combat.down >= config.downCount) return 'no downs left this turn';

  const ship = shipOf(battle, side);
  if (!ship || ship.destroyed) return 'no ship';
  const player = side.kind === 'player' ? playerOf(battle, side.id) : undefined;

  /** The module in a slot of the acting ship, checked online. */
  const own = (slot: SlotIndex): { part: PartCard; error: string | null } | null => {
    const at = ship.slots[slot];
    const part = partOf(content, at?.partId);
    if (!at || !part) return null;
    if (at.destroyed) return { part, error: `${part.name} is destroyed` };
    if (!isOnline(at)) return { part, error: `${part.name} is offline — 0⚡` };
    return { part, error: null };
  };

  /** Is `targetSlot` a module this action can reach on the far side? */
  const aimError = (targetSlot: SlotIndex | undefined, precision: boolean, target?: PlayerId) => {
    const far = opposingShip(battle, side, target);
    if (!far) return 'nobody left to aim at';
    const at = targetSlot ?? defaultTargetSlot(content, far.ship);
    if (!far.ship.slots[at] || far.ship.slots[at]!.destroyed) return 'that module is already gone';
    if (!canTarget(content, far.ship, at, precision)) return 'a shield stands in front of it';
    return null;
  };

  switch (action.type) {
    case 'pass':
      return null;

    case 'attack': {
      const module = own(action.slot);
      if (!module) return 'empty slot';
      if (attackOf(module.part) <= 0) return `${module.part.name} has no attack`;
      if (module.error) return module.error;
      const cost = costOf(damageEffects(module.part));
      if (cost > ship.slots[action.slot]!.energy) return `needs ${cost}⚡ to fire`;
      return aimError(action.targetSlot, !!module.part.targetsModule, action.target);
    }

    case 'generate': {
      const module = own(action.slot);
      if (!module) return 'empty slot';
      if (!isProducer(module.part)) return `${module.part.name} doesn’t generate`;
      if (module.error) return module.error;
      if (roomIn(content, ship.slots[action.slot]) <= 0) return `${module.part.name} is full`;
      return null;
    }

    case 'reroute':
      return rerouteError(content, ship, action.moves);

    case 'use-module': {
      const module = own(action.slot);
      if (!module) return 'empty slot';
      const abilities = abilityEffects(module.part);
      if (abilities.length === 0) return `${module.part.name} has no ability to use`;
      if (module.error) return module.error;
      const cost = costOf(abilities);
      if (cost > ship.slots[action.slot]!.energy) return `needs ${cost}⚡`;
      if (aimsAtEnemy(abilities, action.manualDamage)) {
        return aimError(action.targetSlot, false, action.target);
      }
      return null;
    }

    case 'play-card': {
      if (!player) return 'enemies hold no cards';
      if (!player.hand.includes(action.cardId)) return 'not in hand';
      const card = content.cards[action.cardId];
      if (!card || card.kind !== 'item') return 'not an item';
      const effects = activeEffects(card);
      if (effects.length === 0) return `${card.name} has nothing to play`;
      if (aimsAtEnemy(effects, action.manualDamage)) {
        return aimError(action.targetSlot, effects.some((e) => e.type === 'damage-module'));
      }
      return null;
    }

    case 'revive': {
      if (config.downedPlayer !== 'revive') return 'reviving is switched off';
      if (side.kind !== 'player') return 'only a teammate can revive';
      const target = playerOf(battle, action.playerId);
      if (!target || !combat.participants.includes(target.id)) return 'not in this fight';
      if (!target.destroyed) return `${target.label} is still flying`;
      return null;
    }
  }
}

// ---------------------------------------------------------------- resolution

/** A module as the log names it — "cockpit (…)" for the cockpit. */
export function moduleName(content: Content, ship: Ship, slot: SlotIndex): string {
  const name = partOf(content, ship.slots[slot]?.partId)?.name ?? 'module';
  return slot === cockpitIndex(ship) ? `cockpit (${name})` : name;
}

/** One line for a hit: what it took off which module. */
function describeHit(content: Content, before: Ship, report: HitReport, slot: SlotIndex): string {
  const part = partOf(content, before.slots[slot]?.partId);
  const name = moduleName(content, before, slot);
  if (report.negated) return `${name}: negated`;
  if (report.destroyed) return `${name} destroyed${report.firstDown ? ' — 1ST DOWN' : ''}`;
  const now = report.ship.slots[slot]?.energy ?? 0;
  return `${name} −${report.lost}⚡ (${now}/${part?.energyCapacity ?? 0})`;
}

/** Record what a hit did, for the table. */
function emitHit(battle: Battle, side: SideRef, slot: SlotIndex, report: HitReport, name: string): Battle {
  let next = battle;
  for (const soft of report.softened) {
    next = emit(next, { kind: 'drain', target: { side, slot: soft.slot }, amount: soft.amount });
  }
  return emit(next, {
    kind: 'hit',
    target: { side, slot },
    name,
    lost: report.lost,
    destroyed: report.destroyed,
    firstDown: report.firstDown,
    negated: report.negated,
  });
}

/**
 * Land a hit of `strength` on one module of the far ship, and take any
 * retaliation back. Returns whether a 1st-down module went down.
 */
function strike(
  content: Content,
  battle: Battle,
  attacker: SideRef,
  target: SideRef,
  slot: SlotIndex,
  strength: number,
): { battle: Battle; firstDown: boolean; line: string; notes: string[] } {
  const ship = shipOf(battle, target);
  if (!ship) return { battle, firstDown: false, line: 'no target', notes: [] };
  const retaliate = ship.flags.retaliate;
  const report = hitSlot(content, ship, slot, strength);
  let next = emitHit(withShip(battle, target, report.ship), target, slot, report, moduleName(content, ship, slot));
  const notes = report.notes.filter((n) => !n.endsWith('destroyed'));

  // Mines: the next enemy to land a hit takes one straight back, on whatever
  // stands in front of its own cockpit.
  if (retaliate > 0 && !report.negated) {
    const victim = shipOf(next, attacker);
    const after = shipOf(next, target)!;
    next = withShip(next, target, { ...after, flags: { ...after.flags, retaliate: 0 } });
    if (victim) {
      const at = defaultTargetSlot(content, victim);
      const back = hitSlot(content, victim, at, retaliate);
      next = emitHit(withShip(next, attacker, back.ship), attacker, at, back, moduleName(content, victim, at));
      notes.push(`retaliation: ${retaliate}⚔ back — ${describeHit(content, victim, back, at)}`);
    }
  }

  return { battle: next, firstDown: report.firstDown, line: describeHit(content, ship, report, slot), notes };
}

/** What one active ability does, off a module or a card in hand. */
function resolveAbility(
  content: Content,
  battle: Battle,
  effect: CardEffect,
  ctx: {
    side: SideRef;
    name: string;
    card: Card;
    targetSlot: SlotIndex | undefined;
    target: PlayerId | undefined;
    manualDamage: number;
    rng: Rng;
  },
): { battle: Battle; firstDown: boolean; lines: string[]; attacked: boolean } {
  const lines: string[] = [];
  let next = battle;
  let firstDown = false;
  let attacked = false;
  const far = opposingShip(next, ctx.side, ctx.target);
  const aim = far ? (ctx.targetSlot ?? defaultTargetSlot(content, far.ship)) : -1;

  const own = shipOf(next, ctx.side);
  const flags = (patch: Partial<Ship['flags']>) => {
    const ship = shipOf(next, ctx.side);
    if (ship) next = withShip(next, ctx.side, { ...ship, flags: { ...ship.flags, ...patch } });
  };

  switch (effect.type) {
    case 'damage':
    case 'damage-module': {
      if (!far) break;
      const roll = rollDice(effect.dice, ctx.rng);
      const strength = Math.max(0, effectParam(effect, 'power') + roll.bonus);
      if (effect.dice) next = emitDice(next, ctx.side, `${ctx.card.name} — its own dice`, effect.dice, roll, `${strength}⚔`);
      const hit = strike(content, next, ctx.side, far.side, aim, strength);
      next = hit.battle;
      firstDown ||= hit.firstDown;
      attacked = true;
      lines.push(`${ctx.name} plays ${ctx.card.name}: a ${strength}⚔ hit — ${hit.line}.`, ...hit.notes.map((n) => `  ${n}`));
      break;
    }

    case 'emp': {
      if (!far) break;
      const target = moduleName(content, far.ship, aim);
      const had = far.ship.slots[aim]?.energy ?? 0;
      next = withShip(next, far.side, setEnergy(far.ship, aim, 0));
      next = emit(next, { kind: 'drain', target: { side: far.side, slot: aim }, amount: had });
      attacked = true;
      lines.push(`${ctx.name} fires ${ctx.card.name}: ${sideName(next, far.side)}’s ${target} drained to 0⚡ — offline, not destroyed.`);
      break;
    }

    case 'restore-shield': {
      if (!own) break;
      const cockpit = cockpitIndex(own);
      const charged = chargeSlot(content, own, cockpit, effectParam(effect, 'amount'));
      next = withShip(next, ctx.side, charged.ship);
      if (charged.added > 0) next = emit(next, { kind: 'charge', target: { side: ctx.side, slot: cockpit }, amount: charged.added });
      lines.push(`${ctx.name} recharges the cockpit with ${ctx.card.name}: +${charged.added}⚡.`);
      break;
    }

    case 'negate-next-attack':
      flags({ negateNext: (own?.flags.negateNext ?? 0) + 1 });
      lines.push(`${ctx.name} primes ${ctx.card.name} — the next hit on the ship is negated.`);
      break;

    case 'retaliate': {
      const amount = effectParam(effect, 'amount');
      flags({ retaliate: (own?.flags.retaliate ?? 0) + amount });
      lines.push(`${ctx.name} arms ${ctx.card.name} — the next enemy to hit takes ${amount}⚔ back.`);
      break;
    }

    case 'manual': {
      if (ctx.manualDamage > 0 && far) {
        const hit = strike(content, next, ctx.side, far.side, aim, ctx.manualDamage);
        next = hit.battle;
        firstDown ||= hit.firstDown;
        attacked = true;
        lines.push(`${ctx.name} resolves ${ctx.card.name} by hand: a ${ctx.manualDamage}⚔ hit — ${hit.line}.`);
        break;
      }
      lines.push(`${ctx.name} uses ${ctx.card.name} — resolve its text at the table.`);
      break;
    }

    default:
      break;
  }
  return { battle: next, firstDown, lines, attacked };
}

/**
 * Resolve a single down for either side. The turn bookkeeping — counting the
 * down, ending the turn — is the caller's (`playerDown`, `enemyDown`): this
 * only applies the action and reports what it did.
 */
export function resolveDown(
  content: Content,
  battle: Battle,
  config: GameConfig,
  side: SideRef,
  action: DownAction,
  rng: Rng,
): { battle: Battle; result: DownResult } {
  const illegal = actionError(content, battle, config, side, action);
  if (illegal) {
    return { battle, result: { action, spent: false, firstDown: false, illegal, log: [illegal] } };
  }

  let next = battle;
  const lines: string[] = [];
  let firstDown = false;
  let free = false;
  let attacked = false;
  const name = sideName(battle, side);
  const ship = shipOf(battle, side)!;
  const at = (slot: SlotIndex): SlotRef => ({ side, slot });

  switch (action.type) {
    case 'pass':
      lines.push(`${name} holds the down.`);
      break;

    /**
     * The attack roll. A d6 against the energy on the module firing: at or
     * under it hits. 1⚡ lands 1 time in 6, 3⚡ half the time, 6⚡ always.
     */
    case 'attack': {
      const slot = ship.slots[action.slot]!;
      const part = partOf(content, slot.partId)!;
      const effects = damageEffects(part);
      const cost = costOf(effects);
      let shooter = cost > 0 ? setEnergy(ship, action.slot, slot.energy - cost) : ship;
      const placed = shooter.slots[action.slot]!.energy;
      const roll = rng.roll('d6');
      const hits = roll <= placed;
      if (config.attackSpendsEnergy) shooter = setEnergy(shooter, action.slot, 0);
      next = withShip(next, side, shooter);
      const spentNow = slot.energy - shooter.slots[action.slot]!.energy;
      if (spentNow > 0) next = emit(next, { kind: 'drain', target: at(action.slot), amount: spentNow });
      attacked = true;

      const far = opposingShip(next, side, action.target)!;
      const precise = !!part.targetsModule;
      const aim = action.targetSlot ?? (side.kind === 'enemy' && precise
        ? cockpitIndex(far.ship)
        : defaultTargetSlot(content, far.ship));
      const aimed = moduleName(content, far.ship, aim);
      const odds = `${Math.min(placed, HIT_DIE)}/${HIT_DIE}`;
      const spent = config.attackSpendsEnergy && placed > 0 ? ` · ${placed}⚡ spent` : '';
      next = emit(next, {
        kind: 'roll',
        side,
        label: `${part.name} → ${sideName(next, far.side)}’s ${aimed}`,
        die: 'd6',
        dice: [roll],
        rule: `≤ ${placed}`,
        success: hits,
        outcome: hits ? 'HIT' : 'No hit',
        from: at(action.slot),
        to: { side: far.side, slot: aim },
      });

      if (!hits) {
        lines.push(
          `${name} fires ${part.name} at ${sideName(next, far.side)}’s ${aimed} — rolled ${roll} vs ${placed}⚡ (${odds}): miss${spent}.`,
        );
        break;
      }
      // Dice on the card add to the payload; the attack roll already decided
      // whether it lands.
      let bonus = 0;
      for (const effect of effects) {
        if (!effect.dice) continue;
        const extra = rollDice(effect.dice, rng);
        bonus += extra.bonus;
        next = emitDice(next, side, `${part.name} — its own dice`, effect.dice, extra, `+${extra.bonus}⚔`);
      }
      const strength = attackOf(part) + bonus;
      const hit = strike(content, next, side, far.side, aim, strength);
      next = hit.battle;
      firstDown = hit.firstDown;
      lines.push(
        `${name} fires ${part.name} at ${sideName(next, far.side)}’s ${aimed} — rolled ${roll} vs ${placed}⚡ (${odds}): ` +
          `HIT for ${strength}⚔ — ${hit.line}${spent}.`,
        ...hit.notes.map((n) => `  ${n}`),
      );
      break;
    }

    /** A generate action: the producer's output lands on the producer. */
    case 'generate': {
      const part = partOf(content, ship.slots[action.slot]!.partId)!;
      const effect = activeEffects(part).find((e) => e.type === 'generate');
      const roll = rollDice(effect?.dice, rng);
      const won = !roll.hitRule || roll.hits > 0;
      const rolled = roll.dice.length > 0 ? ` [${roll.dice.join(',')}]` : '';
      const loss = effect ? effectParam(effect, 'loseOnMiss') : 0;
      const amount = outputOf(part) + (roll.hitRule ? 0 : roll.bonus);
      if (effect?.dice) {
        next = emitDice(next, side, `${part.name} — generate`, effect.dice, roll, won ? `+${amount}⚡` : `the gamble misses — −${loss}⚡`);
      }
      if (won) {
        const charged = chargeSlot(content, ship, action.slot, amount);
        next = withShip(next, side, charged.ship);
        next = emit(next, { kind: 'charge', target: at(action.slot), amount: charged.added });
        lines.push(
          `${name} runs ${part.name}${rolled}: +${charged.added}⚡ ` +
            `(${charged.ship.slots[action.slot]!.energy}/${part.energyCapacity}).`,
        );
      } else {
        const had = ship.slots[action.slot]!.energy;
        const left = Math.max(0, had - loss);
        next = withShip(next, side, setEnergy(ship, action.slot, left));
        if (had - left > 0) next = emit(next, { kind: 'drain', target: at(action.slot), amount: had - left });
        lines.push(`${name} runs ${part.name}${rolled}: the gamble misses — −${loss}⚡.`);
      }
      break;
    }

    /** One down moves charge between connected modules, every token one step. */
    case 'reroute': {
      const run = runReroute(content, ship, action.moves);
      next = withShip(next, side, run.ship);
      next = emit(next, { kind: 'reroute', side, moves: action.moves });
      free = hasFreeReroute(content, ship);
      const legs = action.moves.map((m) => {
        const dest = partOf(content, ship.slots[m.to]?.partId);
        return `${m.amount}⚡ ${moduleName(content, ship, m.from)} → ${moduleName(content, ship, m.to)}${dest?.role === 'SHD' ? ' (charging it)' : ''}`;
      });
      lines.push(`${name} reroutes ${legs.join(', ')}${free ? ' — free, a redistributor handles it' : ''}.`);
      break;
    }

    /** Use another module: everything active it prints except attack and generate. */
    case 'use-module': {
      const slot = ship.slots[action.slot]!;
      const part = partOf(content, slot.partId)!;
      const abilities = abilityEffects(part);
      const cost = costOf(abilities);
      if (cost > 0) {
        next = withShip(next, side, setEnergy(ship, action.slot, slot.energy - cost));
        next = emit(next, { kind: 'drain', target: at(action.slot), amount: cost });
      }
      for (const effect of abilities) {
        const out = resolveAbility(content, next, effect, {
          side,
          name,
          card: part,
          targetSlot: action.targetSlot,
          target: action.target,
          manualDamage: action.manualDamage ?? 0,
          rng,
        });
        next = out.battle;
        firstDown ||= out.firstDown;
        attacked ||= out.attacked;
        lines.push(...out.lines);
      }
      break;
    }

    /** An item off the hand: single use, and its attacks land without a roll. */
    case 'play-card': {
      const player = playerOf(next, side.id)!;
      const card = content.cards[action.cardId]!;
      const hand = player.hand.slice();
      hand.splice(hand.indexOf(action.cardId), 1);
      next = withPlayer(next, player.id, { hand });
      for (const effect of activeEffects(card)) {
        const out = resolveAbility(content, next, effect, {
          side,
          name,
          card,
          targetSlot: action.targetSlot,
          target: undefined,
          manualDamage: action.manualDamage ?? 0,
          rng,
        });
        next = out.battle;
        firstDown ||= out.firstDown;
        attacked ||= out.attacked;
        lines.push(...out.lines);
      }
      if (lines.length === 0) lines.push(`${name} plays ${card.name}.`);
      break;
    }

    /** Downed-player rule `revive`: the cockpit comes back with 1⚡. */
    case 'revive': {
      const target = playerOf(next, action.playerId)!;
      const ship = restoreCockpit(content, target.ship, 1);
      next = withPlayer(next, target.id, { ship, destroyed: false });
      next = emit(next, { kind: 'charge', target: { side: playerSide(target.id), slot: cockpitIndex(ship) }, amount: 1 });
      lines.push(`${name} spends a down reviving ${target.label} — cockpit back online with 1⚡.`);
      break;
    }
  }

  // The aggressor is whoever attacked last, hit or miss.
  let combat = next.combat;
  if (attacked && side.kind === 'player') combat = { ...combat, aggressor: side.id };
  if (firstDown) combat = { ...combat, firstDowns: combat.firstDowns + 1 };
  for (const line of lines) combat = logged(combat, side, line, firstDown ? 'convert' : attacked ? 'damage' : 'info');
  next = settle(next, combat);

  return {
    battle: next,
    result: { action, spent: !free, firstDown, log: lines },
  };
}

/** Decide whether the fight is over. */
function settle(battle: Battle, combat: CombatState): Battle {
  const next = { ...battle, combat };
  if (combat.outcome) return next;
  if (combat.enemy.ship.destroyed) {
    const won = { ...next, combat: logged({ ...combat, outcome: 'victory' as const }, enemySide(combat), `${combat.enemy.name} is destroyed.`, 'system') };
    return emit(won, { kind: 'outcome', outcome: 'victory', label: `${combat.enemy.name} destroyed` });
  }
  const alive = combat.participants.some((id) => !battle.party.players.find((p) => p.id === id)?.destroyed);
  if (!alive) return emit({ ...next, combat: { ...combat, outcome: 'defeat' } }, { kind: 'outcome', outcome: 'defeat', label: 'The fight is lost' });
  return next;
}

// ---------------------------------------------------------------- turn flow

/**
 * Start of a side's turn. Nothing refills — unused energy simply carries
 * over — but a card that bleeds the ship (Infested Railgun) bleeds it now.
 */
function upkeep(content: Content, battle: Battle, side: SideRef): Battle {
  const ship = shipOf(battle, side);
  if (!ship) return battle;
  const drain = liveSlots(content, ship)
    .filter((m) => isOnline(m.slot))
    .reduce((sum, m) => sum + (m.part.drainPerTurn ?? 0), 0);
  if (drain <= 0) return battle;
  let drained = 0;
  let next = battle;
  const slots = ship.slots.map((s) => {
    if (s.destroyed || s.energy <= 0) return s;
    const taken = Math.min(s.energy, drain);
    drained += taken;
    next = emit(next, { kind: 'drain', target: { side, slot: s.index }, amount: taken });
    return { ...s, energy: s.energy - taken };
  });
  next = withShip(next, side, { ...ship, slots });
  return {
    ...next,
    combat: logged(next.combat, side, `Upkeep: an infestation bleeds ${drained}⚡ off the ship.`, 'system'),
  };
}

/** Give a seat the turn: fresh downs, then its upkeep. */
function beginPlayerTurn(content: Content, battle: Battle, id: PlayerId, round: number): Battle {
  const side = playerSide(id);
  let next: Battle = {
    ...battle,
    combat: { ...battle.combat, turn: side, down: 0, firstDowns: 0, turnOver: null, round },
  };
  next = emit(next, { kind: 'turn', side, label: `${sideName(next, side)}’s turn` });
  next = upkeep(content, next, side);
  return {
    ...next,
    combat: logged(next.combat, side, `${sideName(next, side)} takes the turn.`, 'system'),
  };
}

/**
 * Hand the turn to the seat after `after`, skipping anyone destroyed. Coming
 * back round past the last seat starts a new round. Solo, the next seat is the
 * same one, with fresh downs.
 */
export function passToNextSeat(content: Content, battle: Battle, after: PlayerId | null): Battle {
  const order = battle.combat.participants;
  const alive = new Set(livingParticipants(battle).map((p) => p.id));
  if (alive.size === 0) return battle;
  const from = after ? order.indexOf(after) : -1;
  for (let step = 1; step <= order.length; step++) {
    const index = (from + step) % order.length;
    const id = order[index]!;
    if (!alive.has(id)) continue;
    const wrapped = from >= 0 && index <= from;
    return beginPlayerTurn(content, battle, id, battle.combat.round + (wrapped ? 1 : 0));
  }
  return battle;
}

/** No 1st down in time: the enemy plays its downs. */
export function beginEnemyTurn(content: Content, battle: Battle, handedBy: PlayerId | null): Battle {
  const side = enemySide(battle.combat);
  let next: Battle = {
    ...battle,
    combat: { ...battle.combat, turn: side, down: 0, firstDowns: 0, turnOver: null, handedBy },
  };
  next = emit(next, { kind: 'turn', side, label: `${next.combat.enemy.name}’s turn` });
  next = upkeep(content, next, side);
  const upcoming = next.combat.actionDecks
    .map((d, i) => {
      const card = d.faceUp ? content.cards[d.faceUp] : undefined;
      return `D${i + 1} ${card?.kind === 'action' ? ACTION_LABEL[card.action] : '—'}`;
    })
    .join(' · ');
  return {
    ...next,
    combat: logged(next.combat, side, `${next.combat.enemy.name} takes the turn — ${upcoming}.`, 'system'),
  };
}

/** The next seat to fly after this one — who a 1st down would hand to. */
export function seatAfter(battle: Battle, after: PlayerId | null): PlayerId | null {
  const order = battle.combat.participants;
  const alive = new Set(livingParticipants(battle).map((p) => p.id));
  const from = after ? order.indexOf(after) : -1;
  for (let step = 1; step <= order.length; step++) {
    const id = order[(from + step) % order.length]!;
    if (alive.has(id)) return id;
  }
  return null;
}

/**
 * A seat spends one of its downs. A 1st down ends the turn on the spot —
 * the downs left are forfeit — and so does the last down, or losing the
 * ship to a retaliation. The turn then waits for the seat to end it.
 */
export function playerDown(
  content: Content,
  battle: Battle,
  config: GameConfig,
  action: DownAction,
  rng: Rng,
): { battle: Battle; result: DownResult } {
  const side = battle.combat.turn;
  const { battle: after, result } = resolveDown(content, battle, config, side, action, rng);
  if (result.illegal || side.kind !== 'player') return { battle: after, result };

  let next: Battle = {
    ...after,
    combat: { ...after.combat, down: after.combat.down + (result.spent ? 1 : 0) },
  };
  if (next.combat.outcome) return { battle: next, result };

  const name = sideName(next, side);
  if (result.firstDown) {
    const to = playerOf(next, seatAfter(next, side.id))?.label ?? 'the next seat';
    next = { ...next, combat: logged({ ...next.combat, turnOver: 'first-down' }, side, `1ST DOWN — ${name}’s turn is over; it goes to ${to}.`, 'convert') };
    return { battle: emit(next, { kind: 'first-down', side, label: `1st down — ${name}` }), result };
  }
  if (playerOf(next, side.id)?.destroyed) {
    return { battle: { ...next, combat: { ...next.combat, turnOver: 'destroyed' } }, result };
  }
  if (next.combat.down >= config.downCount) {
    next = { ...next, combat: logged({ ...next.combat, turnOver: 'out-of-downs' }, side, `${name} is out of downs without a 1st down — the enemy is next.`, 'system') };
  }
  return { battle: next, result };
}

/**
 * The seat ends its turn. After a 1st down the next seat goes; otherwise —
 * out of downs, or calling it early — the enemy does.
 */
export function endPlayerTurn(content: Content, battle: Battle): Battle {
  const side = battle.combat.turn;
  if (side.kind !== 'player' || battle.combat.outcome) return battle;
  if (battle.combat.turnOver === 'first-down') return passToNextSeat(content, battle, side.id);
  const early = battle.combat.turnOver === null;
  const next = early
    ? { ...battle, combat: logged(battle.combat, side, `${sideName(battle, side)} ends the turn without a 1st down.`, 'system') }
    : battle;
  return beginEnemyTurn(content, next, side.id);
}

/**
 * What an enemy action card turns into, or why it can't be carried out.
 * Supplied by `engine/ai`, which owns the enemy's choices; passed in so combat
 * doesn't have to import the planner that reads it.
 */
export type EnemyPlanner = (
  content: Content,
  battle: Battle,
  config: GameConfig,
  card: ActionCard,
) => { action: DownAction } | { reason: string };

/**
 * One enemy down, off the current down's action deck.
 *
 * Resolve the face-up card; if the enemy can't carry it out, discard it and
 * reveal the next until one resolves. Either way the deck ends with a fresh
 * card face up. A 1st down sends the enemy back to Down 1; Down 4 without one
 * hands the turn to the seat after the one that failed.
 */
export function enemyDown(
  content: Content,
  battle: Battle,
  config: GameConfig,
  rng: Rng,
  plan: EnemyPlanner,
): Battle {
  const side = battle.combat.turn;
  if (side.kind !== 'enemy' || battle.combat.outcome) return battle;

  const index = battle.combat.down;
  let next = battle;
  let deck = next.combat.actionDecks[index];
  let firstDown = false;
  let spent = false;

  const setDeck = (b: Battle, d: typeof deck): Battle =>
    d
      ? { ...b, combat: { ...b.combat, actionDecks: b.combat.actionDecks.map((x, i) => (i === index ? d : x)) } }
      : b;
  const note = (b: Battle, line: string): Battle => ({ ...b, combat: logged(b.combat, side, line, 'system') });

  if (!deck || actionDeckSize(deck) === 0) {
    next = note(next, `Down ${index + 1}: no action deck — the down is lost.`);
  } else {
    // Each card can be turned at most once per down; past that the deck has
    // nothing the enemy can do, and the down is lost.
    for (let attempt = 0; attempt < actionDeckSize(deck); attempt++) {
      const card = deck.faceUp ? content.cards[deck.faceUp] : undefined;
      if (!card || card.kind !== 'action') {
        deck = cycleActionCard(deck, rng);
        continue;
      }
      const planned = plan(content, next, config, card);
      deck = cycleActionCard(deck, rng);
      const refused = 'reason' in planned ? planned.reason : actionError(content, next, config, side, planned.action);
      if (refused || 'reason' in planned) {
        next = emit(note(next, `Down ${index + 1}: ${card.name} — can’t (${refused}). Discarded.`), {
          kind: 'action-card',
          down: index,
          cardId: card.id,
          played: false,
          reason: refused ?? '',
        });
        continue;
      }
      next = emit(note(next, `Down ${index + 1}: ${card.name}.`), { kind: 'action-card', down: index, cardId: card.id, played: true });
      const resolved = resolveDown(content, next, config, side, planned.action, rng);
      next = resolved.battle;
      firstDown = resolved.result.firstDown;
      spent = true;
      break;
    }
    if (!spent) next = note(next, `Down ${index + 1}: nothing in the deck can be carried out — the down is lost.`);
    next = setDeck(next, deck);
  }

  if (next.combat.outcome) return next;
  if (firstDown) {
    next = emit(next, { kind: 'first-down', side, label: `1st down — ${next.combat.enemy.name}` });
    return {
      ...next,
      combat: logged({ ...next.combat, down: 0 }, side, `1ST DOWN — ${next.combat.enemy.name} starts again at Down 1.`, 'convert'),
    };
  }
  const down = index + 1;
  if (down >= config.downCount) {
    return passToNextSeat(content, { ...next, combat: { ...next.combat, down } }, next.combat.handedBy);
  }
  return { ...next, combat: { ...next.combat, down } };
}

/** Build the opening state for a fight and give the first seat the turn. */
export function startCombat(
  content: Content,
  party: Battle['party'],
  enemy: EnemyInstance,
  participants: PlayerId[],
  config: GameConfig,
  rng: Rng,
): Battle {
  const clean = (ship: Ship): Ship => ({ ...ship, flags: { negateNext: 0, retaliate: 0 } });
  const combat: CombatState = {
    round: 1,
    participants,
    enemy: { ...enemy, ship: clean(enemy.ship) },
    turn: playerSide(participants[0] ?? ''),
    down: 0,
    firstDowns: 0,
    turnOver: null,
    aggressor: null,
    handedBy: null,
    actionDecks: buildActionDecks(content.actions, config.downCount, rng),
    log: [],
    events: [],
  };
  const battle: Battle = {
    party: {
      ...party,
      players: party.players.map((p) => (participants.includes(p.id) ? { ...p, ship: clean(p.ship) } : p)),
    },
    combat,
  };
  const first = livingParticipants(battle)[0];
  return first ? beginPlayerTurn(content, battle, first.id, 1) : battle;
}
