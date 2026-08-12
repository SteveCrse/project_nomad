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
  /** Downs each side gets per turn before the turn passes. Rules default: 4. */
  downCount: number;
  /** Action points per player per turn. */
  maxAp: number;
  /** Starting hull HP per player ship. */
  hullHp: number;
  /** Module grid shape. Capacity is normally set by the cockpit; this is the ceiling. */
  gridCols: number;
  gridRows: number;

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
   * Does damage eaten by shields still count toward the attacker's threshold?
   * True reads "damage dealt"; false reads "damage that landed".
   */
  thresholdCountsShielded: boolean;
  /** Parts drawn past the cockpit when spawning an enemy, at 1 player. */
  enemyPartsBase: number;
  /** Multiplayer scaling: extra parts drawn per player beyond the first. */
  partsPerExtraPlayer: number;
  /** Enemy hull multiplier per extra player: hp × (1 + (scale-1) × extraPlayers). */
  enemyHpScale: number;

  // ---- economy ----
  /** Scrap deck cap. Rules default: 4; some modules raise it. */
  scrapCap: number;
  /**
   * Reactor baseline: ⚡ each side gains at the start of its turn, spread
   * across the grid before generator modules tick. This is the dial that
   * decides how many downs a side can actually spend on modules.
   */
  energyPerTurn: number;
  /** Global multiplier applied to every module/item energy cost. */
  energyCostMult: number;
  /** Flat energy costs for actions that aren't printed on a card. */
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
  maxAp: 2,
  hullHp: 60,
  gridCols: 5,
  gridRows: 2,

  convThreshold: 12,
  playerConvThreshold: 12,
  enemyConvThresholds: {},
  allowThresholdUpgrades: true,
  thresholdUpgradeStep: 2,
  thresholdUpgradePowerCost: 1,
  thresholdCountsShielded: true,
  enemyPartsBase: 2,
  partsPerExtraPlayer: 2,
  enemyHpScale: 1.25,

  scrapCap: 4,
  energyPerTurn: 6,
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

/** Enemy hull after multiplayer scaling. */
export function scaledEnemyHp(config: GameConfig, baseHp: number): number {
  const extraPlayers = Math.max(0, config.playerCount - 1);
  return Math.round(baseHp * (1 + (config.enemyHpScale - 1) * extraPlayers));
}
