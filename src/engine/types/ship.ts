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
  /** Fired this set — only limits modules that are capped to one shot per set. */
  usedThisDownSet: boolean;
  /** Knocked out; occupies the slot but contributes nothing. */
  disabled: boolean;
}

/**
 * Combat effects a ship is carrying that outlive a single down but not the
 * fight: a charged Defense Turret, armed Mines. Cleared when combat ends.
 */
export interface ShipFlags {
  /** Attacks that will be fully negated (Defense Turret). */
  negateNext: number;
  /** Damage returned to the next attacker (Mines). */
  retaliate: number;
}

/**
 * A ship is a cockpit plus the modules attached to it. How many modules it may
 * carry comes from the cockpit and doesn't count the cockpit itself, so
 * swapping cockpits (Loot option A) can leave modules displaced.
 *
 * The grid is the ship's *shape* rather than its capacity: the parts fitted,
 * plus one ring of open positions around them, re-padded on every placement.
 *
 * There is no HP pool. A ship's durability is the charge sitting in its
 * shields, and the cockpit's own pool is the last of them: once every shield
 * and the cockpit are dry and damage still lands, the ship is destroyed.
 */
export interface Ship {
  id: ShipId;
  name: string;
  /** Part id of the cockpit anchoring this ship. */
  cockpitId: PartId;
  /** Width of the slot array, in cells — the grid's geometry, not a capacity. */
  gridCols: number;
  slots: ShipSlot[];
  /** Shot out from under its pilot: damage landed with no ⚡ left to soak it. */
  destroyed: boolean;
  flags: ShipFlags;
}

/** Adjacency chain bonus (GEN → RDS → WPN), evaluated by the engine. */
export interface AdjacencyBonus {
  slotIndices: SlotIndex[];
  description: string;
}
