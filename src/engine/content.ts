import type { ActionCard, Card, PartCard } from './types/card';
import type { BossSheet } from './types/enemy';
import type { CardId, EnemyId, PartId } from './types/ids';

/**
 * The card and boss content a run is played with, injected by the caller.
 *
 * The engine never imports `src/data` — content is a parameter, so a balance
 * sweep can run the same rules against a different card pool.
 */
export interface Content {
  all: Card[];
  cards: Record<CardId, Card>;
  /** Cockpits and modules both — every card a ship can be built from. */
  parts: Record<PartId, PartCard>;
  /** The enemy action cards every action deck is built from. */
  actions: ActionCard[];
  bosses: Record<EnemyId, BossSheet>;
}

export function makeContent(cards: Card[], bosses: BossSheet[]): Content {
  return {
    all: cards,
    cards: Object.fromEntries(cards.map((c) => [c.id, c])),
    parts: Object.fromEntries(
      cards.filter((c): c is PartCard => c.kind === 'part').map((p) => [p.id, p]),
    ),
    actions: cards.filter((c): c is ActionCard => c.kind === 'action'),
    bosses: Object.fromEntries(bosses.map((b) => [b.id, b])),
  };
}

export const partOf = (content: Content, id: PartId | null | undefined): PartCard | undefined =>
  id ? content.parts[id] : undefined;

export const cardOf = (content: Content, id: CardId | null | undefined): Card | undefined =>
  id ? content.cards[id] : undefined;
