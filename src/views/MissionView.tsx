import { LayoutGroup, motion } from 'motion/react';
import type { BoardNode, GameState, PlayerId } from '@engine/types';
import { board, enemyModuleCount } from '@engine';
import { BOSSES_BY_ID } from '@data';
import { Button, Toggle } from '@/components/ds';
import { LogPanel } from '@/components/game/LogPanel';
import { useGame, useGameStore } from '@/store/gameStore';
import { useConfig } from '@/store/configStore';

/**
 * The mission step board.
 *
 * Columns run left to right; the party moves one column at a time and every
 * branch is a decision. A step's column is its depth, and a regular enemy
 * spawns with depth + players modules — so each combat step says how big a
 * ship to expect. Rarity checkpoints and the boss are single nodes the whole
 * party funnels through.
 */
export function MissionView() {
  const state = useGame();
  const newRun = useGameStore((s) => s.newRun);

  if (!state) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="font-display text-[22px] font-bold">NO RUN LOADED</div>
        <div className="max-w-[520px] text-center text-[15px] text-putty-700">
          A run opens with the draft, then generates a mission from the current config: board
          length, branching, rarity checkpoints and enemy scaling all come out of the sidebar.
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
        COCKPITS {state.decks.cockpits.drawPile.length} · PARTS {state.decks.parts.drawPile.length} · ITEMS{' '}
        {state.decks.items.drawPile.length} · EVENTS {state.decks.events.drawPile.length}
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
          RARITY CHECKPOINT EVERY {config.checkpointEvery} STEPS · +{config.rarityPerCheckpoint} TIER EACH
          {config.commonsRemovedPerCheckpoint > 0 ? ` · −${config.commonsRemovedPerCheckpoint} COMMONS` : ''}
          {config.checkpointsAreRearrangePoints ? ' · DOUBLES AS A REARRANGE POINT' : ''} · ENEMY MODULES = DEPTH ×{' '}
          {config.enemyModulesPerDepth} + PLAYERS × {config.enemyModulesPerPlayer}
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
  checkpoint: { label: 'RARITY', color: 'var(--amber-500)' },
  boss: { label: 'BOSS', color: 'var(--n-900)' },
};

function MapBoard({ state }: { state: GameState }) {
  const moveTo = useGameStore((s) => s.moveTo);
  const config = useConfig();
  // Who would fight here: the whole party moving together, or the one seat
  // moving on its own when it's split.
  const party = state.split ? 1 : state.party.players.filter((p) => !p.destroyed).length;
  const columns = groupByColumn(state.mission.nodes);
  const mover = state.awaitingMove[0];
  const options = mover ? board.optionsFor(state.mission, mover).map((n) => n.id) : [];
  const canMove = state.phase === 'map' && !!mover;

  return (
    <div className="min-h-0 flex-1 overflow-auto border-2 border-border-strong bg-surface-panel p-4 shadow-raised">
      <LayoutGroup>
      <div className="flex min-w-max items-stretch gap-3" key={`${state.seed}:${state.sector}`}>
        {columns.map((column, col) => (
          <div key={col} className="flex flex-col justify-center gap-3">
            {column.map((node, row) => {
              const style = NODE_STYLE[node.type] ?? NODE_STYLE.empty!;
              const here = board.playersAt(state.mission, node.id);
              const reachable = options.includes(node.id);
              return (
                <motion.button
                  key={node.id}
                  initial={{ opacity: 0, x: -16, scale: 0.92 }}
                  animate={{ opacity: node.resolved && !(reachable && canMove) ? 0.6 : 1, x: 0, scale: 1 }}
                  transition={{ delay: col * 0.05 + row * 0.03, type: 'spring', stiffness: 320, damping: 26 }}
                  whileHover={reachable && canMove ? { y: -3, scale: 1.03 } : {}}
                  whileTap={reachable && canMove ? { scale: 0.97 } : {}}
                  disabled={!canMove || !reachable}
                  onClick={() => mover && moveTo(mover, node.id)}
                  aria-label={`${node.id} ${style.label}${node.bossId ? ` ${node.bossId}` : ''}${
                    reachable && canMove ? ' — reachable' : ''
                  }`}
                  className={[
                    'flex w-[118px] cursor-pointer flex-col gap-1 border-2 px-2 py-2 text-left',
                    'disabled:cursor-default',
                    reachable && canMove
                      ? 'attention border-accent-primary bg-putty-100 shadow-raised'
                      : node.resolved
                        ? 'border-putty-500 bg-putty-200'
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

                  {node.type === 'combat' && (
                    <div
                      className="font-mono text-[10px] text-putty-800"
                      title="Mission depth + players: what a regular enemy spawns with here"
                    >
                      DEPTH {node.column} · ≈{enemyModuleCount(config, node.column, party)} MOD
                    </div>
                  )}
                  {node.bossId && (
                    <div className="truncate text-[12px] text-putty-800">
                      {BOSSES_BY_ID[node.bossId]?.name ?? node.bossId}
                    </div>
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
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
      </LayoutGroup>
    </div>
  );
}

function PlayerPip({ state, id }: { state: GameState; id: PlayerId }) {
  const player = state.party.players.find((p) => p.id === id);
  if (!player) return null;
  // The same pip wherever the seat stands, so moving it glides it across the board.
  return (
    <motion.span
      layoutId={`pip-${id}`}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="flex h-4 w-6 items-center justify-center border border-n-900 font-mono text-[9px] text-n-950"
      style={{ background: player.accent }}
      title={player.ship.name}
    >
      {player.label}
    </motion.span>
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
    loot:
      state.prompt?.kind === 'salvage'
        ? 'The boss is down — split its surviving parts round the table.'
        : 'An enemy is down — take its ship over, or leave it.',
    event: 'An event is face up.',
    reward: 'Loot drawn — hand it out.',
    rearrange: 'Rebuild from the scrap deck in the Ship Builder.',
    victory: 'Boss down. Mission complete.',
    defeat: 'Every cockpit is destroyed. The team loses.',
    setup: 'The draft — build the ships in the Ship Builder before the mission starts.',
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
