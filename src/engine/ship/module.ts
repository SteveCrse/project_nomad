import type { ModuleEffect, PartCard } from '../types/card';
import type { GameConfig } from '../types/config';
import type { Ship, ShipSlot } from '../types/ship';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Rng } from '../rng';

/**
 * Reading a module's behaviour off its card.
 *
 * Everything here derives from the structured fields on `PartCard` — never
 * from a card id — so new content stays a data edit.
 */

/** What activating this module does. Passives have nothing to activate. */
export function effectOf(part: PartCard): ModuleEffect {
  if (part.effect) return part.effect;
  if (part.partType === 'active-module') {
    return part.power ? { kind: 'damage' } : { kind: 'manual' };
  }
  return { kind: 'manual' };
}

export const isActive = (part: PartCard): boolean => part.partType === 'active-module';

/** Offensive modules are the ones limited to once per fresh set of downs. */
export const isOffensive = (part: PartCard): boolean =>
  isActive(part) && effectOf(part).kind === 'damage';

/**
 * A charged shield soaks damage before it reaches the hull. Active SHD
 * modules (a Defense Turret) spend their charge on their own action instead,
 * so they only soak when the card says so.
 */
export const isAbsorber = (part: PartCard): boolean =>
  part.role === 'SHD' &&
  (part.energyCapacity ?? 0) > 0 &&
  (part.absorbs ?? part.partType === 'passive-module');

/** Energy this activation costs from the module's own pool. */
export function energyCostOf(part: PartCard, config: GameConfig, diceCount = 1): number {
  const base = part.energyCost ?? 0;
  const perDie = part.dice?.count === 'variable' ? Math.max(1, diceCount) : 1;
  return Math.max(0, Math.round(base * perDie * config.energyCostMult));
}

export function apCostOf(part: PartCard): number {
  return part.apCost ?? 0;
}

/** How many dice this activation rolls. */
export function diceCountOf(part: PartCard, requested?: number): number {
  if (!part.dice) return 0;
  if (part.dice.count === 'variable') return Math.max(1, requested ?? 1);
  return part.dice.count;
}

export interface RollOutcome {
  /** Damage or energy, depending on the effect. */
  value: number;
  dice: number[];
  hits: number;
}

/**
 * Roll a module's payload. Dice with a hit rule pay out `perHit` per hit
 * (Laser Array); dice without one are summed on top of the printed power.
 */
export function rollPayload(part: PartCard, count: number, rng: Rng): RollOutcome {
  const base = part.power ?? 0;
  if (!part.dice || count <= 0) return { value: base, dice: [], hits: 0 };

  const dice = rng.rollMany(count, part.dice.die);
  const { hitUnder, hitOver, perHit } = part.dice;
  if (hitUnder === undefined && hitOver === undefined) {
    return { value: base + dice.reduce((a, b) => a + b, 0), dice, hits: dice.length };
  }
  const hits = dice.filter(
    (d) => (hitUnder !== undefined && d <= hitUnder) || (hitOver !== undefined && d >= hitOver),
  ).length;
  return { value: base + hits * (perHit ?? 1), dice, hits };
}

/** Slots holding a live module, with the card resolved. */
export function liveModules(
  content: Content,
  ship: Ship,
): { slot: ShipSlot; part: PartCard }[] {
  const out: { slot: ShipSlot; part: PartCard }[] = [];
  for (const slot of ship.slots) {
    if (slot.disabled) continue;
    const part = partOf(content, slot.partId);
    if (part && part.partType !== 'cockpit') out.push({ slot, part });
  }
  return out;
}

/** Total energy sitting in module pools. */
export function storedEnergy(ship: Ship): number {
  return ship.slots.reduce((sum, s) => sum + s.energy, 0);
}

/** Capacity of a slot's module, 0 when empty. */
export function capacityOf(content: Content, slot: ShipSlot): number {
  return partOf(content, slot.partId)?.energyCapacity ?? 0;
}

/** Any equipped redistributor makes energy movement free of a down. */
export function hasFreeReroute(content: Content, ship: Ship): boolean {
  return liveModules(content, ship).some((m) => m.part.freeReroute || m.part.role === 'RDS');
}

/** Scrap cap bonus contributed by equipped modules (e.g. Cargo Bay). */
export function scrapCapBonus(content: Content, ship: Ship): number {
  return liveModules(content, ship).reduce((sum, m) => sum + (m.part.scrapCapBonus ?? 0), 0);
}
