import type { BoardNode, Mission, StepType } from '../types/board';
import type { GameConfig } from '../types/config';
import type { NodeId, PlayerId } from '../types/ids';
import type { Rng } from '../rng';

/**
 * Dungeon progression board: mission generation, movement, and checkpoints.
 * Open question #1 in the rules doc (physical board vs. deck-built campaign)
 * is still unresolved — this models the board, since the split-party choice
 * needs one.
 */

export function generateMission(
  _seed: number,
  _sector: number,
  _config: GameConfig,
  _rng: Rng,
): Mission {
  throw new Error('engine/board: generateMission not implemented');
}

/** What entering this node triggers: combat, an Item draw, an Event draw. */
export function stepTrigger(_node: BoardNode): StepType {
  throw new Error('engine/board: stepTrigger not implemented');
}

export function movePlayer(_mission: Mission, _player: PlayerId, _to: NodeId): Mission {
  throw new Error('engine/board: movePlayer not implemented');
}

/** True when the party has split across more than one node. */
export function isPartySplit(_mission: Mission): boolean {
  throw new Error('engine/board: isPartySplit not implemented');
}
