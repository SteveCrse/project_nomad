import type { DiceSpec, PartCard } from '../types/card';
import type { Cell, Ship, ShipSlot } from '../types/ship';
import type { SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import { attackOf, outputOf } from '../cards';
import type { Rng } from '../rng';

/**
 * Reading a module's behaviour off its card and its slot.
 *
 * Everything here derives from the card's numbers and effect list — never from
 * a card id — so new content stays a data edit.
 */

/**
 * Online: still there and holding ⚡. A module at 0 is offline — it can't
 * attack, generate or be used until something reroutes charge back into it —
 * but it still blocks if it's a shield, and one more hit destroys it.
 */
export const isOnline = (slot: ShipSlot | undefined): boolean =>
  !!slot && !slot.destroyed && slot.energy > 0;

/** The most ⚡ a slot's module can hold. */
export const maxEnergyOf = (content: Content, slot: ShipSlot | undefined): number =>
  Math.max(0, partOf(content, slot?.partId)?.energyCapacity ?? 0);

/** Room left in a slot's pool. */
export const roomIn = (content: Content, slot: ShipSlot | undefined): number =>
  slot && !slot.destroyed ? Math.max(0, maxEnergyOf(content, slot) - slot.energy) : 0;

export interface Fitted {
  slot: ShipSlot;
  part: PartCard;
}

/** The module in a position, card resolved. */
export function moduleAt(content: Content, ship: Ship, index: SlotIndex): Fitted | null {
  const slot = ship.slots[index];
  const part = partOf(content, slot?.partId);
  return slot && part ? { slot, part } : null;
}

/** Every position that hasn't been destroyed, card resolved — the cockpit included. */
export function liveSlots(content: Content, ship: Ship): Fitted[] {
  const out: Fitted[] = [];
  for (const slot of ship.slots) {
    if (slot.destroyed) continue;
    const part = partOf(content, slot.partId);
    if (part) out.push({ slot, part });
  }
  return out;
}

/** Where the cockpit sits in `slots`. */
export const cockpitIndex = (ship: Ship): SlotIndex =>
  ship.slots.findIndex((s) => s.partId === ship.cockpitId);

export function cockpitOf(content: Content, ship: Ship): Fitted | null {
  const index = cockpitIndex(ship);
  return index >= 0 ? moduleAt(content, ship, index) : null;
}

/** Attack strength of whatever sits in a slot — cockpit or weapon. */
export const attackAt = (content: Content, ship: Ship, index: SlotIndex): number => {
  const part = partOf(content, ship.slots[index]?.partId);
  return part ? attackOf(part) : 0;
};

/** What a generate action adds to whatever sits in a slot. */
export const outputAt = (content: Content, ship: Ship, index: SlotIndex): number => {
  const part = partOf(content, ship.slots[index]?.partId);
  return part ? outputOf(part) : 0;
};

/** Cockpits and generators — the only things the rules let produce ⚡. */
export const isProducer = (part: PartCard): boolean =>
  outputOf(part) > 0 && (part.role === 'COCKPIT' || part.role === 'GEN');

// ------------------------------------------------------------------ grid

/** The module on a cell, destroyed or not. */
export const slotAt = (ship: Ship, cell: Cell): ShipSlot | undefined =>
  ship.slots.find((s) => s.x === cell.x && s.y === cell.y);

/** The four cells touching one. */
export const cellsAround = (cell: Cell): Cell[] => [
  { x: cell.x, y: cell.y - 1 },
  { x: cell.x + 1, y: cell.y },
  { x: cell.x, y: cell.y + 1 },
  { x: cell.x - 1, y: cell.y },
];

/** Touching orthogonally — what "connected" means on the grid. */
export const touching = (a: Cell, b: Cell): boolean =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/** Slots on the cells touching this one, destroyed ones included. */
export function neighbours(ship: Ship, index: SlotIndex): SlotIndex[] {
  const slot = ship.slots[index];
  if (!slot) return [];
  return ship.slots.filter((s) => s.index !== index && touching(s, slot)).map((s) => s.index);
}

/** Can ⚡ move straight between these two? Both still there, and touching. */
export function connected(ship: Ship, a: SlotIndex, b: SlotIndex): boolean {
  const from = ship.slots[a];
  const to = ship.slots[b];
  return !!from && !!to && !from.destroyed && !to.destroyed && touching(from, to);
}

export interface GridBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The smallest box holding every module. */
export function gridBounds(ship: Ship): GridBounds {
  if (ship.slots.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return {
    minX: Math.min(...ship.slots.map((s) => s.x)),
    maxX: Math.max(...ship.slots.map((s) => s.x)),
    minY: Math.min(...ship.slots.map((s) => s.y)),
    maxY: Math.max(...ship.slots.map((s) => s.y)),
  };
}

/**
 * Where a cell sits relative to the cockpit: in front of it (above, for a
 * player), beside it, or behind it. Front is where attacks arrive.
 */
export function zoneOf(ship: Ship, cell: Cell): 'front' | 'side' | 'back' {
  const cockpit = ship.slots[cockpitIndex(ship)];
  const y = cockpit?.y ?? 0;
  return cell.y < y ? 'front' : cell.y > y ? 'back' : 'side';
}

// ------------------------------------------------------------- targeting

const isShield = (content: Content, slot: ShipSlot | undefined): boolean =>
  !!slot && !slot.destroyed && partOf(content, slot.partId)?.role === 'SHD';

/**
 * The living shield standing in front of a module — same column, further
 * forward — or -1. Nothing may sit in front of a shield, so there is at most
 * one, and it's the front of its column.
 */
export function shieldInFront(content: Content, ship: Ship, index: SlotIndex): SlotIndex {
  const slot = ship.slots[index];
  if (!slot) return -1;
  const cover = ship.slots
    .filter((s) => s.x === slot.x && s.y < slot.y && isShield(content, s))
    .sort((a, b) => a.y - b.y)[0];
  return cover ? cover.index : -1;
}

/**
 * What an attack can reach: every module with no living shield in front of
 * it. A shield covers its own column — what's behind it is out of reach until
 * it's destroyed — so a column with no shield is open all the way back. A
 * precision weapon ignores the shields entirely.
 */
export function exposedSlots(content: Content, ship: Ship, precision = false): SlotIndex[] {
  return ship.slots
    .filter((s) => !s.destroyed && (precision || shieldInFront(content, ship, s.index) < 0))
    .map((s) => s.index);
}

export const canTarget = (
  content: Content,
  ship: Ship,
  index: SlotIndex,
  precision = false,
): boolean => exposedSlots(content, ship, precision).includes(index);

/**
 * Where an attack lands when nobody picks: the cockpit, or the shield in
 * front of it that must be destroyed first. It's also the only place the
 * enemy ever aims.
 */
export function defaultTargetSlot(content: Content, ship: Ship): SlotIndex {
  const cockpit = cockpitIndex(ship);
  const cover = shieldInFront(content, ship, cockpit);
  return cover >= 0 ? cover : cockpit;
}

// -------------------------------------------------------------- passives

/** Any online module that lets charge move without spending a down. */
export const hasFreeReroute = (content: Content, ship: Ship): boolean =>
  liveSlots(content, ship).some((m) => isOnline(m.slot) && !!m.part.freeReroute);

/** Scrap cap raised by fitted modules — counted while they're on the ship at all. */
export const scrapCapBonus = (content: Content, ship: Ship): number =>
  liveSlots(content, ship).reduce((sum, m) => sum + (m.part.scrapCapBonus ?? 0), 0);

/** ⚡ sitting on the ship, everywhere. */
export const storedEnergy = (ship: Ship): number =>
  ship.slots.reduce((sum, s) => sum + (s.destroyed ? 0 : s.energy), 0);

// ------------------------------------------------------------------ dice

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
 * Roll one effect's own dice — on top of the attack roll, never instead of it.
 * Dice with a hit rule pay `perHit` per hit; dice without one are summed.
 */
export function rollDice(spec: DiceSpec | undefined, rng: Rng): DiceRoll {
  if (!spec || spec.count <= 0) return NO_ROLL;

  const dice = rng.rollMany(spec.count, spec.die);
  const { hitUnder, hitOver, perHit } = spec;
  if (hitUnder === undefined && hitOver === undefined) {
    return { dice, hits: dice.length, bonus: dice.reduce((a, b) => a + b, 0), hitRule: false };
  }
  const hits = dice.filter(
    (d) => (hitUnder !== undefined && d <= hitUnder) || (hitOver !== undefined && d >= hitOver),
  ).length;
  return { dice, hits, bonus: hits * (perHit ?? 1), hitRule: true };
}
