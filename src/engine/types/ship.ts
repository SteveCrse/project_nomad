import type { PartId, ShipId, SlotIndex } from './ids';

/**
 * One module on a ship's grid.
 *
 * Energy is the module's hit chance *and* its HP. At 0 it's offline — it can't
 * act, but it's still there, still blocks if it's a shield, and one more hit
 * destroys it. A destroyed module keeps its cell until the fight is over so
 * targets don't shuffle mid-combat; it's gone afterwards.
 */
export interface ShipSlot {
  /** Position in `Ship.slots` — stable for the length of a fight. */
  index: SlotIndex;
  partId: PartId;
  energy: number;
  destroyed: boolean;
  /** Grid column. The cockpit sits at x 0. */
  x: number;
  /**
   * Grid row, front to back. The cockpit sits at y 0: everything at a lower y
   * is in front of it, everything higher behind it, and its own row is its
   * sides. The same numbers hold for every ship — an enemy is drawn flipped,
   * front facing the players, but its grid reads the same way.
   */
  y: number;
}

/** A grid position. */
export interface Cell {
  x: number;
  y: number;
}

/**
 * Combat effects a ship is carrying that outlive a single down but not the
 * fight: a charged Defense Turret, armed Mines. Cleared when combat starts.
 */
export interface ShipFlags {
  /** Hits that will be negated outright (Defense Turret). */
  negateNext: number;
  /** Strength of the hit returned to the next attacker (Mines). */
  retaliate: number;
}

/**
 * A ship is a cockpit plus the modules attached around it on a grid. The same
 * rules apply to players and enemies.
 *
 * There is no HP pool: every module's energy is its own HP, and the ship is
 * destroyed when its cockpit is.
 */
export interface Ship {
  id: ShipId;
  name: string;
  /** Part id of the cockpit, at cell (0, 0). */
  cockpitId: PartId;
  /** Every module, cockpit included, in no particular order — `x`/`y` place them. */
  slots: ShipSlot[];
  /** The cockpit has been destroyed. */
  destroyed: boolean;
  flags: ShipFlags;
}
