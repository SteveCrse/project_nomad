import type { BoardNode, Mission, StepType } from '../types/board';
import type { GameConfig } from '../types/config';
import type { BossSheet } from '../types/enemy';
import type { NodeId, PlayerId } from '../types/ids';
import type { Rng } from '../rng';

/**
 * The mission step board: generation, movement, and rarity checkpoints.
 * (The rules' ideas list floats a campaign built from decks instead; the tool
 * models the board, since the split-party choice needs one.)
 *
 * Shape is Slay-the-Spire-ish: columns of 1-`maxBranches` steps, edges only
 * to the next column, a start and a boss cap at either end, and a rarity
 * checkpoint column every `checkpointEvery` steps that the whole party funnels
 * through. A step's column is its mission depth — regular enemies grow with it
 * when they spawn, so nothing about them is decided here.
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
  bosses: BossSheet[] = [],
  /** The rarity ceiling the mission starts at — later sectors start higher. */
  startRarity = config.maxRarityNow,
): Mission {
  const length = Math.max(3, config.missionLength);
  const columns: BoardNode[][] = [];
  let checkpoints = 0;

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
        // Each checkpoint stacks on the last: the deck gets rarer the deeper
        // the party goes.
        node.raisesRarityTo = Math.min(5, startRarity + (checkpoints + 1) * config.rarityPerCheckpoint);
        node.isRearrangePoint = config.checkpointsAreRearrangePoints;
      }
      if (type === 'boss' && bosses.length > 0) node.bossId = rng.pick(bosses).id;
      return node;
    });

    if (isCheckpoint) checkpoints += 1;
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
