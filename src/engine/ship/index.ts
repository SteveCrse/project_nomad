import type { AdjacencyBonus, Ship, ShipSlot } from '../types/ship';
import type { EnemyInstance, EnemyStatBlock } from '../types/enemy';
import type { GameConfig } from '../types/config';
import type { PartId, SlotIndex } from '../types/ids';
import type { Deck } from '../deck';
import type { Rng } from '../rng';

/**
 * Ship assembly, both for players (builder / rearrangement points) and for
 * enemies (drawn from the Parts deck until the next Cockpit turns up).
 */

/** An empty grid sized by the cockpit's slot count. */
export function createShip(_cockpitId: PartId, _name: string, _config: GameConfig): Ship {
  throw new Error('engine/ship: createShip not implemented');
}

/**
 * Spawn an enemy ship: draw parts onto the current cockpit until another
 * Cockpit appears, then keep drawing `partsPerExtraPlayer` more per extra player.
 */
export function spawnEnemyShip(
  _statBlock: EnemyStatBlock,
  _partsDeck: Deck,
  _config: GameConfig,
  _rng: Rng,
): { enemy: EnemyInstance; partsDeck: Deck } {
  throw new Error('engine/ship: spawnEnemyShip not implemented');
}

export function equipPart(_ship: Ship, _slot: SlotIndex, _partId: PartId): Ship {
  throw new Error('engine/ship: equipPart not implemented');
}

export function detachPart(_ship: Ship, _slot: SlotIndex): { ship: Ship; partId: PartId | null } {
  throw new Error('engine/ship: detachPart not implemented');
}

/** Move energy between module pools; a Redistributor may make this free. */
export function rerouteEnergy(
  _ship: Ship,
  _from: SlotIndex,
  _to: SlotIndex,
  _amount: number,
  _config: GameConfig,
): Ship {
  throw new Error('engine/ship: rerouteEnergy not implemented');
}

/** Find GEN → RDS → WPN chains and any other adjacency payoffs. */
export function findAdjacencyBonuses(_ship: Ship): AdjacencyBonus[] {
  throw new Error('engine/ship: findAdjacencyBonuses not implemented');
}

/** Clear per-set flags — called when a side opens a fresh set of downs. */
export function resetDownSetFlags(_slots: ShipSlot[]): ShipSlot[] {
  throw new Error('engine/ship: resetDownSetFlags not implemented');
}
