import type { CardId, PlayerId, ShipId } from './ids';
import type { Ship } from './ship';

export interface PlayerState {
  id: PlayerId;
  /** Seat label shown in the HUD: P1..P4. */
  label: string;
  /** Accent colour for this seat, from the design's per-player accents. */
  accent: string;
  shipId: ShipId;
  ship: Ship;

  /** Action points available this turn, and the per-turn ceiling. */
  ap: number;
  apMax: number;

  /**
   * Downs spent in the current set. The player converts (and resets this)
   * by dealing damage >= the opposing threshold within one set.
   */
  downsUsed: number;
  /** Damage dealt in the current set of downs, measured against the threshold. */
  damageThisDownSet: number;

  /** Loose energy not yet committed to a module pool. */
  energy: number;

  /**
   * Rules open question #2: a player may buy a higher own-threshold, making
   * enemies work harder to convert, and pay for it in attack power.
   */
  thresholdBonus: number;
  /** Flat power lost per attack, the price paid for `thresholdBonus`. */
  powerPenalty: number;

  /** Hoarded modules + the module kept when abandoning a ship. Capped by config. */
  scrapDeck: CardId[];
  /** Items in hand from Loot steps. */
  hand: CardId[];
  /** Carried-but-unequipped parts, capped so parts can't be hoarded freely. */
  carriedParts: CardId[];

  /** Out of the fight: hull at 0. Stays on the board for the post-mortem. */
  destroyed: boolean;
}

/** The party as a whole. Splitting the party is tracked per node, not here. */
export interface PartyState {
  players: PlayerState[];
  /** Index into players — whose turn it is. */
  activePlayerIndex: number;
}
