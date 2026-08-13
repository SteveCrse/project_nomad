import type { BoardNode, Mission, StepType } from '../types/board';
import type { GameConfig } from '../types/config';
import type { EnemyStatBlock } from '../types/enemy';
import type { NodeId, PlayerId } from '../types/ids';
import type { Rng } from '../rng';

/**
 * Dungeon progression board: mission generation, movement, and checkpoints.
 * Open question #1 in the rules doc (physical board vs. deck-built campaign)
 * is still unresolved — this models the board, since the split-party choice
 * needs one.
 *
 * Shape is Slay-the-Spire-ish: columns of 1-`maxBranches` nodes, edges only
 * to the next column, a start and a boss cap at either end, and a checkpoint
 * column every `checkpointEvery` steps that the whole party has to funnel
 * through (which is what makes it a natural rearrangement point).
 */

/** Step weights for a normal column. Blank steps exist but are rare. */
const STEP_WEIGHTS: { type: StepType; weight: number }[] = [
  { type: 'combat', weight: 45 },
  { type: 'loot', weight: 22 },
  { type: 'event', weight: 26 },
  { type: 'empty', weight: 7 },
];

export function generateMission(
  seed: number,
  sector: number,
  config: GameConfig,
  rng: Rng,
  enemies: EnemyStatBlock[] = [],
): Mission {
  const length = Math.max(3, config.missionLength);
  const columns: BoardNode[][] = [];

  for (let col = 0; col < length; col++) {
    const isStart = col === 0;
    const isBoss = col === length - 1;
    const isCheckpoint =
      !isStart && !isBoss && config.checkpointEvery > 0 && col % config.checkpointEvery === 0;

    // Start, boss and checkpoints are single nodes — the party regroups there.
    const width = isStart || isBoss || isCheckpoint ? 1 : rng.int(1, Math.max(1, config.maxBranches));

    const nodes: BoardNode[] = Array.from({ length: width }, (_, row) => {
      const type: StepType = isStart
        ? 'start'
        : isBoss
          ? 'boss'
          : isCheckpoint
            ? 'checkpoint'
            : rng.pickWeighted(
                STEP_WEIGHTS.map((s) => s.type),
                STEP_WEIGHTS.map((s) => s.weight),
              );

      const node: BoardNode = {
        id: `n${col}-${row}`,
        type,
        next: [],
        column: col,
        row,
        markers: [],
      };

      if (isCheckpoint) {
        node.raisesRarityTo = Math.min(5, config.maxRarityNow + config.rarityPerCheckpoint);
        node.isRearrangePoint = config.checkpointsAreRearrangePoints;
      }
      if (type === 'combat' || type === 'boss') {
        node.enemyId = pickEnemy(enemies, type === 'boss', col / length, rng);
      }
      return node;
    });

    columns.push(nodes);
  }

  // Wire each column to the next: every node gets at least one exit, and
  // every node in the next column gets at least one entrance.
  for (let col = 0; col < columns.length - 1; col++) {
    const here = columns[col]!;
    const there = columns[col + 1]!;
    const covered = new Set<NodeId>();

    for (const node of here) {
      const exits = Math.min(there.length, rng.int(1, Math.min(2, there.length)));
      const start = rng.int(0, there.length - 1);
      for (let i = 0; i < exits; i++) {
        const target = there[(start + i) % there.length]!;
        if (!node.next.includes(target.id)) node.next.push(target.id);
        covered.add(target.id);
      }
    }
    for (const target of there) {
      if (covered.has(target.id)) continue;
      const from = here[rng.int(0, here.length - 1)]!;
      from.next.push(target.id);
    }
  }

  const nodes = columns.flat();
  const startNodeId = columns[0]![0]!.id;
  const bossNodeId = columns[columns.length - 1]![0]!.id;

  return { seed, sector, nodes, startNodeId, bossNodeId, positions: {}, length };
}

/** Later columns lean elite; the boss column takes the boss. */
function pickEnemy(
  enemies: EnemyStatBlock[],
  boss: boolean,
  depth: number,
  rng: Rng,
): string | undefined {
  const pool = enemies.filter((e) => !!e.isBoss === boss);
  if (pool.length === 0) return undefined;
  if (boss) return rng.pick(pool).id;
  // Weight by how big a ship each enemy rolls against the depth we're at.
  // With no HP anywhere, part count *is* the difficulty tier: more parts means
  // more shields to grind through and more guns pointing back.
  const hardest = Math.max(1, ...pool.map((e) => e.partsBase));
  const weights = pool.map((e) => {
    const tier = e.partsBase / hardest;
    return Math.max(0.05, 1 - Math.abs(tier - Math.max(0.25, depth)));
  });
  return rng.pickWeighted(pool, weights).id;
}

export const nodeById = (mission: Mission, id: NodeId): BoardNode | undefined =>
  mission.nodes.find((n) => n.id === id);

/** What entering this node triggers: combat, an Item draw, an Event draw. */
export function stepTrigger(node: BoardNode): StepType {
  return node.type;
}

export function movePlayer(mission: Mission, player: PlayerId, to: NodeId): Mission {
  return { ...mission, positions: { ...mission.positions, [player]: to } };
}

/** True when the party has split across more than one node. */
export function isPartySplit(mission: Mission): boolean {
  return new Set(Object.values(mission.positions)).size > 1;
}

/** Nodes with at least one player on them, in board order. */
export function occupiedNodes(mission: Mission): NodeId[] {
  const ids = new Set(Object.values(mission.positions));
  return mission.nodes.filter((n) => ids.has(n.id)).map((n) => n.id);
}

export function playersAt(mission: Mission, nodeId: NodeId): PlayerId[] {
  return Object.entries(mission.positions)
    .filter(([, node]) => node === nodeId)
    .map(([player]) => player);
}

/** Where a player may go next — empty at the boss node. */
export function optionsFor(mission: Mission, player: PlayerId): BoardNode[] {
  const here = mission.positions[player];
  if (!here) return [];
  const node = nodeById(mission, here);
  if (!node) return [];
  return node.next.map((id) => nodeById(mission, id)).filter((n): n is BoardNode => !!n);
}

export function markNodeResolved(mission: Mission, nodeId: NodeId): Mission {
  return {
    ...mission,
    nodes: mission.nodes.map((n) => (n.id === nodeId ? { ...n, resolved: true } : n)),
  };
}

export function addMarker(mission: Mission, nodeId: NodeId, marker: string): Mission {
  return {
    ...mission,
    nodes: mission.nodes.map((n) =>
      n.id === nodeId ? { ...n, markers: [...(n.markers ?? []), marker] } : n,
    ),
  };
}
