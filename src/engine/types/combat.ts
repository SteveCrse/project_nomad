import type { CardId, EnemyId, PlayerId, SlotIndex } from './ids';
import type { DieKind } from './card';
import type { EnemyInstance } from './enemy';
import type { PartyState } from './player';

/** One side of a fight: a seat, or the enemy ship. */
export type SideRef = { kind: 'player'; id: PlayerId } | { kind: 'enemy'; id: EnemyId };

/** A module on one side of the table. */
export interface SlotRef {
  side: SideRef;
  slot: SlotIndex;
}

/**
 * One leg of a reroute: ⚡ out of one module into a module it touches.
 *
 * A reroute is a list of these, played in order — as many as the seat likes,
 * from as many modules as it likes — with two limits: every token moves one
 * module at most per reroute, and no module may ever go over its max.
 */
export interface RerouteMove {
  from: SlotIndex;
  to: SlotIndex;
  amount: number;
}

/**
 * What a down can be spent on — the rules' list (attack, generate energy,
 * charge shields, use another module, play a card) plus rerouting, which is
 * how charge reaches a gun at all, and the revive the downed-player switch
 * may allow.
 *
 * `target` names the player ship an *enemy* action aims at; players have only
 * the one enemy to aim at. `targetSlot` is the module on the far side.
 */
export type DownAction =
  /** Fire a module with an attack — the cockpit included. Rolls d6 ≤ its ⚡. */
  | { type: 'attack'; slot: SlotIndex; targetSlot?: SlotIndex; target?: PlayerId }
  /** Run a producer: its output lands on the producer itself. */
  | { type: 'generate'; slot: SlotIndex }
  /** Move ⚡ between connected modules. Into a shield, this is charging it. */
  | { type: 'reroute'; moves: RerouteMove[] }
  /** Any other ability a module prints (EMP, turret, mines, a manual rule). */
  | {
      type: 'use-module';
      slot: SlotIndex;
      targetSlot?: SlotIndex;
      target?: PlayerId;
      /** Damage adjudicated at the table, for `manual` effects. */
      manualDamage?: number;
    }
  | { type: 'play-card'; cardId: CardId; targetSlot?: SlotIndex; manualDamage?: number }
  /** Downed-player rule `revive`: restore a teammate's cockpit with 1⚡. */
  | { type: 'revive'; playerId: PlayerId }
  | { type: 'pass' };

/** Result of resolving one down. */
export interface DownResult {
  action: DownAction;
  /** The down was spent (false when refused, or when a card made it free). */
  spent: boolean;
  /** A 1st-down module went down on this action. */
  firstDown: boolean;
  /** Set when the action was refused, with the reason. */
  illegal?: string;
  log: string[];
}

/**
 * One enemy action deck: the top card lies face up so the table can read the
 * enemy's next move on every down.
 */
export interface ActionDeck {
  faceUp: CardId | null;
  drawPile: CardId[];
  discardPile: CardId[];
}

export type CombatOutcome = 'victory' | 'defeat';

/**
 * Why a seat's turn is over. A turn never hands itself on: the seat ends it,
 * and this says where it goes when it does — the next seat after a 1st down,
 * the enemy otherwise.
 */
export type TurnOver = 'first-down' | 'out-of-downs' | 'destroyed';

/**
 * Something that happened at the table, in the order it happened, for the
 * tool to show. The run log says it in words; these say it in a shape the
 * table can animate — which die came up what, which module took the hit.
 */
export type TableEvent =
  /**
   * Dice were rolled. Every roll the engine makes lands here, so nothing is
   * decided out of sight: the attack roll, a card's own dice, a gamble.
   */
  | {
      kind: 'roll';
      side: SideRef;
      /** What the roll is for, without its result: "Gauss Canon → Kinetic Shield". */
      label: string;
      die: DieKind;
      dice: number[];
      /** What counts as a success, as printed ("≤ 4", "≥ 2"); null when the dice are summed. */
      rule: string | null;
      /** null for summed dice. */
      success: boolean | null;
      /** The result in words: "HIT", "No hit", "+3⚔". */
      outcome: string;
      /** The module rolling, and what it's aimed at — an attack's shot. */
      from?: SlotRef;
      to?: SlotRef;
    }
  | {
      kind: 'hit';
      target: SlotRef;
      /** The module hit, by name — it may be gone by the time the table looks. */
      name: string;
      lost: number;
      destroyed: boolean;
      firstDown: boolean;
      negated: boolean;
    }
  /** ⚡ landed on a module: generated, restored, revived. */
  | { kind: 'charge'; target: SlotRef; amount: number }
  /** ⚡ left a module without a hit: an EMP, a spent shot, an upkeep drain, a gamble lost. */
  | { kind: 'drain'; target: SlotRef; amount: number }
  | { kind: 'reroute'; side: SideRef; moves: RerouteMove[] }
  /** An enemy action card was turned on a down: played, or discarded because it couldn't be. */
  | { kind: 'action-card'; down: number; cardId: CardId; played: boolean; reason?: string }
  | { kind: 'turn'; side: SideRef; label: string }
  | { kind: 'first-down'; side: SideRef; label: string }
  | { kind: 'outcome'; outcome: CombatOutcome; label: string };

/**
 * A fight: one enemy ship against the seats standing on the node.
 *
 * Turn order is the 1st-down rule. A seat that destroys a 1st-down module
 * hands straight to the next seat and the enemy never gets a look in; a seat
 * that runs out of downs hands the turn to the enemy, and the enemy hands it
 * back to the seat after the one that failed.
 */
export interface CombatState {
  /** Bumped each time the turn comes back round to the first seat. */
  round: number;
  /** Players in this fight — a split party only brings who is at the node. */
  participants: PlayerId[];
  enemy: EnemyInstance;
  /** Who is acting. */
  turn: SideRef;
  /**
   * Downs spent this turn by the seat holding it; for the enemy, which of its
   * action decks it's on (0 = Down 1).
   */
  down: number;
  /** 1st downs earned this turn — the enemy can chain them. */
  firstDowns: number;
  /** Set once a seat's turn can't continue; cleared when the next turn starts. */
  turnOver: TurnOver | null;
  /** The player who attacked last. Enemy attacks go to them. */
  aggressor: PlayerId | null;
  /** The seat whose failed turn gave the enemy its turn. */
  handedBy: PlayerId | null;
  /** One deck per enemy down, top card face up. */
  actionDecks: ActionDeck[];
  log: CombatLogEntry[];
  /** What happened, for the table to show. Folded into the run's events. */
  events: TableEvent[];
  outcome?: CombatOutcome;
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
