import type { Ship, ShipSlot } from '../types/ship';
import type { SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import { cockpitIndex, maxEnergyOf, roomIn } from './module';

// ----------------------------------------------------------------- energy

/** Add ⚡ to a slot, capped at the module's max. Reports what actually landed. */
export function chargeSlot(
  content: Content,
  ship: Ship,
  index: SlotIndex,
  amount: number,
): { ship: Ship; added: number } {
  const target = ship.slots[index];
  if (!target || target.destroyed || amount <= 0) return { ship, added: 0 };
  const added = Math.min(roomIn(content, target), amount);
  if (added <= 0) return { ship, added: 0 };
  return { ship: withSlot(ship, index, { energy: target.energy + added }), added };
}

/** Set a slot's ⚡ outright — drains, EMPs, spending an attack. */
export const setEnergy = (ship: Ship, index: SlotIndex, energy: number): Ship => {
  const target = ship.slots[index];
  return target ? withSlot(ship, index, { energy: Math.max(0, energy) }) : ship;
};

function withSlot(ship: Ship, index: SlotIndex, patch: Partial<ShipSlot>): Ship {
  const slots = ship.slots.slice();
  slots[index] = { ...slots[index]!, ...patch };
  return { ...ship, slots };
}

// ------------------------------------------------------------------- hits

export interface HitReport {
  ship: Ship;
  /** ⚡ the hit took off the module. */
  lost: number;
  /** The module was already at 0 — this hit destroyed it. */
  destroyed: boolean;
  /** The destroyed module carried the 1st-down icon, or was the cockpit. */
  firstDown: boolean;
  negated: boolean;
  notes: string[];
  /** ⚡ a shock absorber paid to soften the hit, by slot. */
  softened: { slot: SlotIndex; amount: number }[];
}

/**
 * Land one hit on one module.
 *
 * Energy is HP: a hit takes ⚡ off the module equal to its strength, never less
 * than 1, and never spills into the module behind. A module already at 0 is
 * destroyed by the next hit, whatever its strength. Destroying the cockpit
 * destroys the ship.
 */
export function hitSlot(content: Content, ship: Ship, index: SlotIndex, strength: number): HitReport {
  const notes: string[] = [];
  const target = ship.slots[index];
  const part = partOf(content, target?.partId);
  const none: HitReport = { ship, lost: 0, destroyed: false, firstDown: false, negated: false, notes, softened: [] };
  if (!target || target.destroyed || !part) return none;

  if (ship.flags.negateNext > 0) {
    notes.push('hit negated');
    return {
      ...none,
      ship: { ...ship, flags: { ...ship.flags, negateNext: ship.flags.negateNext - 1 } },
      negated: true,
    };
  }

  if (target.energy <= 0) {
    const cockpit = index === cockpitIndex(ship);
    notes.push(`${part.name} destroyed`);
    return {
      ...none,
      ship: { ...withSlot(ship, index, { destroyed: true }), destroyed: ship.destroyed || cockpit },
      destroyed: true,
      // Downing a ship is a 1st down too, icon or not.
      firstDown: !!part.firstDown || cockpit,
    };
  }

  // A shock absorber softens the hit — down to 1, never past it — and pays
  // for it with a point of its own charge.
  let next = ship;
  let loss = Math.max(1, strength);
  const softened: HitReport['softened'] = [];
  for (const slot of next.slots) {
    if (loss <= 1) break;
    if (slot.destroyed || slot.energy <= 0) continue;
    const reducer = partOf(content, slot.partId);
    if (!reducer?.damageReduction) continue;
    const cut = Math.min(reducer.damageReduction, loss - 1);
    loss -= cut;
    next = withSlot(next, slot.index, { energy: slot.energy - 1 });
    softened.push({ slot: slot.index, amount: 1 });
    notes.push(`${reducer.name} softens it by ${cut}`);
  }

  const current = next.slots[index]!;
  const lost = Math.min(current.energy, loss);
  next = withSlot(next, index, { energy: current.energy - lost });
  if (current.energy - lost <= 0) notes.push(`${part.name} is at 0⚡ — one more hit destroys it`);
  return { ...none, ship: next, lost, softened };
}

/** Bring a destroyed cockpit back online with `energy` — revives, takeovers, rebuilds. */
export function restoreCockpit(content: Content, ship: Ship, energy: number): Ship {
  const index = cockpitIndex(ship);
  const cockpit = ship.slots[index];
  if (!cockpit) return ship;
  const max = maxEnergyOf(content, cockpit);
  return {
    ...withSlot(ship, index, {
      destroyed: false,
      energy: cockpit.destroyed ? Math.min(max, energy) : Math.max(cockpit.energy, Math.min(max, energy)),
    }),
    destroyed: false,
  };
}
