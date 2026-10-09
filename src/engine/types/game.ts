import type { CardId, NodeId, PlayerId } from './ids';
import type { Mission } from './board';
import type { PartyState } from './player';
import type { CombatState, TableEvent } from './combat';
import type { EnemyInstance } from './enemy';

/**
 * Where a run currently is. The board drives most of it: entering a step puts
 * the run into the phase that step triggers, and resolving it hands control
 * back to `map`.
 */
export type Phase =
  /** Before the mission: the draft, then laying the ships out and placing their starting ⚡. */
  | 'setup'
  /** Choosing the next step on the board. */
  | 'map'
  | 'combat'
  /** An enemy ship is down: take it over, or leave it. Or split the boss. */
  | 'loot'
  /** An Event card is face up and waiting to be resolved. */
  | 'event'
  /** A Loot step handed out Item cards. */
  | 'reward'
  /** End of mission (or an opted-in checkpoint): rebuild from the scrap deck. */
  | 'rearrange'
  | 'victory'
  | 'defeat';

/** Whatever is blocking the board right now. */
export type Prompt =
  | { kind: 'event'; cardId: CardId; nodeId: NodeId }
  | { kind: 'reward'; cardIds: CardId[]; nodeId: NodeId }
  /** A regular kill: one seat may abandon ship and take this one over. */
  | { kind: 'loot'; wreck: EnemyInstance; claimants: PlayerId[] }
  /**
   * The boss, taken in pieces: surviving parts go round the table into scrap
   * decks until they're gone or everyone passes.
   */
  | {
      kind: 'salvage';
      wreck: EnemyInstance;
      pieces: CardId[];
      claimants: PlayerId[];
      /** Index into `claimants` — whose pick it is. */
      turn: number;
      passed: PlayerId[];
    }
  | { kind: 'checkpoint'; nodeId: NodeId; newMaxRarity: number }
  | { kind: 'rearrange'; reason: 'checkpoint' | 'mission-end' };

/** A ship a seat starts a run with when the draft is switched off. */
export interface Loadout {
  id: PlayerId;
  label: string;
  shipName: string;
  accent: string;
  cockpitId: CardId;
  /** Modules, in no particular order — the layout rules arrange them. */
  partIds: CardId[];
}

/**
 * The snake draft.
 *
 * Round 0 is the cockpit round; `draftRounds` module rounds follow. Each round
 * turns up one card more than there are seats still drafting, and each seat
 * either buys one with energy tokens or passes. The cards nobody took go back
 * to their deck. Pick order reverses every round.
 */
export interface SetupState {
  /** 0 is the cockpit round; module rounds follow. */
  round: number;
  /** Face-up cards this round. */
  table: CardId[];
  /** Seats picking this round, in snake order. */
  order: PlayerId[];
  /** Seats that have had their turn this round — taken a card or passed. */
  picked: PlayerId[];
  /** Seats that passed this round. */
  passed: PlayerId[];
  /** Seats whose draft is over for good: out of tokens, or a full ship. */
  done: PlayerId[];
  /**
   * Every round is dealt: what's left is laying the ships out and putting the
   * leftover tokens on them as starting ⚡.
   */
  complete: boolean;
  /** Last card taken off the table, so the tool can call out what just moved. */
  lastPicked: CardId | null;
  lastPickedBy: PlayerId | null;
}

export type LogTone = 'info' | 'damage' | 'convert' | 'system' | 'loot';

/** A table event, numbered in the run. */
export type RunEvent = TableEvent & { id: number };

export interface LogEntry {
  id: number;
  /** Combat round, or 0 outside combat. */
  round: number;
  text: string;
  tone: LogTone;
  /** Seat or enemy this line is about, for colour-coding. */
  actor?: string;
}

/** Everything a run consists of. One object, so a playtest can be snapshotted. */
export interface GameState {
  seed: number;
  sector: number;
  phase: Phase;
  mission: Mission;
  party: PartyState;
  decks: DeckSet;
  combat: CombatState | null;
  /** Rarity ceiling right now — raised by checkpoints, not by config alone. */
  maxRarityNow: number;
  prompt: Prompt | null;
  /** The draft, while it's running. Null once the mission is under way. */
  setup: SetupState | null;
  log: LogEntry[];
  /** Monotonic, so log ids stay unique across a run. */
  logCounter: number;
  /** What happened at the table, for the tool to animate. Recent ones only. */
  events: RunEvent[];
  /** Monotonic, so event ids stay unique across a run. */
  eventCounter: number;
  /** Players moving independently — the rules' split-party choice. */
  split: boolean;
  /** Seats that still owe a move this map step. */
  awaitingMove: PlayerId[];
}

export interface DeckSet {
  parts: DeckLike;
  cockpits: DeckLike;
  items: DeckLike;
  events: DeckLike;
}

/** Structural copy of `engine/deck`'s Deck, kept here so types stay leaf-level. */
export interface DeckLike {
  id: 'parts' | 'cockpits' | 'items' | 'events';
  drawPile: CardId[];
  discardPile: CardId[];
  /** Cards above the current rarity ceiling, folded in at checkpoints. */
  reserve: CardId[];
}
