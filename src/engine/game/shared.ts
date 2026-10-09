import type { Battle, SideRef, TableEvent } from '../types/combat';
import type { PlayerId } from '../types/ids';
import type { PlayerState } from '../types/player';
import type { GameState, LogEntry, LogTone } from '../types/game';
import * as combat from '../combat';

/** Helpers every part of the run orchestrator leans on. */

export function log(
  state: GameState,
  text: string,
  tone: LogTone = 'info',
  actor?: string,
  round = state.combat?.round ?? 0,
): GameState {
  const entry: LogEntry = {
    id: state.logCounter + 1,
    round,
    text,
    tone,
    ...(actor ? { actor } : {}),
  };
  return { ...state, log: [...state.log, entry], logCounter: entry.id };
}

export function logAll(state: GameState, lines: string[], tone: LogTone = 'info'): GameState {
  return lines.reduce((s, line) => log(s, line, tone), state);
}

/** How far a fight's log and events had got — what's new after a step is past this. */
export interface CombatMark {
  log: number;
  events: number;
}

export const combatMark = (battle: Battle | null): CombatMark => ({
  log: battle?.combat.log.length ?? 0,
  events: battle?.combat.events.length ?? 0,
});

/**
 * Fold what a combat step added into the run: its transcript lines into the
 * log, so there's one stream, and its table events into the run's events.
 */
export function absorbCombat(state: GameState, battle: Battle, from: CombatMark): GameState {
  const base: GameState = { ...state, party: battle.party, combat: battle.combat };
  const logged = battle.combat.log
    .slice(from.log)
    .reduce<GameState>(
      (s, entry) => log(s, entry.message, entry.tone ?? 'info', sideLabel(battle, entry.side), entry.round),
      base,
    );
  return pushEvents(logged, battle.combat.events.slice(from.events));
}

/** How many table events a run keeps — the table only ever replays the newest. */
const EVENT_MEMORY = 200;

/** Number some table events and add them to the run. */
export function pushEvents(state: GameState, events: TableEvent[]): GameState {
  if (events.length === 0) return state;
  let counter = state.eventCounter;
  const numbered = events.map((event) => ({ ...event, id: ++counter }));
  return { ...state, events: [...state.events, ...numbered].slice(-EVENT_MEMORY), eventCounter: counter };
}

const sideLabel = (battle: Battle, side: SideRef): string => combat.sideName(battle, side);

export const battleOf = (state: GameState): Battle | null =>
  state.combat ? { party: state.party, combat: state.combat } : null;

/** Swap one seat out for an updated copy. */
export function withPlayer(
  state: GameState,
  playerId: PlayerId,
  fn: (player: PlayerState) => PlayerState,
): GameState {
  return {
    ...state,
    party: {
      ...state.party,
      players: state.party.players.map((p) => (p.id === playerId ? fn(p) : p)),
    },
  };
}

export const playerIn = (state: GameState, id: PlayerId | null | undefined): PlayerState | undefined =>
  id ? state.party.players.find((p) => p.id === id) : undefined;

export const seatLabel = (state: GameState, id: PlayerId): string => playerIn(state, id)?.label ?? id;

export const livingPlayers = (state: GameState): PlayerState[] =>
  state.party.players.filter((p) => !p.destroyed);
