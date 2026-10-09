import type { BoardNode } from '../types/board';
import type { SideRef } from '../types/combat';
import type { GameConfig } from '../types/config';
import type { NodeId, PlayerId } from '../types/ids';
import type { GameState } from '../types/game';
import type { Content } from '../content';
import type { Rng } from '../rng';
import * as deck from '../deck';
import * as board from '../board';
import { livingPlayers, log } from './shared';

/** Where this player may go next. */
export const moveOptions = (state: GameState, player: PlayerId): BoardNode[] =>
  board.optionsFor(state.mission, player);

/** Hand control back to the map and ask every living seat for a move. */
export function readyForNextMove(state: GameState): GameState {
  const alive = livingPlayers(state);
  if (alive.length === 0) return { ...state, phase: 'defeat', prompt: null };
  return {
    ...state,
    phase: 'map',
    prompt: null,
    combat: null,
    awaitingMove: state.split ? alive.map((p) => p.id) : [alive[0]!.id],
  };
}

export function markResolved(state: GameState, nodeId: NodeId): GameState {
  return { ...state, mission: board.markNodeResolved(state.mission, nodeId) };
}

export const activeSide = (state: GameState): SideRef | undefined =>
  state.combat && !state.combat.outcome ? state.combat.turn : undefined;

export const isPlayerTurn = (state: GameState): boolean => activeSide(state)?.kind === 'player';

export function currentCombatNode(state: GameState): BoardNode | undefined {
  const occupied = board.occupiedNodes(state.mission);
  return state.mission.nodes.find(
    (n) => occupied.includes(n.id) && !n.resolved && (n.type === 'combat' || n.type === 'boss'),
  );
}

/**
 * A rarity checkpoint: raise the ceiling, shuffle the newly unlocked stack
 * into every deck, and — if the config says so — take some commons out.
 */
export function crossCheckpoint(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  node: BoardNode,
): GameState {
  const newMax = Math.min(
    5,
    Math.max(state.maxRarityNow, node.raisesRarityTo ?? state.maxRarityNow + config.rarityPerCheckpoint),
  );
  let next = markResolved(state, node.id);
  let unlockedTotal = 0;

  const decks = { ...next.decks };
  for (const id of ['parts', 'cockpits', 'items', 'events'] as const) {
    const applied = deck.applyCheckpoint(decks[id], content.cards, newMax, rng);
    decks[id] = applied.deck;
    unlockedTotal += applied.unlocked.length;
  }
  const culled = deck.removeCommons(decks.parts, content.cards, config.commonsRemovedPerCheckpoint);
  decks.parts = culled.deck;

  next = { ...next, decks, maxRarityNow: newMax };
  next = log(
    next,
    `Rarity checkpoint — ceiling now ${newMax}. ${unlockedTotal} card(s) shuffled in` +
      (culled.removed.length > 0 ? `, ${culled.removed.length} common(s) taken out of the parts deck.` : '.'),
    'system',
  );

  return node.isRearrangePoint
    ? { ...next, phase: 'rearrange', prompt: { kind: 'rearrange', reason: 'checkpoint' } }
    : { ...next, phase: 'map', prompt: { kind: 'checkpoint', nodeId: node.id, newMaxRarity: newMax } };
}
