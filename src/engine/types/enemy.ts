import type { EnemyId, PartId } from './ids';
import type { Ship } from './ship';

/**
 * Authored enemy stat block. The rules define enemies by an HP pool and a
 * conversion threshold; the ship itself is generated from the Parts deck at
 * spawn time, so parts are a spawn recipe rather than a fixed loadout.
 */
export interface EnemyStatBlock {
  id: EnemyId;
  name: string;
  /** Win condition: reduce to 0. */
  hpPool: number;
  /**
   * Damage this enemy must deal within one set of downs to earn a fresh set.
   * Per-enemy, and overridable from the config sidebar for tuning.
   */
  convThreshold: number;
  /** Parts drawn past the cockpit at 1 player, before multiplayer scaling. */
  partsBase: number;
  /** Downs per turn, when this enemy deviates from the global default. */
  downCount?: number;
  /** Fixed parts for scripted enemies/bosses; omit to draw from the Parts deck. */
  fixedPartIds?: PartId[];
  isBoss?: boolean;
  notes?: string;
}

/** A spawned enemy: stat block joined to the ship rolled for it. */
export interface EnemyInstance {
  statBlockId: EnemyId;
  ship: Ship;
  hp: number;
  hpMax: number;
  /** Effective threshold after config overrides. */
  convThreshold: number;
  /** Damage dealt so far in the current set of downs. */
  damageThisDownSet: number;
  downsUsed: number;
}
