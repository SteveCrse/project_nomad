import type { ActionCard } from '@engine/types';

/**
 * Enemy action cards. Every fight builds one deck per down from this list —
 * each deck holding every action, copies and all — and lays its top card face
 * up, so the table can always read the enemy's next four moves.
 *
 * For now the enemy only attacks, generates and reroutes: charging a shield is
 * a reroute into one, and module abilities are the players' alone.
 *
 * The card names the action; `engine/ai` decides which module carries it out,
 * the same way every time, and the card's printed text says how.
 */
export const ENEMY_ACTIONS: ActionCard[] = [
  { id: 'action-attack', name: 'Open Fire', kind: 'action', action: 'attack', rarity: 1, amount: 1 },
  { id: 'action-generate', name: 'Spin Up', kind: 'action', action: 'generate', rarity: 1, amount: 1 },
  { id: 'action-reroute', name: 'Divert Power', kind: 'action', action: 'reroute', rarity: 1, amount: 1 },
];
