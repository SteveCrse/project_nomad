import type { Cell, Ship, ShipSlot } from '../types/ship';
import type { PartId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import { cockpitIndex, slotAt } from './module';

/**
 * Ships, on a grid.
 *
 * A ship is a cockpit at cell (0, 0) with modules attached around it, and the
 * same rules build every ship on the table — players' at the draft and at the
 * end of a mission, enemies' at spawn. Lower rows are the front: for a player
 * that's everything above the cockpit, and an enemy is drawn the other way up,
 * front facing the players. What decides where a module may go:
 *
 *   1. every module is attached — it touches the cockpit, or a module that does;
 *   2. weapons sit beside or behind the cockpit, never in front of it;
 *   3. nothing sits in front of a shield (same column, further forward);
 *   4. whatever placement limits the card prints.
 *
 * How *many* modules a ship may carry is read off the cockpit according to
 * `config.shipSizeRule` — on top of what the draft already limits.
 */

const reindex = (slots: ShipSlot[]): ShipSlot[] =>
  slots.map((slot, index) => (slot.index === index ? slot : { ...slot, index }));

const clampEnergy = (content: Content, partId: PartId, energy: number): number =>
  Math.max(0, Math.min(energy, Math.max(0, partOf(content, partId)?.energyCapacity ?? 0)));

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** A fresh hull: the cockpit, alone at (0, 0), with `energy` on it. */
export function createShip(content: Content, wantedCockpitId: PartId, name: string, energy: number): Ship {
  // Content is editable at runtime, so a loadout can name a cockpit the deck
  // no longer has. Anchor on any cockpit rather than build around nothing.
  const cockpitId = partOf(content, wantedCockpitId)?.role === 'COCKPIT'
    ? wantedCockpitId
    : (firstCockpitIn(content) ?? wantedCockpitId);
  return {
    id: `ship-${slug(name)}`,
    name,
    cockpitId,
    slots: [{ index: 0, partId: cockpitId, energy: clampEnergy(content, cockpitId, energy), destroyed: false, x: 0, y: 0 }],
    destroyed: false,
    flags: { negateNext: 0, retaliate: 0 },
  };
}

/** Modules only — the cockpit left out. */
export const modulesOf = (ship: Ship): ShipSlot[] =>
  ship.slots.filter((s) => s.partId !== ship.cockpitId);

export const moduleCount = (ship: Ship): number => modulesOf(ship).filter((s) => !s.destroyed).length;

// ---------------------------------------------------------------- editing

/** Attach a module on an empty cell. Legality is the caller's to check first. */
export function placeModule(content: Content, ship: Ship, partId: PartId, cell: Cell, energy: number): Ship {
  if (slotAt(ship, cell)) return ship;
  const slot: ShipSlot = {
    index: ship.slots.length,
    partId,
    energy: clampEnergy(content, partId, energy),
    destroyed: false,
    x: cell.x,
    y: cell.y,
  };
  return { ...ship, slots: [...ship.slots, slot] };
}

/** Take a module off the ship. The cockpit never comes off. */
export function removeModule(ship: Ship, index: SlotIndex): { ship: Ship; partId: PartId | null; energy: number } {
  const target = ship.slots[index];
  if (!target || index === cockpitIndex(ship)) return { ship, partId: null, energy: 0 };
  const slots = ship.slots.filter((_, i) => i !== index);
  return { ship: { ...ship, slots: reindex(slots) }, partId: target.partId, energy: target.energy };
}

/**
 * Move a module to another cell. Onto an empty cell it simply goes there;
 * onto another module the two swap places. The cockpit stays put.
 */
export function moveModule(ship: Ship, from: SlotIndex, cell: Cell): Ship {
  const moving = ship.slots[from];
  if (!moving || from === cockpitIndex(ship)) return ship;
  if (moving.x === cell.x && moving.y === cell.y) return ship;
  const there = slotAt(ship, cell);
  if (there && there.index === cockpitIndex(ship)) return ship;
  const slots = ship.slots.map((s) => {
    if (s.index === from) return { ...s, x: cell.x, y: cell.y };
    if (there && s.index === there.index) return { ...s, x: moving.x, y: moving.y };
    return s;
  });
  return { ...ship, slots };
}

/**
 * Re-anchor a ship on a different cockpit, modules and all: the new one takes
 * the old one's cell, and comes in with `energy` — a refit, not a charged part.
 */
export function swapCockpit(content: Content, ship: Ship, cockpitId: PartId, energy: number): Ship {
  if (cockpitId === ship.cockpitId) return ship;
  const at = cockpitIndex(ship);
  const slots = ship.slots.map((s) =>
    s.index === at ? { ...s, partId: cockpitId, energy: clampEnergy(content, cockpitId, energy), destroyed: false } : s,
  );
  return { ...ship, cockpitId, slots };
}

/**
 * After a fight: destroyed modules are gone. They come off the grid (the
 * cockpit stays — a destroyed ship is still a destroyed ship) and back to the
 * caller to discard. What's left keeps its cells.
 */
export function compactShip(ship: Ship): { ship: Ship; removed: PartId[] } {
  const removed = ship.slots
    .filter((s) => s.destroyed && s.partId !== ship.cockpitId)
    .map((s) => s.partId);
  if (removed.length === 0) return { ship, removed };
  const slots = ship.slots.filter((s) => !s.destroyed || s.partId === ship.cockpitId);
  return { ship: { ...ship, slots: reindex(slots) }, removed };
}

export function firstCockpitIn(content: Content): PartId | null {
  return Object.values(content.parts).find((p) => p.role === 'COCKPIT')?.id ?? null;
}
