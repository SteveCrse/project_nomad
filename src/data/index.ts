import type { Card, CardId, PartCard } from '@engine/types';
import { makeContent } from '@engine';
import { PARTS } from './parts';
import { ITEMS } from './items';
import { EVENTS } from './events';
import { ENEMIES } from './enemies';

export { PARTS } from './parts';
export { ITEMS } from './items';
export { EVENTS } from './events';
export { ENEMIES, ENEMIES_BY_ID } from './enemies';
export { STARTING_LOADOUTS } from './ships';

/** Every card across the three decks, in browser order. */
export const ALL_CARDS: Card[] = [...PARTS, ...ITEMS, ...EVENTS];

export const CARDS_BY_ID: Record<CardId, Card> = Object.fromEntries(
  ALL_CARDS.map((c) => [c.id, c]),
);

export const PARTS_BY_ID: Record<CardId, PartCard> = Object.fromEntries(
  PARTS.map((p) => [p.id, p]),
);

export function getPart(id: CardId | null | undefined): PartCard | undefined {
  return id ? PARTS_BY_ID[id] : undefined;
}

export function getCard(id: CardId | null | undefined): Card | undefined {
  return id ? CARDS_BY_ID[id] : undefined;
}

/**
 * The content bundle handed to the engine. The engine never imports this
 * file — the app injects it, so a balance sweep can swap the card pool.
 */
export const CONTENT = makeContent(ALL_CARDS, ENEMIES);
