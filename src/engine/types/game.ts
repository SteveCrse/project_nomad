import type { CardId, EnemyId, NodeId, PlayerId } from './ids';
import type { Mission } from './board';
import type { PartyState } from './player';
import type { CombatState } from './combat';
import type { EnemyInstance } from './enemy';

/**
 * Where a run currently is. The board drives most of it: entering a step puts
 * the run into the phase that step triggers, and resolving it hands control
 * back to `map`.
 */
export type Phase =
  /** Before the mission: draft parts off the Parts deck and assemble a ship. */
  | 'setup'
  /** Choosing the next step on the board. */
  | 'map'
  | 'combat'
  /** An enemy ship is wrecked: option A (take the ship) or B (take a module). */
  | 'loot'
  /** An Event card is face up and waiting to be resolved. */
  | 'event'
  /** A Loot step handed out Item cards. */
  | 'reward'
  /** Checkpoint or end of mission: slot hoarded modules, buy threshold. */
  | 'rearrange'
  | 'victory'
  | 'defeat';

/** Whatever is blocking the board right now. */
export type Prompt =
  | { kind: 'event'; cardId: CardId; nodeId: NodeId }
  | { kind: 'reward'; cardIds: CardId[]; nodeId: NodeId }
  | { kind: 'loot'; wreck: EnemyInstance; claimants: PlayerId[]; claimedBy: PlayerId[] }
  | { kind: 'checkpoint'; nodeId: NodeId; newMaxRarity: number }
  | { kind: 'rearrange'; reason: 'checkpoint' | 'mission-end' };

/** A ship a seat starts a run with, resolved into a real `Ship` by `newRun`. */
export interface Loadout {
  id: PlayerId;
  label: string;
  shipName: string;
  accent: string;
  cockpitId: CardId;
  /** Modules in slot order, skipping the cockpit's own slot. */
  partIds: CardId[];
}

/**
 * The pre-mission draft.
 *
 * The whole pool comes off the Parts deck in one deal — `startingPartsDraws`
 * cards per seat, all face up — and then the seats take turns picking any card
 * still on the table. The draft runs until the pool is empty or the party calls
 * it, so a seat can read the whole spread before committing to a build.
 */
export interface SetupState {
  /** The face-up spread still on the table, in deal order. */
  pool: CardId[];
  /** Picks taken so far; the clock is seat order modulo the party. */
  picksTaken: number;
  /** Seats now flying a cockpit they drafted rather than their default hull. */
  anchored: PlayerId[];
  /** Last card taken off the table, so the tool can call out what just moved. */
  lastPicked: CardId | null;
  /** Who took it. */
  lastPickedBy: PlayerId | null;
}

export type LogTone = 'info' | 'damage' | 'convert' | 'system' | 'loot';

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
  /** Players moving independently — the rules' split-party choice. */
  split: boolean;
  /** Seats that still owe a move this map step. */
  awaitingMove: PlayerId[];
  /** Enemy stat blocks already used this mission, to vary encounters. */
  seenEnemies: EnemyId[];
}

export interface DeckSet {
  parts: DeckLike;
  items: DeckLike;
  events: DeckLike;
}

/** Structural copy of `engine/deck`'s Deck, kept here so types stay leaf-level. */
export interface DeckLike {
  id: 'parts' | 'items' | 'events';
  drawPile: CardId[];
  discardPile: CardId[];
  /** Cards above the current rarity ceiling, folded in at checkpoints. */
  reserve: CardId[];
}
