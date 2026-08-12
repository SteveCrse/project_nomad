import type { EnemyId, PlayerId, SlotIndex } from './ids';
import type { EnemyInstance } from './enemy';

/** Combat is symmetric: both sides have an HP pool, downs, and a threshold. */
export type SideRef = { kind: 'player'; id: PlayerId } | { kind: 'enemy'; id: EnemyId };

/**
 * What a down can be spent on. The rules allow attacking, charging shields,
 * using non-offensive modules, or playing a card.
 */
export type DownAction =
  | { type: 'activate-module'; slot: SlotIndex; target?: SideRef; spendEnergy?: number }
  | { type: 'charge-shield'; slot: SlotIndex; amount: number }
  | { type: 'play-card'; cardId: string; target?: SideRef }
  | { type: 'reroute-energy'; from: SlotIndex; to: SlotIndex; amount: number }
  | { type: 'pass' };

/** Result of resolving one down. */
export interface DownResult {
  action: DownAction;
  damageDealt: number;
  diceRolled: number[];
  /** True when this down's damage pushed the side over its threshold. */
  converted: boolean;
  log: string[];
}

/** One side's progress through its current set of downs. */
export interface DownsState {
  side: SideRef;
  used: number;
  total: number;
  damageThisSet: number;
  threshold: number;
  /** Sets chained together this turn via conversion. */
  conversions: number;
}

export interface CombatState {
  round: number;
  turn: SideRef;
  playerDowns: Record<PlayerId, DownsState>;
  enemies: EnemyInstance[];
  log: CombatLogEntry[];
}

export interface CombatLogEntry {
  round: number;
  side: SideRef;
  message: string;
}
