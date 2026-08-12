import type { Card, CardId, PartCard } from '@engine/types';
import { PARTS } from './parts';
import { ITEMS } from './items';
import { EVENTS } from './events';

export { PARTS } from './parts';
export { ITEMS } from './items';
export { EVENTS } from './events';
export { ENEMIES, ENEMIES_BY_ID } from './enemies';
export { SEED_PLAYERS, SEED_ENEMY, SEED_SCRAP, SEED_TABLE } from './ships';
export type { SeedShip, SeedSlot } from './ships';

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
