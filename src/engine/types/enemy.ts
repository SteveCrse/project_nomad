import type { EnemyId, PartId } from './ids';
import type { Ship } from './ship';

/**
 * Authored enemy stat block.
 *
 * An enemy has no HP: how much it can take is whatever its ship is carrying —
 * charged shields, then the cockpit's own pool. The stat block therefore says
 * how *big* a ship to roll (`partsBase`) and how hard it is to convert on
 * (`convThreshold`), and the Parts deck decides the rest at spawn time.
 */
export interface EnemyStatBlock {
  id: EnemyId;
  name: string;
  /**
   * Damage an attacker must deal within one set of downs to earn a fresh set
   * against this enemy. Per-enemy, and overridable from the config sidebar.
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
  /** Unique per spawn — two Scavenger Chains on the table are two sides. */
  instanceId: EnemyId;
  statBlockId: EnemyId;
  name: string;
  ship: Ship;
  /** Effective threshold after config overrides. */
  convThreshold: number;
  /** Damage dealt so far in the current set of downs. */
  damageThisDownSet: number;
  downsUsed: number;
  /** Downs per set for this enemy — stat block override, else config. */
  downCount: number;
  isBoss: boolean;
  /** Parts that came off the Parts deck for this ship, for the loot phase. */
  drawnPartIds: PartId[];
}
