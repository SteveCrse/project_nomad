import type { BoardNode, GameState, PlayerId } from '@engine/types';
import { board } from '@engine';
import { Button, Toggle } from '@/components/ds';
import { LogPanel } from '@/components/game/LogPanel';
import { useGame, useGameStore } from '@/store/gameStore';
import { useConfig } from '@/store/configStore';

/**
 * The dungeon progression board.
 *
 * Columns run left to right; the party moves one column at a time and every
 * branch is a decision. Checkpoint and boss columns are single nodes, which
 * is what makes them natural regroup/rearrange points.
 */
export function MissionView() {
  const state = useGame();
  const newRun = useGameStore((s) => s.newRun);

  if (!state) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="font-display text-[22px] font-bold">NO RUN LOADED</div>
        <div className="max-w-[520px] text-center text-[15px] text-putty-700">
          A run generates a mission from the current config: board length, branching, checkpoint
          cadence, enemy scaling and the rarity ceiling all come out of the sidebar.
        </div>
        <Button onClick={() => newRun()}>Start a run</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <MissionHeader state={state} />
        <MapBoard state={state} />
        <MoveBar state={state} />
      </div>
      <LogPanel log={state.log} className="w-[380px] flex-none" />
    </div>
  );
}

function MissionHeader({ state }: { state: GameState }) {
  const newRun = useGameStore((s) => s.newRun);
  const setSplit = useGameStore((s) => s.setSplit);
  const nextMission = useGameStore((s) => s.nextMission);
  const config = useConfig();
  const multiplayer = state.party.players.length > 1;

  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <div className="font-display text-[20px] font-bold">MISSION · SECTOR {state.sector}</div>
      <div className="font-mono text-[12px] text-putty-700">
        SEED {state.seed} · {state.mission.length} STEPS · TIER CEILING {state.maxRarityNow}
      </div>
      <div className="font-mono text-[12px] text-putty-700">
        PARTS {state.decks.parts.drawPile.length} · ITEMS {state.decks.items.drawPile.length} ·
        EVENTS {state.decks.events.drawPile.length}
      </div>

      {multiplayer && (
        <div className="flex items-center gap-2">
          <Toggle on={state.split} onChange={setSplit} label="split party" />
          <span className="font-mono text-[11px] text-putty-700">
            {state.split ? 'SPLIT — SEATS MOVE ALONE' : 'TOGETHER'}
          </span>
        </div>
      )}

      <div className="ml-auto flex gap-2">
        {state.phase === 'victory' && (
          <Button size="sm" onClick={nextMission}>
            Next sector
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => newRun()}>
          New run
        </Button>
      </div>
      {config.checkpointEvery > 0 && (
        <div className="w-full font-mono text-[11px] text-putty-700">
          CHECKPOINT EVERY {config.checkpointEvery} STEPS · +{config.rarityPerCheckpoint} TIER EACH
          {config.checkpointsAreRearrangePoints ? ' · DOUBLES AS A REARRANGE POINT' : ''}
        </div>
      )}
    </div>
  );
}

const NODE_STYLE: Record<string, { label: string; color: string }> = {
  start: { label: 'START', color: 'var(--putty-700)' },
  combat: { label: 'COMBAT', color: 'var(--toggle-red-500)' },
  loot: { label: 'LOOT', color: 'var(--crt-green-700)' },
  event: { label: 'EVENT', color: 'var(--role-rds)' },
  empty: { label: 'EMPTY', color: 'var(--putty-600)' },
  checkpoint: { label: 'CHECK', color: 'var(--amber-500)' },
  boss: { label: 'BOSS', color: 'var(--n-900)' },
};

function MapBoard({ state }: { state: GameState }) {
  const moveTo = useGameStore((s) => s.moveTo);
  const columns = groupByColumn(state.mission.nodes);
  const mover = state.awaitingMove[0];
  const options = mover ? board.optionsFor(state.mission, mover).map((n) => n.id) : [];
  const canMove = state.phase === 'map' && !!mover;

  return (
    <div className="min-h-0 flex-1 overflow-auto border-2 border-border-strong bg-surface-panel p-4 shadow-raised">
      <div className="flex min-w-max items-stretch gap-3">
        {columns.map((column, col) => (
          <div key={col} className="flex flex-col justify-center gap-3">
            {column.map((node) => {
              const style = NODE_STYLE[node.type] ?? NODE_STYLE.empty!;
              const here = board.playersAt(state.mission, node.id);
              const reachable = options.includes(node.id);
              return (
                <button
                  key={node.id}
                  disabled={!canMove || !reachable}
                  onClick={() => mover && moveTo(mover, node.id)}
                  aria-label={`${node.id} ${style.label}${node.enemyId ? ` ${node.enemyId}` : ''}${
                    reachable && canMove ? ' — reachable' : ''
                  }`}
                  className={[
                    'flex w-[118px] cursor-pointer flex-col gap-1 border-2 px-2 py-2 text-left',
                    'disabled:cursor-default',
                    reachable && canMove
                      ? 'border-accent-primary bg-putty-100 shadow-raised'
                      : node.resolved
                        ? 'border-putty-500 bg-putty-200 opacity-60'
                        : 'border-putty-500 bg-putty-100',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="font-mono text-[10px] tracking-[0.1em]"
                      style={{ color: style.color }}
                    >
                      {style.label}
                    </span>
                    <span className="font-mono text-[9px] text-putty-600">{node.id}</span>
                  </div>

                  {node.enemyId && (
                    <div className="truncate text-[12px] text-putty-800">{node.enemyId}</div>
                  )}
                  {node.raisesRarityTo && (
                    <div className="font-mono text-[10px] text-amber-700">
                      TIER → {node.raisesRarityTo}
                    </div>
                  )}
                  {(node.markers?.length ?? 0) > 0 && (
                    <div className="font-mono text-[9px] text-role-rds">
                      {node.markers!.join(' · ')}
                    </div>
                  )}

                  <div className="mt-auto flex h-4 gap-1">
                    {here.map((id) => (
                      <PlayerPip key={id} state={state} id={id} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerPip({ state, id }: { state: GameState; id: PlayerId }) {
  const player = state.party.players.find((p) => p.id === id);
  if (!player) return null;
  return (
    <span
      className="flex h-4 w-6 items-center justify-center border border-n-900 font-mono text-[9px] text-n-950"
      style={{ background: player.accent }}
      title={player.ship.name}
    >
      {player.label}
    </span>
  );
}

function MoveBar({ state }: { state: GameState }) {
  const mover = state.awaitingMove[0];
  const seat = state.party.players.find((p) => p.id === mover);
  const phaseText: Record<string, string> = {
    map: seat
      ? state.split
        ? `${seat.label} picks the next step.`
        : 'The party moves together — pick the next step.'
      : 'Waiting.',
    combat: 'Combat in progress — switch to the Table.',
    loot: 'Loot phase — resolve the wreck.',
    event: 'An event is face up.',
    reward: 'Loot drawn — hand it out.',
    rearrange: 'Rearrangement point.',
    victory: 'Boss down. Mission complete.',
    defeat: 'Party wiped.',
    setup: 'Setting up.',
  };

  return (
    <div className="flex flex-none items-center gap-3 border-2 border-border-strong bg-surface-panel px-3 py-2.5 shadow-raised">
      <span className="font-display text-[13px] font-bold">{state.phase.toUpperCase()}</span>
      <span className="text-[14px] text-putty-700">{phaseText[state.phase]}</span>
      {state.awaitingMove.length > 1 && (
        <span className="ml-auto font-mono text-[11px] text-putty-700">
          {state.awaitingMove.length} SEATS STILL TO MOVE
        </span>
      )}
    </div>
  );
}

function groupByColumn(nodes: BoardNode[]): BoardNode[][] {
  const columns: BoardNode[][] = [];
  for (const node of nodes) {
    (columns[node.column] ??= []).push(node);
  }
  return columns.map((c) => c ?? []);
}
