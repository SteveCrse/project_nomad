import type {
  Battle,
  CombatLogEntry,
  CombatState,
  DownAction,
  DownResult,
  DownsState,
  SideRef,
} from '../types/combat';
import type { EnemyInstance } from '../types/enemy';
import type { PlayerState } from '../types/player';
import type { Ship } from '../types/ship';
import type { GameConfig } from '../types/config';
import { playerThreshold } from '../types/config';
import type { PlayerId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Rng } from '../rng';
import type { Card, CardEffect, PartCard } from '../types/card';
import { activeEffects, effectParam } from '../cards';
import { isDamageEffect } from '../effects';
import type { DiceRoll } from '../ship';
import {
  areAdjacent,
  capacityOf,
  chargeSlot,
  cockpitCapacity,
  cockpitCharge,
  cockpitGeneration,
  cockpitOf,
  cockpitPower,
  cockpitSlotIndex,
  energyCostOf,
  diceCountOf,
  hasFreeReroute,
  isAbsorber,
  isOffensive,
  liveModules,
  rerouteEnergy,
  resetDownSetFlags,
  rollDice,
  runUpkeep,
  shieldPool,
} from '../ship';

/**
 * Is this module limited to one activation per fresh set of downs?
 *
 * The default is no: a gun fires as often as its own pool can pay for, one
 * down each, so a full magazine is what a set of downs is spent on. A card
 * printed `oncePerSet` opts back out, and `offensiveOncePerSet` restores the
 * blanket rule for a playtest that wants to compare the two.
 */
function cappedPerSet(part: PartCard, config: GameConfig): boolean {
  return !!part.oncePerSet || (config.offensiveOncePerSet && isOffensive(part));
}

/**
 * Combat resolution — the symmetric downs system.
 *
 * Both sides run the same loop: spend up to `downCount` downs, and if the
 * damage dealt across that set reaches the *defender's* threshold, take a
 * fresh set instead of passing the turn. Reading the threshold as a defensive
 * stat is what makes rules open question #2 (players buying a higher own
 * threshold) mean anything.
 */

export const sideKey = (side: SideRef): string => `${side.kind}:${side.id}`;
export const sameSide = (a: SideRef, b: SideRef): boolean => a.kind === b.kind && a.id === b.id;

// ---------------------------------------------------------------- accessors

export const playerOf = (battle: Battle, id: PlayerId): PlayerState | undefined =>
  battle.party.players.find((p) => p.id === id);

export const enemyOf = (battle: Battle, id: string): EnemyInstance | undefined =>
  battle.combat.enemies.find((e) => e.instanceId === id);

export const livingEnemies = (combat: CombatState): EnemyInstance[] =>
  combat.enemies.filter((e) => !e.ship.destroyed);

export const livingParticipants = (battle: Battle): PlayerState[] =>
  battle.combat.participants
    .map((id) => playerOf(battle, id))
    .filter((p): p is PlayerState => !!p && !p.destroyed);

export const currentSide = (combat: CombatState): SideRef | undefined =>
  combat.order[combat.turnIndex];

export const downsFor = (combat: CombatState, side: SideRef): DownsState | undefined =>
  combat.downs[sideKey(side)];

export function shipOf(battle: Battle, side: SideRef): Ship | undefined {
  return side.kind === 'player'
    ? playerOf(battle, side.id)?.ship
    : enemyOf(battle, side.id)?.ship;
}

export function sideName(battle: Battle, side: SideRef): string {
  return side.kind === 'player'
    ? (playerOf(battle, side.id)?.label ?? side.id)
    : (enemyOf(battle, side.id)?.name ?? side.id);
}

// ---------------------------------------------------------------- threshold

/**
 * The threshold a side has to beat this set: the easiest conversion on the
 * table, i.e. the softest living opponent. Recomputed whenever a set opens,
 * so killing the soft target mid-turn raises the bar for the next set.
 */
export function thresholdFor(battle: Battle, config: GameConfig, side: SideRef): number {
  if (side.kind === 'player') {
    const enemies = livingEnemies(battle.combat);
    if (enemies.length === 0) return config.convThreshold;
    return Math.min(...enemies.map((e) => e.convThreshold));
  }
  const players = livingParticipants(battle);
  if (players.length === 0) return playerThreshold(config);
  return Math.min(...players.map((p) => playerThreshold(config, p.thresholdBonus)));
}

/** Downs per set for a side — enemies may deviate from the global default. */
export function downCountFor(battle: Battle, config: GameConfig, side: SideRef): number {
  if (side.kind === 'enemy') return enemyOf(battle, side.id)?.downCount ?? config.downCount;
  return config.downCount;
}

/** Open a fresh set of downs for a side. */
export function startDownSet(
  side: SideRef,
  threshold: number,
  total: number,
  conversions = 0,
): DownsState {
  return { side, used: 0, total, damageThisSet: 0, threshold, conversions };
}

/** Has this side hit its threshold within the current set? */
export function checkConversion(downs: DownsState): boolean {
  return downs.damageThisSet >= downs.threshold;
}

export const setExhausted = (downs: DownsState): boolean => downs.used >= downs.total;

// ---------------------------------------------------------------- logging

function logged(combat: CombatState, side: SideRef, message: string, tone: CombatLogEntry['tone'] = 'info'): CombatState {
  return { ...combat, log: [...combat.log, { round: combat.round, side, message, tone }] };
}

// ---------------------------------------------------------------- damage

export interface DamageReport {
  /** Damage eaten by shield modules. */
  absorbed: number;
  /** Damage eaten by the cockpit's own pool — the ship's last shield. */
  cockpit: number;
  /** Damage left over when everything was dry. Anything here wrecks the ship. */
  overkill: number;
  /** Damage cancelled outright (Defense Turret). */
  negated: number;
  /** Damage returned to the attacker (Mines). */
  retaliated: number;
  /** Module knocked out by a module-targeted attack. */
  disabledSlot?: SlotIndex;
  notes: string[];
}

const emptyReport = (notes: string[] = []): DamageReport => ({
  absorbed: 0,
  cockpit: 0,
  overkill: 0,
  negated: 0,
  retaliated: 0,
  notes,
});

/** Everything an attack actually put on the target, however it was soaked. */
export const damageDealt = (report: DamageReport): number =>
  report.absorbed + report.cockpit + report.overkill;

/**
 * What this attack contributes to the attacker's conversion threshold.
 * `thresholdCountsShielded` off means only what got past the shield modules —
 * i.e. what the cockpit had to eat, or what went through it — counts.
 */
export const thresholdCredit = (report: DamageReport, config: GameConfig): number =>
  config.thresholdCountsShielded ? damageDealt(report) : report.cockpit + report.overkill;

/**
 * Push damage into a ship: negation, then flat reduction, then charged shield
 * modules, then the cockpit's own pool. Damage still standing after all of
 * that has nothing left to bite on — the ship is destroyed.
 *
 * Module-targeted attacks skip the whole chain and knock one module out
 * instead. Aiming one at the cockpit resolves as a normal attack: the cockpit
 * is the ship, not a module you can shoot off it.
 */
export function damageShip(
  content: Content,
  ship: Ship,
  amount: number,
  targetSlot?: SlotIndex,
): { ship: Ship; report: DamageReport } {
  const report = emptyReport();
  let next = ship;
  let remaining = Math.max(0, amount);
  const aimed = targetSlot !== undefined && targetSlot !== cockpitSlotIndex(ship)
    ? targetSlot
    : undefined;

  if (next.flags.negateNext > 0 && remaining > 0) {
    report.negated = remaining;
    report.notes.push('attack negated');
    return {
      ship: { ...next, flags: { ...next.flags, negateNext: next.flags.negateNext - 1 } },
      report,
    };
  }

  // Shock-absorber style passives: a flat cut, paid for with a point of charge.
  for (const { slot, part } of liveModules(content, next)) {
    if (!part.damageReduction || remaining <= 0) continue;
    const charged = next.slots[slot.index];
    if (!charged || charged.energy <= 0) continue;
    const cut = Math.min(part.damageReduction, remaining);
    remaining -= cut;
    report.absorbed += cut;
    const slots = next.slots.slice();
    slots[slot.index] = { ...charged, energy: charged.energy - 1 };
    next = { ...next, slots };
    report.notes.push(`${part.name} shrugs off ${cut}`);
  }

  if (aimed !== undefined) {
    const target = next.slots[aimed];
    if (target && target.partId && !target.disabled) {
      const drained = Math.min(target.energy, remaining);
      remaining -= drained;
      report.absorbed += drained;
      const slots = next.slots.slice();
      const knockedOut = remaining > 0;
      slots[aimed] = { ...target, energy: target.energy - drained, disabled: knockedOut };
      next = { ...next, slots };
      if (knockedOut) {
        report.disabledSlot = aimed;
        report.notes.push(`${partOf(content, target.partId)?.name ?? 'module'} knocked out`);
      }
      remaining = 0;
    }
    return { ship: next, report };
  }

  // Charged shield modules soak first — they exist so the cockpit doesn't have to.
  for (const { slot, part } of liveModules(content, next)) {
    if (remaining <= 0) break;
    if (!isAbsorber(part)) continue;
    const charged = next.slots[slot.index];
    if (!charged || charged.energy <= 0) continue;
    const soaked = Math.min(charged.energy, remaining);
    remaining -= soaked;
    report.absorbed += soaked;
    const slots = next.slots.slice();
    slots[slot.index] = { ...charged, energy: charged.energy - soaked };
    next = { ...next, slots };
    report.notes.push(`${part.name} soaks ${soaked}`);
  }

  // Then the cockpit's own shield: the last charge on the ship.
  const cockpit = cockpitOf(content, next);
  if (remaining > 0 && cockpit && cockpit.slot.energy > 0) {
    const soaked = Math.min(cockpit.slot.energy, remaining);
    remaining -= soaked;
    report.cockpit += soaked;
    const slots = next.slots.slice();
    slots[cockpit.slot.index] = { ...cockpit.slot, energy: cockpit.slot.energy - soaked };
    next = { ...next, slots };
  }

  // Nothing left to soak it. This is what "killed" means now.
  // No note: `describeHit` already reads the shape of the hit off the report,
  // and `settleCasualties` announces the wreck.
  if (remaining > 0) {
    report.overkill = remaining;
    next = { ...next, destroyed: true };
  }

  if (next.flags.retaliate > 0) {
    report.retaliated = next.flags.retaliate;
    next = { ...next, flags: { ...next.flags, retaliate: 0 } };
  }

  return { ship: next, report };
}

function withShip(battle: Battle, side: SideRef, ship: Ship): Battle {
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
  return {
    ...battle,
    combat: {
      ...battle.combat,
      enemies: battle.combat.enemies.map((e) =>
        e.instanceId === side.id ? { ...e, ship } : e,
      ),
    },
  };
}

/** Push damage into a side's ship: shield modules, then cockpit, then wreck. */
export function applyDamage(
  content: Content,
  battle: Battle,
  target: SideRef,
  amount: number,
  targetSlot?: SlotIndex,
): { battle: Battle; report: DamageReport } {
  const ship = shipOf(battle, target);
  if (!ship) return { battle, report: emptyReport(['no such target']) };
  const { ship: hit, report } = damageShip(content, ship, amount, targetSlot);
  return { battle: withShip(battle, target, hit), report };
}

// ---------------------------------------------------------------- legality

/** Why an action can't be taken, or null when it can. */
export function actionError(
  content: Content,
  battle: Battle,
  config: GameConfig,
  side: SideRef,
  action: DownAction,
): string | null {
  const downs = downsFor(battle.combat, side);
  if (battle.combat.outcome) return 'combat is over';
  if (!downs) return 'not this side’s turn';
  if (setExhausted(downs)) return 'no downs left in this set';

  const ship = shipOf(battle, side);
  if (!ship) return 'no ship';
  const player = side.kind === 'player' ? playerOf(battle, side.id) : undefined;

  switch (action.type) {
    case 'pass':
      return null;

    case 'activate-module': {
      const slot = ship.slots[action.slot];
      if (!slot?.partId) return 'empty slot';
      if (slot.disabled) return 'module is knocked out';
      const part = partOf(content, slot.partId);
      if (!part) return 'unknown part';
      if (activeEffects(part).length === 0) return `${part.name} has nothing to activate`;
      if (cappedPerSet(part, config) && slot.usedThisDownSet) {
        return 'already fired this set of downs';
      }
      const cost = energyCostOf(part, config, action.diceCount);
      if (cost > slot.energy + spareEnergyFor(content, battle, side)) {
        return `needs ${cost}⚡ in the module`;
      }
      const shoots = activeEffects(part).some((e) => isDamageEffect(e.type));
      if (shoots && livingEnemies(battle.combat).length === 0 && side.kind === 'player') {
        return 'nothing left to shoot';
      }
      return null;
    }

    // The two the cockpit always offers. Neither costs ⚡ — the down is the
    // whole price, which is what keeps a stripped ship in the fight.
    case 'cockpit-attack': {
      if (cockpitPower(content, ship) <= 0) return 'this cockpit has no gun';
      if (side.kind === 'player' && livingEnemies(battle.combat).length === 0) {
        return 'nothing left to shoot';
      }
      return null;
    }

    case 'cockpit-generate': {
      if (cockpitGeneration(content, ship) <= 0) return 'this cockpit has no generator';
      if (cockpitCharge(content, ship) >= cockpitCapacity(content, ship)) {
        return 'cockpit shield is full';
      }
      return null;
    }

    case 'charge-shield': {
      const slot = ship.slots[action.slot];
      const part = partOf(content, slot?.partId);
      if (!part) return 'empty slot';
      if (!isAbsorber(part) && part.role !== 'SHD') return `${part.name} is not a shield`;
      if (!slot || capacityOf(content, slot) - slot.energy <= 0) return 'shield is full';
      const cost = Math.max(0, config.energyCostChargeShield) * Math.max(1, action.amount);
      if (availableLooseEnergy(content, battle, side, action.slot) < cost) {
        return `needs ${cost}⚡ from a neighbour`;
      }
      return null;
    }

    case 'reroute-energy': {
      if (action.transfers.length === 0) return 'nothing to reroute';
      const drained = new Set<SlotIndex>();
      // Walk a copy of the grid: a leg is judged against the state the legs
      // before it left behind, which is what lets a chain resolve in one down.
      let grid = ship;
      for (const leg of action.transfers) {
        const from = grid.slots[leg.from];
        const to = grid.slots[leg.to];
        if (!from?.partId || !to?.partId) return 'pick two modules';
        if (drained.has(leg.from)) return 'a module can only be drained once per down';
        if (!areAdjacent(grid, leg.from, leg.to)) return '⚡ only moves between neighbours';
        if (from.energy <= 0) return 'source is empty';
        if (capacityOf(content, to) - to.energy <= 0) return 'destination is full';
        drained.add(leg.from);
        grid = rerouteEnergy(content, grid, leg.from, leg.to, leg.amount, config);
      }
      return null;
    }

    case 'play-card': {
      if (!player) return 'enemies hold no cards';
      if (!player.hand.includes(action.cardId)) return 'not in hand';
      const card = content.cards[action.cardId];
      // An item's effects print their costs like a module's do, and pay out of
      // the loose ⚡ the seat is holding rather than out of a module pool.
      const cost = card ? energyCostOf(card, config, action.diceCount) : 0;
      if (cost > availableLooseEnergy(content, battle, side)) return `needs ${cost}⚡`;
      return null;
    }

    default:
      return 'unknown action';
  }
}

/**
 * Loose energy a module may draw on to cover a shortfall.
 *
 * Only ships carrying a redistributor can do it — that is exactly what the
 * RDS cards promise ("modules can use ⚡ from other modules without
 * rerouting"), and it's what keeps overflow from piling up unusable.
 */
function spareEnergyFor(content: Content, battle: Battle, side: SideRef): number {
  if (side.kind !== 'player') return 0;
  const ship = shipOf(battle, side);
  if (!ship || !hasFreeReroute(content, ship)) return 0;
  return playerOf(battle, side.id)?.energy ?? 0;
}

/**
 * Loose energy a side can spend: the player's pool, plus generator charge.
 *
 * `nearSlot` narrows the generators to the ones next to it — charge still
 * only moves between neighbours, so a shield is fed by the generator beside
 * it and not by one across the hull.
 */
function availableLooseEnergy(
  content: Content,
  battle: Battle,
  side: SideRef,
  nearSlot?: SlotIndex,
): number {
  const player = side.kind === 'player' ? playerOf(battle, side.id) : undefined;
  const ship = shipOf(battle, side);
  const fromGenerators = ship
    ? liveModules(content, ship)
        .filter((m) => m.part.role === 'GEN')
        .filter((m) => nearSlot === undefined || areAdjacent(ship, m.slot.index, nearSlot))
        .reduce((sum, m) => sum + m.slot.energy, 0)
    : 0;
  return (player?.energy ?? 0) + fromGenerators;
}

/** Spend loose energy: the player's own pool first, then generator charge. */
function spendLooseEnergy(
  content: Content,
  battle: Battle,
  side: SideRef,
  amount: number,
  nearSlot?: SlotIndex,
): Battle {
  let owed = amount;
  let next = battle;

  if (side.kind === 'player') {
    const player = playerOf(next, side.id);
    if (player) {
      const fromPool = Math.min(player.energy, owed);
      owed -= fromPool;
      next = withPlayer(next, side.id, { energy: player.energy - fromPool });
    }
  }

  if (owed <= 0) return next;
  const ship = shipOf(next, side);
  if (!ship) return next;

  const slots = ship.slots.slice();
  for (const { slot, part } of liveModules(content, ship)) {
    if (owed <= 0) break;
    if (part.role !== 'GEN') continue;
    if (nearSlot !== undefined && !areAdjacent(ship, slot.index, nearSlot)) continue;
    const current = slots[slot.index]!;
    const taken = Math.min(current.energy, owed);
    owed -= taken;
    slots[slot.index] = { ...current, energy: current.energy - taken };
  }
  return withShip(next, side, { ...ship, slots });
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

// ---------------------------------------------------------------- effects

/** What one effect did to the fight. */
interface EffectOutcome {
  battle: Battle;
  /** Damage counted toward the resolver's conversion threshold. */
  damage: number;
  lines: string[];
}

/** Everything an effect needs that isn't the effect itself. */
interface EffectContext {
  /** The card being resolved — its name, for the log. */
  card: Card;
  /** Slot the module sits in. Absent for a card played from hand. */
  slot?: SlotIndex;
  side: SideRef;
  name: string;
  /** This effect's own roll, empty when it calls for no dice. */
  roll: DiceRoll;
  target?: SideRef;
  targetSlot?: SlotIndex;
  manualDamage?: number;
}

/**
 * Resolve one effect off a card.
 *
 * This is the whole of the engine's effect vocabulary, and the reason cards
 * can be assembled in the editor: a card is a list of these, each with its own
 * numbers, and combat walks the list. Adding a *card* never comes back here.
 */
function resolveEffect(
  content: Content,
  battle: Battle,
  config: GameConfig,
  effect: CardEffect,
  ctx: EffectContext,
): EffectOutcome {
  const { card, side, name, roll } = ctx;
  const rolled = roll.dice.length > 0 ? ` [${roll.dice.join(',')}]` : '';
  const lines: string[] = [];
  let next = battle;
  let damage = 0;

  /** Attack power after the roll and any power penalty the seat is carrying. */
  const payload = (base: number): number => {
    const penalty = side.kind === 'player' ? (playerOf(next, side.id)?.powerPenalty ?? 0) : 0;
    return Math.max(0, base + roll.bonus - penalty);
  };

  /** Land one attack: tally what it credits, and take any retaliation back. */
  const strike = (target: SideRef, raw: number, targetSlot?: SlotIndex): void => {
    const shot = applyDamage(content, next, target, raw, targetSlot);
    next = shot.battle;
    damage += thresholdCredit(shot.report, config);
    lines.push(
      `${name} fires ${card.name}${rolled} at ${sideName(next, target)} ` +
        `for ${raw}⚔ — ${describeHit(shot.report)}.`,
    );
    for (const note of shot.report.notes) lines.push(`  ${note}`);
    if (shot.report.retaliated > 0) {
      next = applyDamage(content, next, side, shot.report.retaliated).battle;
      lines.push(`  retaliation: ${name} takes ${shot.report.retaliated}⚔.`);
    }
  };

  const withFlags = (patch: Partial<Ship['flags']>): void => {
    const ship = shipOf(next, side);
    if (ship) next = withShip(next, side, { ...ship, flags: { ...ship.flags, ...patch } });
  };

  switch (effect.type) {
    case 'damage':
    case 'damage-module': {
      const target = ctx.target ?? defaultTarget(content, next, side);
      if (!target) {
        lines.push(`${card.name} has nothing to shoot.`);
        break;
      }
      strike(target, payload(effectParam(effect, 'power')), ctx.targetSlot);
      break;
    }

    case 'damage-all': {
      const targets: SideRef[] =
        side.kind === 'player'
          ? livingEnemies(next.combat).map((e) => ({ kind: 'enemy', id: e.instanceId }))
          : livingParticipants(next).map((p) => ({ kind: 'player', id: p.id }));
      if (targets.length === 0) {
        lines.push(`${card.name} has nothing to shoot.`);
        break;
      }
      const raw = payload(effectParam(effect, 'power'));
      for (const target of targets) strike(target, raw);
      break;
    }

    case 'gain-energy': {
      // A hit rule turns this into a gamble: no hits and the card takes the
      // loss instead. Dice without one just add their sum to the payout.
      const won = !roll.hitRule || roll.hits > 0;
      const delta = won
        ? effectParam(effect, 'amount') + (roll.hitRule ? 0 : roll.bonus)
        : -effectParam(effect, 'loseOnMiss');

      if (ctx.slot === undefined) {
        // Played from hand: there's no module pool, so it lands in the seat's.
        if (side.kind === 'player') {
          const player = playerOf(next, side.id);
          if (player) {
            next = withPlayer(next, side.id, { energy: Math.max(0, player.energy + delta) });
            lines.push(`${name} gains ${delta}⚡ from ${card.name}.`);
          }
        }
        break;
      }

      const ship = shipOf(next, side)!;
      if (delta >= 0) {
        const charged = chargeSlot(content, ship, ctx.slot, delta);
        next = withShip(next, side, charged.ship);
        lines.push(`${name} runs ${card.name}${rolled}: +${delta - charged.overflow}⚡.`);
      } else {
        const current = ship.slots[ctx.slot]!;
        const slots = ship.slots.slice();
        slots[ctx.slot] = { ...current, energy: Math.max(0, current.energy + delta) };
        next = withShip(next, side, { ...ship, slots });
        lines.push(`${name} runs ${card.name}${rolled}: ${delta}⚡. Ouch.`);
      }
      break;
    }

    case 'restore-shield': {
      const ship = shipOf(next, side);
      if (!ship) break;
      const cockpit = cockpitOf(content, ship);
      if (!cockpit) break;
      const amount = effectParam(effect, 'amount');
      const charged = chargeSlot(content, ship, cockpit.slot.index, amount);
      next = withShip(next, side, charged.ship);
      lines.push(
        `${name} patches the cockpit shield with ${card.name}: +${amount - charged.overflow}⚡ ` +
          `(${cockpitCharge(content, charged.ship)}/${cockpitCapacity(content, charged.ship)}).`,
      );
      break;
    }

    case 'negate-next-attack': {
      const ship = shipOf(next, side);
      withFlags({ negateNext: (ship?.flags.negateNext ?? 0) + 1 });
      lines.push(`${name} primes ${card.name} — the next attack is negated.`);
      break;
    }

    case 'retaliate': {
      const ship = shipOf(next, side);
      const amount = effectParam(effect, 'amount');
      withFlags({ retaliate: (ship?.flags.retaliate ?? 0) + amount });
      lines.push(`${name} arms ${card.name} — next attacker takes ${amount}⚔.`);
      break;
    }

    case 'manual': {
      const manual = Math.max(0, ctx.manualDamage ?? 0);
      const target = ctx.target ?? defaultTarget(content, next, side);
      if (manual > 0 && target) {
        const shot = applyDamage(content, next, target, manual, ctx.targetSlot);
        next = shot.battle;
        damage += thresholdCredit(shot.report, config);
        lines.push(
          `${name} resolves ${card.name} by hand: ${manual}⚔ to ${sideName(next, target)}.`,
        );
        break;
      }
      lines.push(`${name} activates ${card.name} — resolve its text at the table.`);
      break;
    }

    default:
      // Passive effects (absorb, generate, drain, the event ones) are read
      // where they apply — upkeep, the damage chain, the board — not fired.
      break;
  }

  return { battle: next, damage, lines };
}

// ---------------------------------------------------------------- resolution

/** Resolve a single down: apply the action, roll any dice, tally damage. */
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
    return {
      battle,
      result: {
        action,
        damageDealt: 0,
        diceRolled: [],
        converted: false,
        spent: false,
        illegal,
        log: [illegal],
      },
    };
  }

  let next = battle;
  const lines: string[] = [];
  let damage = 0;
  let dice: number[] = [];
  /** Set by actions that don't cost the side a down. */
  let free = false;
  const name = sideName(battle, side);

  switch (action.type) {
    case 'pass':
      lines.push(`${name} holds the down.`);
      break;

    case 'activate-module': {
      const ship = shipOf(next, side)!;
      const slot = ship.slots[action.slot]!;
      const part = partOf(content, slot.partId)!;
      const energy = energyCostOf(part, config, action.diceCount);

      // Pay: the module's own pool first, then loose energy if a
      // redistributor can feed it. The down itself is the other half of the
      // cost, and it's spent by the caller either way.
      const fromPool = Math.min(slot.energy, energy);
      const fromSpare = energy - fromPool;
      const slots = ship.slots.slice();
      slots[action.slot] = {
        ...slot,
        energy: slot.energy - fromPool,
        usedThisDownSet: slot.usedThisDownSet || cappedPerSet(part, config),
      };
      next = withShip(next, side, { ...ship, slots });
      if (side.kind === 'player' && fromSpare > 0) {
        const player = playerOf(next, side.id)!;
        next = withPlayer(next, side.id, {
          energy: Math.max(0, player.energy - fromSpare),
        });
        lines.push(`  redistributor feeds ${fromSpare}⚡ into ${part.name}.`);
      }

      // Every effect the card prints, in printed order, each rolling its own
      // dice: a card that shoots *and* charges resolves both off one down, and
      // each reads its own numbers off its own parameters.
      for (const effect of activeEffects(part)) {
        const roll = rollDice(effect.dice, diceCountOf(effect, action.diceCount), rng);
        dice = [...dice, ...roll.dice];
        const outcome = resolveEffect(content, next, config, effect, {
          card: part,
          slot: action.slot,
          side,
          name,
          roll,
          target: action.target,
          targetSlot: action.targetSlot,
          manualDamage: action.manualDamage,
        });
        next = outcome.battle;
        damage += outcome.damage;
        lines.push(...outcome.lines);
      }
      break;
    }

    /**
     * The cockpit's basic attack. No ⚡ leaves the ship for this: the down is
     * the cost, so a seat that has been shot down to bare metal still has
     * something to spend a turn on.
     */
    case 'cockpit-attack': {
      const ship = shipOf(next, side)!;
      const cockpit = cockpitOf(content, ship)!;
      const target = action.target ?? defaultTarget(content, next, side);
      if (!target) {
        lines.push(`${name} has nothing to shoot.`);
        break;
      }
      const penalty = side.kind === 'player' ? (playerOf(next, side.id)?.powerPenalty ?? 0) : 0;
      const raw = Math.max(0, cockpitPower(content, ship) - penalty);
      const hit = applyDamage(content, next, target, raw, action.targetSlot);
      next = hit.battle;
      damage = thresholdCredit(hit.report, config);
      lines.push(
        `${name} takes a shot with ${cockpit.part.name} at ${sideName(next, target)} ` +
          `for ${raw}⚔ — ${describeHit(hit.report)}.`,
      );
      for (const note of hit.report.notes) lines.push(`  ${note}`);
      if (hit.report.retaliated > 0) {
        const back = applyDamage(content, next, side, hit.report.retaliated);
        next = back.battle;
        lines.push(`  retaliation: ${name} takes ${hit.report.retaliated}⚔.`);
      }
      break;
    }

    /** The cockpit's basic generator: a down of defence instead of offence. */
    case 'cockpit-generate': {
      const ship = shipOf(next, side)!;
      const cockpit = cockpitOf(content, ship)!;
      const output = cockpitGeneration(content, ship);
      const charged = chargeSlot(content, ship, cockpit.slot.index, output);
      next = withShip(next, side, charged.ship);
      lines.push(
        `${name} runs the ${cockpit.part.name} generator: +${output - charged.overflow}⚡ ` +
          `on the cockpit shield (${cockpitCharge(content, charged.ship)}/${cockpitCapacity(content, charged.ship)}).`,
      );
      break;
    }

    case 'charge-shield': {
      const amount = Math.max(1, action.amount);
      const cost = Math.max(0, config.energyCostChargeShield) * amount;
      next = spendLooseEnergy(content, next, side, cost, action.slot);
      const shipNow = shipOf(next, side)!;
      const charged = chargeSlot(content, shipNow, action.slot, amount);
      next = withShip(next, side, charged.ship);
      const part = partOf(content, shipNow.slots[action.slot]?.partId);
      lines.push(
        `${name} charges ${part?.name ?? 'shield'} by ${amount - charged.overflow}⚡ (cost ${cost}⚡).`,
      );
      break;
    }

    case 'reroute-energy': {
      const shipNow = shipOf(next, side)!;
      let grid = shipNow;
      let moved = 0;
      for (const leg of action.transfers) {
        const before = grid.slots[leg.to]!.energy;
        grid = rerouteEnergy(content, grid, leg.from, leg.to, leg.amount, config);
        const landed = grid.slots[leg.to]!.energy - before;
        moved += landed;
        lines.push(
          `  ${partOf(content, shipNow.slots[leg.from]?.partId)?.name ?? 'module'} → ` +
            `${partOf(content, shipNow.slots[leg.to]?.partId)?.name ?? 'module'}: ${landed}⚡.`,
        );
      }
      next = withShip(next, side, grid);
      // What a Redistributor is for: moving charge without burning a down.
      free = hasFreeReroute(content, shipNow);
      lines.unshift(
        `${name} reroutes ${moved}⚡ across ${action.transfers.length} link(s)` +
          `${free ? ' — free, the redistributor handles it.' : '.'}`,
      );
      break;
    }

    /**
     * An item off the seat's hand. It resolves through the same effect
     * vocabulary a module does — it just has no slot of its own, so its ⚡
     * comes out of the seat's loose charge and its payout goes back there.
     */
    case 'play-card': {
      const player = playerOf(next, side.id)!;
      const card = content.cards[action.cardId];
      const hand = player.hand.slice();
      hand.splice(hand.indexOf(action.cardId), 1);
      next = withPlayer(next, side.id, { hand });
      lines.push(`${name} plays ${card?.name ?? action.cardId}.`);
      if (!card) break;

      const cost = energyCostOf(card, config, action.diceCount);
      if (cost > 0) next = spendLooseEnergy(content, next, side, cost);

      for (const effect of activeEffects(card)) {
        const roll = rollDice(effect.dice, diceCountOf(effect, action.diceCount), rng);
        dice = [...dice, ...roll.dice];
        const outcome = resolveEffect(content, next, config, effect, {
          card,
          side,
          name,
          roll,
          target: action.target,
          manualDamage: action.manualDamage,
        });
        next = outcome.battle;
        damage += outcome.damage;
        lines.push(...outcome.lines);
      }
      break;
    }
  }

  // Spend the down and tally it against the threshold.
  const key = sideKey(side);
  const downs = next.combat.downs[key]!;
  const updated: DownsState = {
    ...downs,
    used: downs.used + (free ? 0 : 1),
    damageThisSet: downs.damageThisSet + damage,
  };
  const converted = checkConversion(updated);

  let combat: CombatState = { ...next.combat, downs: { ...next.combat.downs, [key]: updated } };
  for (const line of lines) combat = logged(combat, side, line, damage > 0 ? 'damage' : 'info');
  next = { ...next, combat };

  // Mirror the set counters onto the sides themselves, for the HUD.
  next = syncSideCounters(next, side, updated);
  next = { ...next, combat: settleCasualties(next) };

  return {
    battle: next,
    result: { action, damageDealt: damage, diceRolled: dice, converted, spent: !free, log: lines },
  };
}

/** One line for where an attack landed: shields, cockpit, or straight through. */
function describeHit(report: DamageReport): string {
  if (report.negated) return 'negated';
  const parts: string[] = [];
  if (report.absorbed) parts.push(`${report.absorbed} soaked by shields`);
  if (report.cockpit) parts.push(`${report.cockpit} off the cockpit shield`);
  if (report.overkill) parts.push(`${report.overkill} with nothing left to soak it — destroyed`);
  return parts.length > 0 ? parts.join(', ') : 'nothing got through';
}

/**
 * Default target: players shoot the softest living enemy and vice versa.
 * "Softest" is now the thinnest shield pool — charged shields plus whatever
 * the cockpit is still holding — since that's what a ship dies through.
 */
export function defaultTarget(
  content: Content,
  battle: Battle,
  side: SideRef,
): SideRef | undefined {
  const thinnest = <T extends { ship: Ship }>(candidates: T[]): T | undefined =>
    candidates.length === 0
      ? undefined
      : candidates.reduce((a, b) =>
          shieldPool(content, b.ship) < shieldPool(content, a.ship) ? b : a,
        );

  if (side.kind === 'player') {
    const weakest = thinnest(livingEnemies(battle.combat));
    return weakest ? { kind: 'enemy', id: weakest.instanceId } : undefined;
  }
  const weakest = thinnest(livingParticipants(battle));
  return weakest ? { kind: 'player', id: weakest.id } : undefined;
}

function syncSideCounters(battle: Battle, side: SideRef, downs: DownsState): Battle {
  if (side.kind === 'player') {
    return withPlayer(battle, side.id, {
      downsUsed: downs.used,
      damageThisDownSet: downs.damageThisSet,
    });
  }
  return {
    ...battle,
    combat: {
      ...battle.combat,
      enemies: battle.combat.enemies.map((e) =>
        e.instanceId === side.id
          ? { ...e, downsUsed: downs.used, damageThisDownSet: downs.damageThisSet }
          : e,
      ),
    },
  };
}

/** Move wrecks aside and decide whether the fight is over. */
function settleCasualties(battle: Battle): CombatState {
  let combat = battle.combat;
  const fresh = combat.enemies.filter(
    (e) => e.ship.destroyed && !combat.wrecks.some((w) => w.instanceId === e.instanceId),
  );
  if (fresh.length > 0) {
    combat = { ...combat, wrecks: [...combat.wrecks, ...fresh] };
    for (const wreck of fresh) {
      combat = logged(
        combat,
        { kind: 'enemy', id: wreck.instanceId },
        `${wreck.name} is wrecked.`,
        'system',
      );
    }
  }

  const enemiesLeft = combat.enemies.some((e) => !e.ship.destroyed);
  const playersLeft = battle.party.players.some(
    (p) => combat.participants.includes(p.id) && !p.destroyed,
  );

  if (!enemiesLeft && !combat.outcome) {
    combat = { ...combat, outcome: 'victory' };
  } else if (!playersLeft && !combat.outcome) {
    combat = { ...combat, outcome: 'defeat' };
  }
  return combat;
}

// ---------------------------------------------------------------- turn flow

/**
 * Advance the fight: a side that hit its threshold takes a fresh set of downs
 * (the rules' first-down conversion), otherwise the turn passes.
 */
export function advanceTurn(
  content: Content,
  battle: Battle,
  config: GameConfig,
): { battle: Battle; converted: boolean } {
  const side = currentSide(battle.combat);
  if (!side || battle.combat.outcome) return { battle, converted: false };

  const downs = downsFor(battle.combat, side);
  if (downs && checkConversion(downs)) {
    const ship = shipOf(battle, side);
    let next = battle;
    if (ship) next = withShip(next, side, { ...ship, slots: resetDownSetFlags(ship.slots) });

    const fresh = startDownSet(
      side,
      thresholdFor(next, config, side),
      downCountFor(next, config, side),
      downs.conversions + 1,
    );
    let combat = { ...next.combat, downs: { ...next.combat.downs, [sideKey(side)]: fresh } };
    combat = logged(
      combat,
      side,
      `${sideName(next, side)} converts (${downs.damageThisSet}/${downs.threshold}) — fresh set of downs.`,
      'convert',
    );
    next = syncSideCounters({ ...next, combat }, side, fresh);
    return { battle: next, converted: true };
  }

  return { battle: passTurn(content, battle, config), converted: false };
}

/** Hand the turn to the next side that can still act. */
export function passTurn(content: Content, battle: Battle, config: GameConfig): Battle {
  const combat = battle.combat;
  const order = combat.order;
  if (order.length === 0) return battle;

  let index = combat.turnIndex;
  let round = combat.round;
  for (let step = 0; step < order.length + 1; step++) {
    index += 1;
    if (index >= order.length) {
      index = 0;
      round += 1;
    }
    const candidate = order[index]!;
    if (isSideAlive(battle, candidate)) {
      return beginTurn(content, { ...battle, combat: { ...combat, turnIndex: index, round } }, config);
    }
  }
  return battle;
}

export function isSideAlive(battle: Battle, side: SideRef): boolean {
  if (side.kind === 'player') {
    const player = playerOf(battle, side.id);
    return !!player && !player.destroyed;
  }
  const enemy = enemyOf(battle, side.id);
  return !!enemy && !enemy.ship.destroyed;
}

/**
 * Start of a side's turn: upkeep (generators tick, Infested modules bleed),
 * offensive modules come off cooldown, a fresh set of downs opens.
 */
export function beginTurn(content: Content, battle: Battle, config: GameConfig): Battle {
  const side = currentSide(battle.combat);
  if (!side) return battle;

  let next = battle;
  const ship = shipOf(next, side);
  if (ship) {
    const upkeep = runUpkeep(content, ship, config.energyPerTurn, config.weaponsDrawFromReactor);
    next = withShip(next, side, { ...upkeep.ship, slots: resetDownSetFlags(upkeep.ship.slots) });

    let combat = next.combat;
    if (upkeep.generated > 0) {
      combat = logged(combat, side, `Upkeep: +${upkeep.generated}⚡ generated.`, 'system');
    }
    if (upkeep.drained > 0) {
      combat = logged(combat, side, `Upkeep: ${upkeep.drained}⚡ bled off by an infestation.`, 'system');
    }
    // Overflow only survives if something on the ship can redistribute it.
    if (upkeep.overflow > 0 && side.kind === 'player') {
      const player = playerOf(next, side.id)!;
      const rds = liveModules(content, upkeep.ship).some((m) => m.part.role === 'RDS');
      if (rds) {
        next = withPlayer(next, side.id, { energy: player.energy + upkeep.overflow });
        combat = logged(combat, side, `Overflow: ${upkeep.overflow}⚡ held by the redistributor.`, 'system');
      }
    }
    next = { ...next, combat };
  }

  const fresh = startDownSet(
    side,
    thresholdFor(next, config, side),
    downCountFor(next, config, side),
  );
  next = {
    ...next,
    combat: { ...next.combat, downs: { ...next.combat.downs, [sideKey(side)]: fresh } },
  };
  next = syncSideCounters(next, side, fresh);
  return {
    ...next,
    combat: logged(
      next.combat,
      side,
      `${sideName(next, side)} takes the turn — threshold ${fresh.threshold}.`,
      'system',
    ),
  };
}

/** Build the opening battle state for a fight. */
export function startCombat(
  content: Content,
  party: Battle['party'],
  enemies: EnemyInstance[],
  participants: PlayerId[],
  config: GameConfig,
): Battle {
  const order: SideRef[] = [
    ...participants.map((id): SideRef => ({ kind: 'player', id })),
    ...enemies.map((e): SideRef => ({ kind: 'enemy', id: e.instanceId })),
  ];

  const combat: CombatState = {
    round: 1,
    participants,
    order,
    turnIndex: 0,
    downs: {},
    enemies,
    log: [],
    wrecks: [],
  };

  // Everyone starts a fight with a clean grid and a fresh set of downs.
  const party0: Battle['party'] = {
    ...party,
    players: party.players.map((p) =>
      participants.includes(p.id)
        ? {
            ...p,
            downsUsed: 0,
            damageThisDownSet: 0,
            ship: {
              ...p.ship,
              slots: resetDownSetFlags(p.ship.slots),
              flags: { negateNext: 0, retaliate: 0 },
            },
          }
        : p,
    ),
  };

  return beginTurn(content, { party: party0, combat }, config);
}
