import type { CardId, EnemyId, PlayerId, SlotIndex } from './ids';
import type { EnemyInstance } from './enemy';
import type { PartyState } from './player';

/** Combat is symmetric: both sides have shields, downs, and a threshold. */
export type SideRef = { kind: 'player'; id: PlayerId } | { kind: 'enemy'; id: EnemyId };

/**
 * What a down can be spent on. The rules allow attacking, charging shields,
 * using non-offensive modules, or playing a card — plus the two a cockpit
 * always offers, so a stripped ship is never out of options.
 */
export type DownAction =
  | {
      type: 'activate-module';
      slot: SlotIndex;
      target?: SideRef;
      /** Aim at one module on the target instead of its shields. */
      targetSlot?: SlotIndex;
      /** Dice bought when the module's dice count is 'variable'. */
      diceCount?: number;
      /** Damage adjudicated at the table, for `manual` effects. */
      manualDamage?: number;
    }
  /** The cockpit's basic attack: its printed ⚔, one down, no ⚡. */
  | { type: 'cockpit-attack'; target?: SideRef; targetSlot?: SlotIndex }
  /** The cockpit's basic generator: one down, ⚡ into its own shield pool. */
  | { type: 'cockpit-generate' }
  | { type: 'charge-shield'; slot: SlotIndex; amount: number }
  | { type: 'play-card'; cardId: CardId; target?: SideRef; manualDamage?: number }
  /**
   * One down buys a whole reroute pass: every module on the grid may hand its
   * charge to a neighbour, but each may only be drained once. Transfers
   * resolve in order, so a generator can feed a redistributor that then feeds
   * a gun within the same down.
   */
  | { type: 'reroute-energy'; transfers: EnergyTransfer[] }
  | { type: 'pass' };

/** One leg of a reroute pass. `amount` is a ceiling — the grid clamps it. */
export interface EnergyTransfer {
  from: SlotIndex;
  to: SlotIndex;
  amount: number;
}

/** Result of resolving one down. */
export interface DownResult {
  action: DownAction;
  damageDealt: number;
  diceRolled: number[];
  /** True when this down's damage pushed the side over its threshold. */
  converted: boolean;
  /** The down was spent (false only when the action was refused). */
  spent: boolean;
  /** Set when the action was refused, with the reason. */
  illegal?: string;
  log: string[];
}

/** One side's progress through its current set of downs. */
export interface DownsState {
  side: SideRef;
  used: number;
  total: number;
  damageThisSet: number;
  /** The defender's threshold this side is trying to beat. */
  threshold: number;
  /** Sets chained together this turn via conversion. */
  conversions: number;
}

export type CombatOutcome = 'victory' | 'defeat';

export interface CombatState {
  round: number;
  /** Players in this fight — a split party only brings who is at the node. */
  participants: PlayerId[];
  /** Initiative order: participating seats, then each enemy ship. */
  order: SideRef[];
  /** Index into `order`. */
  turnIndex: number;
  /** Per side, keyed by `sideKey`. */
  downs: Record<string, DownsState>;
  enemies: EnemyInstance[];
  log: CombatLogEntry[];
  outcome?: CombatOutcome;
  /** Enemy ships destroyed this fight, awaiting the loot phase. */
  wrecks: EnemyInstance[];
}

export interface CombatLogEntry {
  round: number;
  side: SideRef;
  message: string;
  tone?: 'info' | 'damage' | 'convert' | 'system';
}

/**
 * Combat reads and writes both the party and the fight, so the resolution
 * functions take the pair rather than `CombatState` alone.
 */
export interface Battle {
  party: PartyState;
  combat: CombatState;
}
