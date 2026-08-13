import type { DiceSpec, PartCard } from '../types/card';
import type { GameConfig } from '../types/config';
import type { Ship, ShipSlot } from '../types/ship';
import type { Content } from '../content';
import { partOf } from '../content';
import { activeEffects } from '../cards';
import { isDamageEffect } from '../effects';
import type { Rng } from '../rng';

/**
 * Reading a module's behaviour off its card.
 *
 * Everything here derives from the card's effect list and the flat fields
 * compiled from it — never from a card id — so new content stays a data edit.
 */

export const isActive = (part: PartCard): boolean => part.partType === 'active-module';

/** Offensive modules are the ones a blanket once-per-set rule would cap. */
export const isOffensive = (part: PartCard): boolean =>
  isActive(part) && activeEffects(part).some((e) => isDamageEffect(e.type));

/**
 * A charged shield soaks damage before the cockpit has to — the cards that
 * print an `absorb` effect. Active SHD modules (a Defense Turret) spend their
 * charge on their own action instead, so they don't carry one.
 *
 * A cockpit is always an absorber: its pool is the ship's basic shield, and
 * the last one standing.
 */
export const isAbsorber = (part: PartCard): boolean =>
  (part.energyCapacity ?? 0) > 0 && (part.partType === 'cockpit' || !!part.absorbs);

/**
 * Energy this activation costs from the card's own pool.
 *
 * Takes the shape rather than the card so an item off the hand costs what its
 * printed line says, the same way a fitted module does.
 */
export function energyCostOf(
  card: { energyCost?: number | null; dice?: DiceSpec },
  config: GameConfig,
  diceCount = 1,
): number {
  const base = card.energyCost ?? 0;
  const perDie = card.dice?.count === 'variable' ? Math.max(1, diceCount) : 1;
  return Math.max(0, Math.round(base * perDie * config.energyCostMult));
}

/** How many dice this activation rolls. */
export function diceCountOf(card: { dice?: DiceSpec }, requested?: number): number {
  if (!card.dice) return 0;
  if (card.dice.count === 'variable') return Math.max(1, requested ?? 1);
  return card.dice.count;
}

export interface DiceRoll {
  dice: number[];
  hits: number;
  /** What the roll adds to a payload: `perHit` per hit, or the plain sum. */
  bonus: number;
  /** True when the card prints a hit rule, i.e. the roll can miss. */
  hitRule: boolean;
}

export const NO_ROLL: DiceRoll = { dice: [], hits: 0, bonus: 0, hitRule: false };

/**
 * Roll a card's dice once for the whole activation.
 *
 * One roll, shared by every effect on the card: a card that both hurts and
 * charges off the same dice should read them the same way. Dice with a hit
 * rule pay `perHit` per hit (Laser Array); dice without one are summed.
 */
export function rollDice(spec: DiceSpec | undefined, count: number, rng: Rng): DiceRoll {
  if (!spec || count <= 0) return NO_ROLL;

  const dice = rng.rollMany(count, spec.die);
  const { hitUnder, hitOver, perHit } = spec;
  if (hitUnder === undefined && hitOver === undefined) {
    return { dice, hits: dice.length, bonus: dice.reduce((a, b) => a + b, 0), hitRule: false };
  }
  const hits = dice.filter(
    (d) => (hitUnder !== undefined && d <= hitUnder) || (hitOver !== undefined && d >= hitOver),
  ).length;
  return { dice, hits, bonus: hits * (perHit ?? 1), hitRule: true };
}

/**
 * Slots holding a live module, with the card resolved.
 *
 * The cockpit is deliberately *not* in here. It carries its own weapon,
 * shield and generator, but it isn't a fitted module: it never takes upkeep
 * from the reactor spread, never bleeds to an infestation, and never counts
 * toward a role chain. Everything the cockpit does goes through the helpers
 * below instead, so the two never double up.
 */
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

// ------------------------------------------------------------- the cockpit

/**
 * The cockpit as a card, plus the slot it sits in.
 *
 * With HP gone this is the ship's whole baseline: `power` is the basic attack
 * a down always buys, `energyCapacity` is the basic shield, and `genPerDown`
 * is what the basic generator puts back per down.
 */
export function cockpitOf(
  content: Content,
  ship: Ship,
): { slot: ShipSlot; part: PartCard } | null {
  const index = ship.slots.findIndex((s) => s.partId === ship.cockpitId);
  const slot = ship.slots[index];
  const part = partOf(content, slot?.partId);
  return slot && part ? { slot, part } : null;
}

/** ⚔ the cockpit's basic attack deals. 0 when the card prints none. */
export const cockpitPower = (content: Content, ship: Ship): number =>
  cockpitOf(content, ship)?.part.power ?? 0;

/** ⚡ one down of the basic generator puts into the cockpit's shield. */
export const cockpitGeneration = (content: Content, ship: Ship): number =>
  cockpitOf(content, ship)?.part.genPerDown ?? 0;

/** Charge currently in the cockpit's shield pool. */
export const cockpitCharge = (content: Content, ship: Ship): number =>
  cockpitOf(content, ship)?.slot.energy ?? 0;

/** Size of the cockpit's shield pool. */
export const cockpitCapacity = (content: Content, ship: Ship): number =>
  cockpitOf(content, ship)?.part.energyCapacity ?? 0;

/**
 * Everything standing between this ship and a wreck: charged shield modules
 * plus the cockpit's own pool. This is the number that replaced hull — what
 * targeting reads to pick the softest ship on the table.
 */
export function shieldPool(content: Content, ship: Ship): number {
  const modules = liveModules(content, ship)
    .filter((m) => isAbsorber(m.part))
    .reduce((sum, m) => sum + m.slot.energy, 0);
  return modules + cockpitCharge(content, ship);
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
