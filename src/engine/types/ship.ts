import type { PartId, ShipId, SlotIndex } from './ids';

/**
 * One position in a ship's module grid.
 * `null` part = empty slot. The cockpit occupies a slot like anything else,
 * but is flagged so it can't be jettisoned.
 */
export interface ShipSlot {
  index: SlotIndex;
  partId: PartId | null;
  /** Current charge in this module's own energy pool. */
  energy: number;
  /** Set once per fresh set of downs — offensive modules fire once per set. */
  usedThisDownSet: boolean;
  /** Knocked out; occupies the slot but contributes nothing. */
  disabled: boolean;
}

/**
 * A ship is a cockpit plus module slots. Capacity comes from the cockpit,
 * so swapping cockpits (Loot option A) can resize the grid.
 */
export interface Ship {
  id: ShipId;
  name: string;
  /** Part id of the cockpit anchoring this ship. */
  cockpitId: PartId;
  /** Grid shape, purely presentational — capacity is slots.length. */
  gridCols: number;
  slots: ShipSlot[];
  hp: number;
  hpMax: number;
}

/** Adjacency chain bonus (GEN → RDS → WPN), evaluated by the engine. */
export interface AdjacencyBonus {
  slotIndices: SlotIndex[];
  description: string;
}
