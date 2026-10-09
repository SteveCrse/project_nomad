import type { GameConfig } from '../types/config';
import type { CardId, PlayerId, SlotIndex } from '../types/ids';
import type { Cell } from '../types/ship';
import type { PlayerState } from '../types/player';
import type { GameState } from '../types/game';
import type { Content } from '../content';
import * as loot from '../loot';
import { restoreCockpit } from '../ship';
import { log, logAll, playerIn, withPlayer } from './shared';

/** The boss in pieces: the seat on the clock takes one part, or passes. */
export function salvage(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  cardId: CardId | null,
): GameState {
  const prompt = state.prompt;
  if (prompt?.kind !== 'salvage') return state;
  const who = prompt.claimants[prompt.turn];
  if (who !== playerId) return state;
  const player = playerIn(state, who)!;

  let next = state;
  let pieces = prompt.pieces;
  let passed = prompt.passed;
  if (cardId === null) {
    passed = [...passed, who];
    next = log(next, `${player.label} passes on the wreck.`, 'loot');
  } else {
    if (!pieces.includes(cardId)) return state;
    const taken = loot.salvagePiece(content, player, cardId, config);
    if ('error' in taken) return state;
    next = logAll(withPlayer(next, who, () => taken.player), taken.log, 'loot');
    pieces = pieces.slice();
    pieces.splice(pieces.indexOf(cardId), 1);
  }
  return salvageTurn(content, next, config, { ...prompt, pieces, passed }, prompt.turn + 1);
}

/**
 * Put the next seat still taking on the clock, starting from `from` and going
 * round the table — a seat that passed, or whose scrap deck is full, is
 * skipped. When nobody can take any more, whatever is left drifts away and
 * the mission ends.
 */
export function salvageTurn(
  content: Content,
  state: GameState,
  config: GameConfig,
  prompt: Extract<NonNullable<GameState['prompt']>, { kind: 'salvage' }>,
  from: number,
): GameState {
  const seats = prompt.claimants;
  const live = (id: PlayerId) => {
    const p = playerIn(state, id);
    return !!p && !prompt.passed.includes(id) && loot.scrapRoom(content, p, config) > 0;
  };
  let turn = -1;
  for (let step = 0; step < seats.length; step++) {
    const i = (from + step) % seats.length;
    if (live(seats[i]!)) {
      turn = i;
      break;
    }
  }
  if (prompt.pieces.length === 0 || turn < 0) {
    const next = prompt.pieces.length > 0
      ? log(state, `${prompt.pieces.length} piece(s) nobody took are left drifting.`, 'loot')
      : state;
    return missionEnd(content, { ...next, prompt: null, combat: null }, config);
  }
  return { ...state, prompt: { ...prompt, turn } };
}

/**
 * Boss down: the mission is over. Seats that went down rebuild — their
 * cockpit comes back on start energy — and everyone builds their next ship
 * from what they're flying plus the scrap deck.
 */
function missionEnd(content: Content, state: GameState, config: GameConfig): GameState {
  let next = state;
  for (const player of state.party.players) {
    if (!player.destroyed) continue;
    next = withPlayer(next, player.id, (p) => ({
      ...p,
      destroyed: false,
      ship: restoreCockpit(content, p.ship, config.startEnergy),
    }));
    next = log(next, `${player.label} rebuilds — the cockpit comes back online.`, 'system');
  }
  return {
    ...log(next, 'Mission complete. Build your next ship from what you fly and your scrap deck.', 'system'),
    phase: 'rearrange',
    prompt: { kind: 'rearrange', reason: 'mission-end' },
  };
}

// ------------------------------------------------------------ rebuilding

type Rebuild = { player: PlayerState; log: string[] } | { error: string };

function applyRebuild(state: GameState, playerId: PlayerId, result: Rebuild): { state: GameState; error?: string } {
  if ('error' in result) return { state, error: result.error };
  return { state: logAll(withPlayer(state, playerId, () => result.player), result.log, 'loot') };
}

const rebuilding = (state: GameState) => state.phase === 'rearrange';

/** Rearrangement point: fit a module (or a cockpit) from the scrap deck — on a cell, or wherever it fits best. */
export function fitFromScrap(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  cardId: CardId,
  cell: Cell | null,
): { state: GameState; error?: string } {
  const player = playerIn(state, playerId);
  if (!player || !rebuilding(state)) return { state, error: 'not a rearrangement point' };
  return applyRebuild(state, playerId, loot.fitFromScrap(content, player, cardId, cell, config));
}

/** Rearrangement point: pull a module off the ship into the scrap deck. */
export function stowToScrap(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  slot: SlotIndex,
): { state: GameState; error?: string } {
  const player = playerIn(state, playerId);
  if (!player || !rebuilding(state)) return { state, error: 'not a rearrangement point' };
  return applyRebuild(state, playerId, loot.stowToScrap(content, player, slot, config));
}
