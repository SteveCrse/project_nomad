import type { ActionCard, Card, Rarity } from '../types/card';
import type { CardId } from '../types/ids';
import type { DeckLike } from '../types/game';
import type { ActionDeck } from '../types/combat';
import type { Rng } from '../rng';

/**
 * Deck construction, shuffling and drawing for the run's decks (parts,
 * cockpits, items, events), the rarity gate that checkpoints raise, and the
 * enemy's per-down action decks.
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

/** Put cards on the discard pile — destroyed modules, spent items. */
export function discard(deck: Deck, cardIds: CardId[]): Deck {
  return { ...deck, discardPile: [...deck.discardPile, ...cardIds] };
}

/** Shuffle cards back into the draw pile (the rules' "shuffled back in"). */
export function returnToDeck(deck: Deck, cardIds: CardId[], rng: Rng): Deck {
  if (cardIds.length === 0) return deck;
  return { ...deck, drawPile: shuffle([...deck.drawPile, ...cardIds], rng) };
}

/**
 * Crossing a checkpoint: fold newly-unlocked rarities into the draw pile —
 * the rules' "shuffle in a stack of rarer cards".
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

/**
 * "Optionally remove some commons": take up to `count` rarity-1 cards out of
 * the draw pile for good, so the rarer stack that just went in weighs more.
 */
export function removeCommons(
  deck: Deck,
  cardsById: Record<CardId, Card>,
  count: number,
): { deck: Deck; removed: CardId[] } {
  if (count <= 0) return { deck, removed: [] };
  const removed: CardId[] = [];
  const drawPile: CardId[] = [];
  for (const id of deck.drawPile) {
    if (removed.length < count && cardsById[id]?.rarity === 1) removed.push(id);
    else drawPile.push(id);
  }
  return { deck: { ...deck, drawPile }, removed };
}

export const deckCount = (deck: Deck): number => deck.drawPile.length;

// ------------------------------------------------------------ action decks

/**
 * The enemy's action decks: one per down, each holding every action card the
 * content defines (copies and all), shuffled, top card face up.
 */
export function buildActionDecks(actions: ActionCard[], downs: number, rng: Rng): ActionDeck[] {
  const ids = actions.flatMap((card) => Array.from({ length: card.amount }, () => card.id));
  return Array.from({ length: Math.max(0, downs) }, () =>
    flipActionCard({ faceUp: null, drawPile: shuffle(ids, rng), discardPile: [] }, rng),
  );
}

/** Turn the next card face up if none is, reshuffling the discards when dry. */
export function flipActionCard(deck: ActionDeck, rng: Rng): ActionDeck {
  if (deck.faceUp) return deck;
  let drawPile = deck.drawPile;
  let discardPile = deck.discardPile;
  if (drawPile.length === 0) {
    if (discardPile.length === 0) return deck;
    drawPile = shuffle(discardPile, rng);
    discardPile = [];
  }
  const [faceUp, ...rest] = drawPile;
  return { faceUp: faceUp ?? null, drawPile: rest, discardPile };
}

/** The face-up card is done — resolved or unresolvable. Discard it and reveal the next. */
export function cycleActionCard(deck: ActionDeck, rng: Rng): ActionDeck {
  if (!deck.faceUp) return flipActionCard(deck, rng);
  return flipActionCard(
    { faceUp: null, drawPile: deck.drawPile, discardPile: [...deck.discardPile, deck.faceUp] },
    rng,
  );
}

/** Cards in an action deck, wherever they sit. */
export const actionDeckSize = (deck: ActionDeck): number =>
  deck.drawPile.length + deck.discardPile.length + (deck.faceUp ? 1 : 0);
