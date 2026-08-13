import type { EnemyId } from './ids';

/**
 * Every tunable knob for a playtest run. This is the contract between the
 * config sidebar (which writes it) and the engine (which will read it) —
 * nothing in the rules that we expect to tune should be a literal in engine code.
 */
export interface GameConfig {
  // ---- party ----
  /** Seats at the table, 1-4. */
  playerCount: number;
  /**
   * Downs each side gets per turn before the turn passes. Rules default: 4.
   * With energy, this is what rations a turn: one down per activation, and a
   * module fires as often as its own pool can pay for.
   */
  downCount: number;
  /**
   * Parts each seat drafts from the Parts deck at the start of a run, drawn
   * one card at a time and assembled before the mission begins. 0 skips the
   * draft and rolls the pre-set loadouts out instead.
   */
  startingPartsDraws: number;

  // ---- combat ----
  /**
   * Damage an attacker must deal within one set of downs to earn a fresh set.
   * Used when an enemy has no per-enemy override.
   */
  convThreshold: number;
  /** The party's own threshold — what an enemy must beat to convert on them. */
  playerConvThreshold: number;
  /** Per-enemy threshold overrides, keyed by stat block id. */
  enemyConvThresholds: Record<EnemyId, number>;
  /**
   * Can players raise their own threshold (making enemies work harder to
   * convert against them)? Open question #2 in the rules doc.
   */
  allowThresholdUpgrades: boolean;
  /** Threshold gained per upgrade bought at a rearrangement point. */
  thresholdUpgradeStep: number;
  /** Attack power lost per point... per upgrade — the cost side of the trade. */
  thresholdUpgradePowerCost: number;
  /**
   * Does damage eaten by shield modules still count toward the attacker's
   * threshold? True reads "damage dealt"; false counts only what reached the
   * cockpit — the ship's last shield — or went past it.
   */
  thresholdCountsShielded: boolean;
  /**
   * Cap every offensive module at one shot per set of downs, the way the
   * rules draft first read it. Off, a module fires as often as its own pool
   * can pay for — one down each — and only cards printed `oncePerSet` are
   * capped.
   */
  offensiveOncePerSet: boolean;
  /** Parts drawn past the cockpit when spawning an enemy, at 1 player. */
  enemyPartsBase: number;
  /**
   * Multiplayer scaling: extra parts drawn per player beyond the first. With
   * no HP anywhere, this *is* the difficulty dial — more parts means more
   * shields to chew through and more guns pointing back.
   */
  partsPerExtraPlayer: number;

  // ---- economy ----
  /** Scrap deck cap. Rules default: 4; some modules raise it. */
  scrapCap: number;
  /**
   * Reactor baseline: ⚡ each side gains at the start of its turn, spread
   * across the grid before generator modules tick. This is the dial that
   * decides how many downs a side can actually spend on modules.
   */
  energyPerTurn: number;
  /**
   * Does the reactor baseline top weapons up too? Off (the default), a gun is
   * only ever loaded by rerouting charge into it from a neighbour, which is
   * what makes generator placement a decision.
   */
  weaponsDrawFromReactor: boolean;
  /** Global multiplier applied to every module/item energy cost. */
  energyCostMult: number;
  /** Energy the grid loses per transfer in a reroute pass. */
  energyCostReroute: number;
  energyCostChargeShield: number;
  /** Item cards held in hand. */
  handSize: number;
  /** Item cards drawn per Loot step. */
  lootPerNode: number;
  /** Unequipped parts a player may carry (rules: don't hoard). */
  carriedPartsCap: number;

  // ---- board / rarity ----
  /** Columns on the generated map, start and boss included. */
  missionLength: number;
  /** Widest a column of the map may get — the ceiling on branching. */
  maxBranches: number;
  /** A checkpoint every N steps. */
  checkpointEvery: number;
  /** Proposed in the rules doc: checkpoints double as rearrangement points. */
  checkpointsAreRearrangePoints: boolean;
  /** Rarity ceiling right now — tiers above this are out of the bag. */
  maxRarityNow: number;
  /** Rarity ceiling gained each time the party crosses a checkpoint. */
  rarityPerCheckpoint: number;
}

/** Defaults taken from the rules doc and the test tool's DEFAULTS block. */
export const DEFAULT_CONFIG: GameConfig = {
  playerCount: 4,
  downCount: 4,
  startingPartsDraws: 5,

  convThreshold: 12,
  playerConvThreshold: 12,
  enemyConvThresholds: {},
  allowThresholdUpgrades: true,
  thresholdUpgradeStep: 2,
  thresholdUpgradePowerCost: 1,
  thresholdCountsShielded: true,
  offensiveOncePerSet: false,
  enemyPartsBase: 2,
  partsPerExtraPlayer: 2,

  scrapCap: 4,
  energyPerTurn: 6,
  weaponsDrawFromReactor: false,
  energyCostMult: 1,
  energyCostReroute: 0,
  energyCostChargeShield: 1,
  handSize: 3,
  lootPerNode: 1,
  carriedPartsCap: 4,

  missionLength: 10,
  maxBranches: 3,
  checkpointEvery: 5,
  checkpointsAreRearrangePoints: true,
  maxRarityNow: 3,
  rarityPerCheckpoint: 1,
};

/** Resolve an enemy's effective threshold: per-enemy override, else global. */
export function effectiveThreshold(
  config: GameConfig,
  enemyId: EnemyId,
  statBlockThreshold: number,
): number {
  return config.enemyConvThresholds[enemyId] ?? statBlockThreshold ?? config.convThreshold;
}

/**
 * The party's own threshold: what an enemy has to deal to this player within
 * one set to earn a fresh one. `bonus` is what the player bought with power.
 */
export function playerThreshold(config: GameConfig, bonus = 0): number {
  return config.playerConvThreshold + (config.allowThresholdUpgrades ? bonus : 0);
}

/** Parts drawn past the cockpit for an enemy spawn at the current player count. */
export function partsForSpawn(config: GameConfig, partsBase: number): number {
  const extraPlayers = Math.max(0, config.playerCount - 1);
  return partsBase + config.partsPerExtraPlayer * extraPlayers;
}
