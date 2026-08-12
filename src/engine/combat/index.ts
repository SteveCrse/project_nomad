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
import {
  apCostOf,
  capacityOf,
  chargeSlot,
  effectOf,
  energyCostOf,
  diceCountOf,
  hasFreeReroute,
  isAbsorber,
  isOffensive,
  liveModules,
  rerouteEnergy,
  resetDownSetFlags,
  rollPayload,
  runUpkeep,
} from '../ship';

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
  combat.enemies.filter((e) => e.hp > 0);

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
  /** Damage that got through to the hull. */
  hull: number;
  /** Damage eaten by shields. */
  absorbed: number;
  /** Damage cancelled outright (Defense Turret). */
  negated: number;
  /** Damage returned to the attacker (Mines). */
  retaliated: number;
  /** Module knocked out by a module-targeted attack. */
  disabledSlot?: SlotIndex;
  notes: string[];
}

/**
 * Push damage into a ship: negation, then flat reduction, then charged
 * shields, then hull. Module-targeted attacks skip the hull and knock the
 * module out instead.
 */
function damageShip(
  content: Content,
  ship: Ship,
  amount: number,
  targetSlot?: SlotIndex,
): { ship: Ship; report: DamageReport } {
  const report: DamageReport = { hull: 0, absorbed: 0, negated: 0, retaliated: 0, notes: [] };
  let next = ship;
  let remaining = Math.max(0, amount);

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

  if (targetSlot !== undefined) {
    const target = next.slots[targetSlot];
    if (target && target.partId && !target.disabled) {
      const drained = Math.min(target.energy, remaining);
      remaining -= drained;
      report.absorbed += drained;
      const slots = next.slots.slice();
      const knockedOut = remaining > 0;
      slots[targetSlot] = { ...target, energy: target.energy - drained, disabled: knockedOut };
      next = { ...next, slots };
      if (knockedOut) {
        report.disabledSlot = targetSlot;
        report.notes.push(`${partOf(content, target.partId)?.name ?? 'module'} knocked out`);
      }
      remaining = 0;
    }
    return { ship: next, report };
  }

  // Charged shields soak before the hull does.
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

  if (remaining > 0) {
    report.hull = Math.min(remaining, next.hp);
    next = { ...next, hp: Math.max(0, next.hp - remaining) };
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
          p.id === side.id ? { ...p, ship, destroyed: ship.hp <= 0 } : p,
        ),
      },
    };
  }
  return {
    ...battle,
    combat: {
      ...battle.combat,
      enemies: battle.combat.enemies.map((e) =>
        e.instanceId === side.id ? { ...e, ship, hp: ship.hp } : e,
      ),
    },
  };
}

/** Apply damage to a side's HP pool, after shields. */
export function applyDamage(
  content: Content,
  battle: Battle,
  target: SideRef,
  amount: number,
  targetSlot?: SlotIndex,
): { battle: Battle; report: DamageReport } {
  const ship = shipOf(battle, target);
  if (!ship) {
    return {
      battle,
      report: { hull: 0, absorbed: 0, negated: 0, retaliated: 0, notes: ['no such target'] },
    };
  }
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
      if (part.partType !== 'active-module') return `${part.name} is passive`;
      if (isOffensive(part) && slot.usedThisDownSet) return 'already fired this set of downs';
      const ap = apCostOf(part);
      if (player && ap > player.ap) return `needs ${ap} AP`;
      const cost = energyCostOf(part, config, action.diceCount);
      if (cost > slot.energy + spareEnergyFor(content, battle, side)) {
        return `needs ${cost}⚡ in the module`;
      }
      if (effectOf(part).kind === 'damage' && livingEnemies(battle.combat).length === 0 && side.kind === 'player') {
        return 'nothing left to shoot';
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
      if (availableLooseEnergy(content, battle, side) < cost) return `needs ${cost}⚡ spare`;
      return null;
    }

    case 'reroute-energy': {
      const from = ship.slots[action.from];
      const to = ship.slots[action.to];
      if (!from?.partId || !to?.partId) return 'pick two modules';
      if (action.from === action.to) return 'same module';
      if (from.energy <= 0) return 'source is empty';
      if (capacityOf(content, to) - to.energy <= 0) return 'destination is full';
      return null;
    }

    case 'play-card': {
      if (!player) return 'enemies hold no cards';
      if (!player.hand.includes(action.cardId)) return 'not in hand';
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

/** Loose energy a side can spend: the player's pool, plus generator charge. */
function availableLooseEnergy(content: Content, battle: Battle, side: SideRef): number {
  const player = side.kind === 'player' ? playerOf(battle, side.id) : undefined;
  const ship = shipOf(battle, side);
  const fromGenerators = ship
    ? liveModules(content, ship)
        .filter((m) => m.part.role === 'GEN')
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
      const effect = effectOf(part);
      const diceCount = diceCountOf(part, action.diceCount);
      const energy = energyCostOf(part, config, action.diceCount);
      const ap = apCostOf(part);

      // Pay: the module's own pool first, then loose energy if a
      // redistributor can feed it. AP comes off the player.
      const fromPool = Math.min(slot.energy, energy);
      const fromSpare = energy - fromPool;
      const slots = ship.slots.slice();
      slots[action.slot] = {
        ...slot,
        energy: slot.energy - fromPool,
        usedThisDownSet: slot.usedThisDownSet || isOffensive(part),
      };
      next = withShip(next, side, { ...ship, slots });
      if (side.kind === 'player') {
        const player = playerOf(next, side.id)!;
        next = withPlayer(next, side.id, {
          ...(ap > 0 ? { ap: Math.max(0, player.ap - ap) } : {}),
          ...(fromSpare > 0 ? { energy: Math.max(0, player.energy - fromSpare) } : {}),
        });
        if (fromSpare > 0) lines.push(`  redistributor feeds ${fromSpare}⚡ into ${part.name}.`);
      }

      switch (effect.kind) {
        case 'damage': {
          const target = action.target ?? defaultTarget(next, side);
          if (!target) {
            lines.push(`${part.name} has nothing to shoot.`);
            break;
          }
          const penalty = side.kind === 'player' ? (playerOf(next, side.id)?.powerPenalty ?? 0) : 0;
          const payload = rollPayload(part, diceCount, rng);
          dice = payload.dice;
          const raw = Math.max(0, payload.value - penalty);
          const hit = applyDamage(content, next, target, raw, action.targetSlot);
          next = hit.battle;
          const landed = hit.report.hull + hit.report.absorbed;
          damage = config.thresholdCountsShielded ? landed : hit.report.hull;
          lines.push(
            `${name} fires ${part.name}${dice.length ? ` [${dice.join(',')}]` : ''} at ` +
              `${sideName(next, target)} for ${raw}⚔ — ${hit.report.hull} hull` +
              (hit.report.absorbed ? `, ${hit.report.absorbed} soaked` : '') +
              (hit.report.negated ? ', negated' : '') +
              '.',
          );
          for (const note of hit.report.notes) lines.push(`  ${note}`);
          if (hit.report.retaliated > 0) {
            const back = applyDamage(content, next, side, hit.report.retaliated);
            next = back.battle;
            lines.push(`  retaliation: ${name} takes ${hit.report.retaliated}⚔.`);
          }
          break;
        }

        case 'gain-energy': {
          const payload = rollPayload(part, diceCount, rng);
          dice = payload.dice;
          // Dice with a hit rule gamble: no hits means the loss instead.
          const won = !part.dice || payload.hits > 0 || payload.value > 0;
          const delta = won ? effect.amount : -(effect.loseOnMiss ?? 0);
          const shipNow = shipOf(next, side)!;
          if (delta >= 0) {
            const charged = chargeSlot(content, shipNow, action.slot, delta);
            next = withShip(next, side, charged.ship);
            lines.push(
              `${name} runs ${part.name}${dice.length ? ` [${dice.join(',')}]` : ''}: +${delta - charged.overflow}⚡.`,
            );
          } else {
            const current = shipNow.slots[action.slot]!;
            const slotsNow = shipNow.slots.slice();
            slotsNow[action.slot] = { ...current, energy: Math.max(0, current.energy + delta) };
            next = withShip(next, side, { ...shipNow, slots: slotsNow });
            lines.push(
              `${name} runs ${part.name}${dice.length ? ` [${dice.join(',')}]` : ''}: ${delta}⚡. Ouch.`,
            );
          }
          break;
        }

        case 'negate-next-attack': {
          const shipNow = shipOf(next, side)!;
          next = withShip(next, side, {
            ...shipNow,
            flags: { ...shipNow.flags, negateNext: shipNow.flags.negateNext + 1 },
          });
          lines.push(`${name} primes ${part.name} — the next attack is negated.`);
          break;
        }

        case 'retaliate': {
          const shipNow = shipOf(next, side)!;
          next = withShip(next, side, {
            ...shipNow,
            flags: { ...shipNow.flags, retaliate: shipNow.flags.retaliate + effect.amount },
          });
          lines.push(`${name} arms ${part.name} — next attacker takes ${effect.amount}⚔.`);
          break;
        }

        case 'manual': {
          const manual = Math.max(0, action.manualDamage ?? 0);
          if (manual > 0) {
            const target = action.target ?? defaultTarget(next, side);
            if (target) {
              const hit = applyDamage(content, next, target, manual, action.targetSlot);
              next = hit.battle;
              damage = config.thresholdCountsShielded
                ? hit.report.hull + hit.report.absorbed
                : hit.report.hull;
              lines.push(
                `${name} resolves ${part.name} by hand: ${manual}⚔ to ${sideName(next, target)}.`,
              );
              break;
            }
          }
          lines.push(`${name} activates ${part.name} — resolve its text at the table.`);
          break;
        }
      }
      break;
    }

    case 'charge-shield': {
      const amount = Math.max(1, action.amount);
      const cost = Math.max(0, config.energyCostChargeShield) * amount;
      next = spendLooseEnergy(content, next, side, cost);
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
      const before = shipNow.slots[action.to]!.energy;
      const rerouted = rerouteEnergy(content, shipNow, action.from, action.to, action.amount, config);
      next = withShip(next, side, rerouted);
      const moved = rerouted.slots[action.to]!.energy - before;
      // What a Redistributor is for: moving charge without burning a down.
      free = hasFreeReroute(content, shipNow);
      lines.push(
        `${name} reroutes ${moved}⚡ across the grid${free ? ' — free, the redistributor handles it.' : '.'}`,
      );
      break;
    }

    case 'play-card': {
      const player = playerOf(next, side.id)!;
      const card = content.cards[action.cardId];
      const manual = Math.max(0, action.manualDamage ?? 0);
      const hand = player.hand.slice();
      hand.splice(hand.indexOf(action.cardId), 1);
      next = withPlayer(next, side.id, { hand });
      if (manual > 0) {
        const target = action.target ?? defaultTarget(next, side);
        if (target) {
          const hit = applyDamage(content, next, target, manual);
          next = hit.battle;
          damage = config.thresholdCountsShielded
            ? hit.report.hull + hit.report.absorbed
            : hit.report.hull;
        }
      }
      lines.push(`${name} plays ${card?.name ?? action.cardId}${manual ? ` for ${manual}⚔` : ''}.`);
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

/** Default target: players shoot the softest living enemy and vice versa. */
export function defaultTarget(battle: Battle, side: SideRef): SideRef | undefined {
  if (side.kind === 'player') {
    const enemies = livingEnemies(battle.combat);
    if (enemies.length === 0) return undefined;
    const weakest = enemies.reduce((a, b) => (b.hp < a.hp ? b : a));
    return { kind: 'enemy', id: weakest.instanceId };
  }
  const players = livingParticipants(battle);
  if (players.length === 0) return undefined;
  const weakest = players.reduce((a, b) => (b.ship.hp < a.ship.hp ? b : a));
  return { kind: 'player', id: weakest.id };
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
  const fresh = combat.enemies.filter((e) => e.hp <= 0 && !combat.wrecks.some((w) => w.instanceId === e.instanceId));
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

  const enemiesLeft = combat.enemies.some((e) => e.hp > 0);
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
  return !!enemy && enemy.hp > 0;
}

/**
 * Start of a side's turn: upkeep (generators tick, Infested modules bleed),
 * AP refills, offensive modules come off cooldown, a fresh set opens.
 */
export function beginTurn(content: Content, battle: Battle, config: GameConfig): Battle {
  const side = currentSide(battle.combat);
  if (!side) return battle;

  let next = battle;
  const ship = shipOf(next, side);
  if (ship) {
    const upkeep = runUpkeep(content, ship, config.energyPerTurn);
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

  if (side.kind === 'player') {
    next = withPlayer(next, side.id, { ap: config.maxAp, apMax: config.maxAp });
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

  // Everyone starts a fight with a clean grid and full AP.
  const party0: Battle['party'] = {
    ...party,
    players: party.players.map((p) =>
      participants.includes(p.id)
        ? {
            ...p,
            ap: config.maxAp,
            apMax: config.maxAp,
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
