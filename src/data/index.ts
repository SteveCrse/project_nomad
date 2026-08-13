import type { Card, CardId, PartCard } from '@engine/types';
import { hydrateDeck, makeContent } from '@engine';
import { PARTS } from './parts';
import { ITEMS } from './items';
import { EVENTS } from './events';
import { ENEMIES } from './enemies';

export { PARTS } from './parts';
export { ITEMS } from './items';
export { EVENTS } from './events';
export { ENEMIES, ENEMIES_BY_ID } from './enemies';
export { STARTING_LOADOUTS } from './ships';

/** The authored deck, as it ships in this repo. The editor's baseline. */
export const DEFAULT_CARDS: Card[] = [...PARTS, ...ITEMS, ...EVENTS];

/**
 * The content bundle handed to the engine.
 *
 * **Live, and mutated in place by `setDeck`.** The deck editor rewrites cards
 * at runtime, and every call site holds this same object, so an edit reaches
 * the next activation without anything having to re-import. The engine still
 * never imports this file — the app passes it in — so a balance sweep can hand
 * the rules a different pool entirely.
 */
export const CONTENT = makeContent(hydrateDeck(DEFAULT_CARDS), ENEMIES);

/**
 * Swap the deck the game is played with. Cards must already be compiled
 * (`hydrateDeck`), which is what the deck store hands over.
 */
export function setDeck(cards: Card[]): void {
  const next = makeContent(cards, ENEMIES);
  CONTENT.all = next.all;
  CONTENT.cards = next.cards;
  CONTENT.parts = next.parts;
}

/** Every card currently in play, in browser order. */
export const allCards = (): Card[] => CONTENT.all;

export function getPart(id: CardId | null | undefined): PartCard | undefined {
  return id ? CONTENT.parts[id] : undefined;
}

export function getCard(id: CardId | null | undefined): Card | undefined {
  return id ? CONTENT.cards[id] : undefined;
}
