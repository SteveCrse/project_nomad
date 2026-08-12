import type { Card, Rarity } from '../types/card';
import type { CardId } from '../types/ids';
import type { DeckLike } from '../types/game';
import type { Rng } from '../rng';

/**
 * Deck construction, shuffling and drawing for the three decks
 * (Parts, Items, Events), plus the rarity gate that checkpoints raise.
 *
 * Cards above the current ceiling are not thrown away — they sit in `reserve`
 * ("out of the bag") and get shuffled in when a checkpoint unlocks their tier.
 */

export type Deck = DeckLike;

/**
 * Expand a card list into a draw pile, honouring each card's `amount` and
 * holding anything above the current rarity ceiling in reserve.
 */
export function buildDeck(
  id: Deck['id'],
  cards: Card[],
  maxRarity: Rarity | number,
  rng: Rng,
): Deck {
  const drawPile: CardId[] = [];
  const reserve: CardId[] = [];
  for (const card of cards) {
    const target = card.rarity <= maxRarity ? drawPile : reserve;
    for (let i = 0; i < card.amount; i++) target.push(card.id);
  }
  return { id, drawPile: shuffle(drawPile, rng), discardPile: [], reserve: shuffle(reserve, rng) };
}

/** Fisher-Yates on a copy — inputs are never mutated. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/** Draw n cards, reshuffling the discard pile in when the draw pile runs out. */
export function draw(deck: Deck, count: number, rng: Rng): { deck: Deck; drawn: CardId[] } {
  let drawPile = deck.drawPile.slice();
  let discardPile = deck.discardPile.slice();
  const drawn: CardId[] = [];

  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break; // deck and discard both dry
      drawPile = shuffle(discardPile, rng);
      discardPile = [];
    }
    drawn.push(drawPile.shift()!);
  }

  return { deck: { ...deck, drawPile, discardPile }, drawn };
}

/** Put cards back — spent items, parts stripped off an abandoned ship. */
export function discard(deck: Deck, cardIds: CardId[]): Deck {
  return { ...deck, discardPile: [...deck.discardPile, ...cardIds] };
}

/** Shuffle cards back into the draw pile (the rules' "shuffled back in"). */
export function returnToDeck(deck: Deck, cardIds: CardId[], rng: Rng): Deck {
  if (cardIds.length === 0) return deck;
  return { ...deck, drawPile: shuffle([...deck.drawPile, ...cardIds], rng) };
}

/**
 * Crossing a checkpoint: fold newly-unlocked rarities into the draw pile.
 *
 * Signature note — the stub took `GameConfig`, but the ceiling is run state
 * rather than a tunable, and the reserve already knows which cards are held
 * back, so it needs the card index instead to read rarities.
 */
export function applyCheckpoint(
  deck: Deck,
  cardsById: Record<CardId, Card>,
  newMaxRarity: number,
  rng: Rng,
): { deck: Deck; unlocked: CardId[] } {
  const unlocked: CardId[] = [];
  const stillHeld: CardId[] = [];
  for (const id of deck.reserve) {
    const card = cardsById[id];
    if (card && card.rarity <= newMaxRarity) unlocked.push(id);
    else stillHeld.push(id);
  }
  if (unlocked.length === 0) return { deck, unlocked };
  return {
    deck: {
      ...deck,
      drawPile: shuffle([...deck.drawPile, ...unlocked], rng),
      reserve: stillHeld,
    },
    unlocked,
  };
}

export const deckCount = (deck: Deck): number => deck.drawPile.length;
