import type { Battle, DownAction } from '../types/combat';
import type { ActionCard } from '../types/card';
import type { GameConfig } from '../types/config';
import type { Content } from '../content';
import type { Rng } from '../rng';
import { actionDeckSize, buryActionCard, cycleActionCard } from '../deck';
import { logged, emit } from './sides';
import { actionError } from './legality';
import { resolveDown } from './resolve';
import { passToNextSeat } from './turns';

/**
 * What an enemy action card turns into, or why it can't be carried out.
 * Supplied by `engine/ai`, which owns the enemy's choices; passed in so combat
 * doesn't have to import the planner that reads it.
 */
export type EnemyPlanner = (
  content: Content,
  battle: Battle,
  config: GameConfig,
  card: ActionCard,
) => { action: DownAction } | { reason: string };

/**
 * One step of an enemy down: the face-up card of the current down's deck.
 *
 * If the enemy can carry it out, it resolves, is discarded, and the down is
 * spent. If it can't, it goes to the bottom of the deck, the next is turned
 * face up, and the enemy stays on this down — the next step tries that card,
 * so every card turned is seen at the table. Once each card has been turned
 * without one resolving, the down is lost.
 * A 1st down sends the enemy back to Down 1; Down 4 without one hands the
 * turn to the seat after the one that failed.
 */
export function enemyDown(
  content: Content,
  battle: Battle,
  config: GameConfig,
  rng: Rng,
  plan: EnemyPlanner,
): Battle {
  const side = battle.combat.turn;
  if (side.kind !== 'enemy' || battle.combat.outcome) return battle;

  const index = battle.combat.down;
  let next = battle;
  let deck = next.combat.actionDecks[index];
  let firstDown = false;

  const setDeck = (b: Battle, d: typeof deck): Battle =>
    d
      ? { ...b, combat: { ...b.combat, actionDecks: b.combat.actionDecks.map((x, i) => (i === index ? d : x)) } }
      : b;
  const note = (b: Battle, line: string): Battle => ({ ...b, combat: logged(b.combat, side, line, 'system') });

  if (!deck || actionDeckSize(deck) === 0) {
    next = note(next, `Down ${index + 1}: no action deck — the down is lost.`);
  } else {
    // Each card can be turned at most once per down; past that the deck has
    // nothing the enemy can do, and the down is lost.
    const size = actionDeckSize(deck);
    const turned = (next.combat.turned ?? 0) + 1;
    const card = deck.faceUp ? content.cards[deck.faceUp] : undefined;
    const planned = card?.kind === 'action' ? plan(content, next, config, card) : null;
    const refused = !planned
      ? 'not an action card'
      : 'reason' in planned
        ? planned.reason
        : actionError(content, next, config, side, planned.action);
    if (!card || refused || !planned || 'reason' in planned) {
      deck = buryActionCard(deck, rng);
      if (card) {
        next = emit(note(next, `Down ${index + 1}: ${card.name} — can’t (${refused}). To the bottom of the deck.`), {
          kind: 'action-card',
          down: index,
          cardId: card.id,
          played: false,
          reason: refused ?? '',
        });
      }
      next = setDeck(next, deck);
      // Still cards to try: stay on this down for the next step.
      if (turned < size) return { ...next, combat: { ...next.combat, turned } };
      next = note(next, `Down ${index + 1}: nothing in the deck can be carried out — the down is lost.`);
    } else {
      deck = cycleActionCard(deck, rng);
      next = emit(note(setDeck(next, deck), `Down ${index + 1}: ${card.name}.`), {
        kind: 'action-card',
        down: index,
        cardId: card.id,
        played: true,
      });
      const resolved = resolveDown(content, next, config, side, planned.action, rng);
      next = resolved.battle;
      firstDown = resolved.result.firstDown;
    }
  }

  next = { ...next, combat: { ...next.combat, turned: 0 } };
  if (next.combat.outcome) return next;
  if (firstDown) {
    next = emit(next, { kind: 'first-down', side, label: `1st down — ${next.combat.enemy.name}` });
    return {
      ...next,
      combat: logged({ ...next.combat, down: 0 }, side, `1ST DOWN — ${next.combat.enemy.name} starts again at Down 1.`, 'convert'),
    };
  }
  const down = index + 1;
  if (down >= config.downCount) {
    return passToNextSeat(content, { ...next, combat: { ...next.combat, down } }, next.combat.handedBy);
  }
  return { ...next, combat: { ...next.combat, down } };
}
