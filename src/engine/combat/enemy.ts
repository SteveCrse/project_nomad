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
 * One enemy down, off the current down's action deck.
 *
 * Resolve the face-up card; if the enemy can't carry it out, it goes to the
 * bottom of the deck and the next is revealed, until one resolves. A played
 * card is discarded. Either way the deck ends with a fresh card face up.
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
  let spent = false;

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
    for (let attempt = 0; attempt < size; attempt++) {
      const card = deck.faceUp ? content.cards[deck.faceUp] : undefined;
      if (!card || card.kind !== 'action') {
        deck = cycleActionCard(deck, rng);
        continue;
      }
      const planned = plan(content, next, config, card);
      const refused = 'reason' in planned ? planned.reason : actionError(content, next, config, side, planned.action);
      if (refused || 'reason' in planned) {
        deck = buryActionCard(deck, rng);
        next = emit(note(next, `Down ${index + 1}: ${card.name} — can’t (${refused}). To the bottom of the deck.`), {
          kind: 'action-card',
          down: index,
          cardId: card.id,
          played: false,
          reason: refused ?? '',
        });
        continue;
      }
      deck = cycleActionCard(deck, rng);
      next = emit(note(next, `Down ${index + 1}: ${card.name}.`), { kind: 'action-card', down: index, cardId: card.id, played: true });
      const resolved = resolveDown(content, next, config, side, planned.action, rng);
      next = resolved.battle;
      firstDown = resolved.result.firstDown;
      spent = true;
      break;
    }
    if (!spent) next = note(next, `Down ${index + 1}: nothing in the deck can be carried out — the down is lost.`);
    next = setDeck(next, deck);
  }

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
