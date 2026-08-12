import type { Card, PartCard } from './types/card';
import type { EnemyStatBlock } from './types/enemy';
import type { CardId, EnemyId, PartId } from './types/ids';

/**
 * The card and enemy content a run is played with, injected by the caller.
 *
 * The engine never imports `src/data` — content is a parameter, so a balance
 * sweep can run the same rules against a different card pool.
 */
export interface Content {
  all: Card[];
  cards: Record<CardId, Card>;
  parts: Record<PartId, PartCard>;
  enemies: Record<EnemyId, EnemyStatBlock>;
}

export function makeContent(cards: Card[], enemies: EnemyStatBlock[]): Content {
  return {
    all: cards,
    cards: Object.fromEntries(cards.map((c) => [c.id, c])),
    parts: Object.fromEntries(
      cards.filter((c): c is PartCard => c.kind === 'part').map((p) => [p.id, p]),
    ),
    enemies: Object.fromEntries(enemies.map((e) => [e.id, e])),
  };
}

export const partOf = (content: Content, id: PartId | null | undefined): PartCard | undefined =>
  id ? content.parts[id] : undefined;

export const cardOf = (content: Content, id: CardId | null | undefined): Card | undefined =>
  id ? content.cards[id] : undefined;
