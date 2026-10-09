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

  /** Modules kept back: the one saved when abandoning a ship, salvage, draft spares. Capped. */
  scrapDeck: CardId[];
  /** Items in hand from Loot steps. */
  hand: CardId[];
  /** Drafted parts not yet fitted — the setup hold. */
  carriedParts: CardId[];
  /**
   * Energy tokens still unspent. The draft is paid for with them; whatever is
   * left when it ends goes onto the ship as starting ⚡.
   */
  tokens: number;

  /** Cockpit destroyed. Out of the fight, and of the mission, unless revived. */
  destroyed: boolean;
}

/** The party as a whole. Splitting the party is tracked per node, not here. */
export interface PartyState {
  players: PlayerState[];
}
