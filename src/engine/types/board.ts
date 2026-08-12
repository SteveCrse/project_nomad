import type { EnemyId, NodeId, PlayerId } from './ids';

/** Step types placed on the dungeon progression board. */
export type StepType = 'start' | 'combat' | 'loot' | 'event' | 'empty' | 'checkpoint' | 'boss';

export interface BoardNode {
  id: NodeId;
  type: StepType;
  /** Nodes reachable from here — more than one means the party may split. */
  next: NodeId[];
  /** Depth into the mission, 0 = start. Layout and difficulty both use it. */
  column: number;
  /** Position within the column, for layout only. */
  row: number;
  /** Crossing a checkpoint raises the rarity ceiling for later draws. */
  raisesRarityTo?: number;
  /** Proposed: checkpoints double as module rearrangement points. */
  isRearrangePoint?: boolean;
  enemyId?: EnemyId;
  /** Markers dropped by events, e.g. a Gravity Well chit. */
  markers?: string[];
  /** The step has already been triggered — re-entering it does nothing. */
  resolved?: boolean;
}

export interface Mission {
  seed: number;
  sector: number;
  nodes: BoardNode[];
  startNodeId: NodeId;
  bossNodeId: NodeId;
  /** Where each player currently stands; separate entries mean a split party. */
  positions: Record<PlayerId, NodeId>;
  /** Columns in the generated map, including start and boss. */
  length: number;
}
