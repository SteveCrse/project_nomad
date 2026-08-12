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
   * Damage needed within one set of downs to earn a fresh set.
   * Used when an enemy has no per-enemy override.
   */
  convThreshold: number;
  /** Per-enemy threshold overrides, keyed by stat block id. */
  enemyConvThresholds: Record<EnemyId, number>;
  /**
   * Can players raise their own threshold (making enemies work harder to
   * convert against them)? Open question #2 in the rules doc.
   */
  allowThresholdUpgrades: boolean;
  /** Parts drawn past the cockpit when spawning an enemy, at 1 player. */
  enemyPartsBase: number;
  /** Multiplayer scaling: extra parts drawn per player beyond the first. */
  partsPerExtraPlayer: number;
  /** Enemy hull multiplier per extra player: hp × (1 + (scale-1) × extraPlayers). */
  enemyHpScale: number;

  // ---- economy ----
  /** Scrap deck cap. Rules default: 4; some modules raise it. */
  scrapCap: number;
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
  /** A checkpoint every N steps. */
  checkpointEvery: number;
  /** Proposed in the rules doc: checkpoints double as rearrangement points. */
  checkpointsAreRearrangePoints: boolean;
  /** Rarity ceiling right now — tiers above this are out of the bag. */
  maxRarityNow: number;
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
  enemyConvThresholds: {},
  allowThresholdUpgrades: true,
  enemyPartsBase: 2,
  partsPerExtraPlayer: 2,
  enemyHpScale: 1.25,

  scrapCap: 4,
  energyCostMult: 1,
  energyCostReroute: 0,
  energyCostChargeShield: 1,
  handSize: 3,
  lootPerNode: 1,
  carriedPartsCap: 4,

  checkpointEvery: 5,
  checkpointsAreRearrangePoints: true,
  maxRarityNow: 3,
};

/** Resolve an enemy's effective threshold: per-enemy override, else global. */
export function effectiveThreshold(
  config: GameConfig,
  enemyId: EnemyId,
  statBlockThreshold: number,
): number {
  return config.enemyConvThresholds[enemyId] ?? statBlockThreshold ?? config.convThreshold;
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
