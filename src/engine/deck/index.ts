import type { Card, Rarity } from '../types/card';
import type { CardId } from '../types/ids';
import type { GameConfig } from '../types/config';
import type { Rng } from '../rng';

/**
 * Deck construction, shuffling and drawing for the three decks
 * (Parts, Items, Events), plus the rarity gate that checkpoints raise.
 */

export interface Deck {
  id: 'parts' | 'items' | 'events';
  /** Card ids in draw order, top of deck first. */
  drawPile: CardId[];
  discardPile: CardId[];
}

/**
 * Expand a card list into a draw pile, honouring each card's `amount` and
 * dropping anything above the current rarity ceiling.
 */
export function buildDeck(
  _id: Deck['id'],
  _cards: Card[],
  _maxRarity: Rarity | number,
  _rng: Rng,
): Deck {
  throw new Error('engine/deck: buildDeck not implemented');
}

export function shuffle<T>(_items: T[], _rng: Rng): T[] {
  throw new Error('engine/deck: shuffle not implemented');
}

/** Draw n cards, reshuffling the discard pile in when the draw pile runs out. */
export function draw(_deck: Deck, _count: number, _rng: Rng): { deck: Deck; drawn: CardId[] } {
  throw new Error('engine/deck: draw not implemented');
}

/** Crossing a checkpoint: fold newly-unlocked rarities into the decks. */
export function applyCheckpoint(_deck: Deck, _config: GameConfig, _newMaxRarity: number): Deck {
  throw new Error('engine/deck: applyCheckpoint not implemented');
}
