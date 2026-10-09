import type { EnemyId, PartId } from './ids';
import type { Ship } from './ship';

/**
 * The boss sheet. Regular enemies have no sheet at all — they're a cockpit off
 * the cockpit deck plus however many modules the mission depth and the party
 * call for. A boss is the one ship that's authored.
 */
export interface BossSheet {
  id: EnemyId;
  name: string;
  /** The boss's cockpit and modules, in no particular order — layout rules arrange them. */
  fixedPartIds: PartId[];
  /** Starting ⚡ per module, when the sheet prints one. Falls back to `startEnergy`. */
  startEnergy?: number;
  notes?: string;
}

/** A ship on the enemy side of the table. */
export interface EnemyInstance {
  /** Unique per spawn. */
  instanceId: EnemyId;
  name: string;
  ship: Ship;
  isBoss: boolean;
  /** Mission depth it spawned at — the board column. */
  depth: number;
}
