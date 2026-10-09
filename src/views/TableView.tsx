import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameState } from '@engine/types';
import { combat as combatEngine } from '@engine';
import { EnemyPanel } from '@/components/game/EnemyPanel';
import { PlayerPanel } from '@/components/game/PlayerPanel';
import { ActionBar } from '@/components/game/ActionBar';
import { LogPanel } from '@/components/game/LogPanel';
import { DeckStack, DiscardStack, LootBag } from '@/components/game/DeckStack';
import { Button } from '@/components/ds';
import { RARITY_COLOR } from '@/lib/palette';
import { aggroOf } from '@/lib/combatView';
import { combatControls, targetAction } from '@/lib/combatControls';
import { useConfig } from '@/store/configStore';
import { useBusy, useGame, useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/**
 * The table during a fight. The enemy has the top of it — its own zone,
 * drawn hostile, its ship facing down at the players. Every seat sits
 * side by side underneath, front-up, the one on the clock lit and the rest
 * greyed back. Along the bottom, the bar with what the seat on the clock can
 * do; down the right, the transcript.
 *
 * Out of combat it falls back to the deck counters, so the table is still
 * worth looking at between steps.
 */
export function TableView() {
  const state = useGame();
  const newRun = useGameStore((s) => s.newRun);
  const logOpen = useUiStore((s) => s.logOpen);
  const toggleLog = useUiStore((s) => s.toggleLog);

  if (!state) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="font-display text-[20px] font-bold">NOTHING ON THE TABLE</div>
        <Button onClick={() => newRun()}>Start a run</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {state.combat ? <CombatSurface state={state} /> : <IdleTable state={state} />}
      </div>
      <div className="flex flex-none flex-col gap-1.5">
        <button
          onClick={toggleLog}
          className="cursor-pointer border border-border-strong bg-crt-glass px-2 py-1 font-mono text-[10px] tracking-console text-crt-green-500 hover:bg-crt-glass-raised"
          title={logOpen ? 'Hide the transcript' : 'Show the transcript'}
        >
          {logOpen ? 'LOG ▸' : '◂ LOG'}
        </button>
        <AnimatePresence initial={false}>
          {logOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="flex min-h-0 flex-1 overflow-hidden"
            >
              <LogPanel log={state.log} className="w-[320px] flex-none" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CombatSurface({ state }: { state: GameState }) {
  const config = useConfig();
  const busy = useBusy();
  const mode = useUiStore((s) => s.combatMode);
  const manualDamage = useUiStore((s) => s.manualDamage);
  const setMode = useUiStore((s) => s.setCombatMode);
  const pickSource = useUiStore((s) => s.pickRerouteSource);
  const addRerouteLeg = useUiStore((s) => s.addRerouteLeg);
  const takeDown = useGameStore((s) => s.takeDown);

  const fight = state.combat!;
  const side = fight.outcome ? undefined : fight.turn;
  const aggro = aggroOf(state);

  const controls = combatControls(state, config, busy ? null : mode, manualDamage, {
    setMode,
    take: (action) => {
      if (takeDown(action)) setMode(null);
    },
    pickSource,
    addLeg: (from, to) => addRerouteLeg({ from, to, amount: 1 }),
  });

  const participants = state.party.players.filter((p) => fight.participants.includes(p.id));
  const onTarget = (slot: number) => {
    const action = targetAction(mode, manualDamage, slot);
    if (action && takeDown(action)) setMode(null);
  };

  // Keep the seat on the clock in view when the turn moves along the row —
  // sideways only, so the enemy stays where it is above.
  const holder = side?.kind === 'player' ? side.id : null;
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const seat = holder ? row.current?.querySelector<HTMLElement>(`[data-seat="${holder}"]`) : null;
    if (!seat || !row.current) return;
    const left = seat.offsetLeft - (row.current.clientWidth - seat.offsetWidth) / 2;
    row.current.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [holder]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        <EnemyPanel
          enemy={fight.enemy}
          decks={fight.actionDecks}
          active={side?.kind === 'enemy'}
          down={fight.down}
          aggro={state.party.players.find((p) => p.id === aggro)}
          targets={busy ? [] : controls.targets}
          aimed={controls.aimed}
          onTarget={onTarget}
        />

        <BattleLine state={state} />

        <div ref={row} className="relative flex flex-none gap-3 overflow-x-auto px-1 pt-2 pb-3">
          {participants.map((player) => {
            const active = side?.kind === 'player' && side.id === player.id;
            return (
              <PlayerPanel
                key={player.id}
                player={player}
                active={active}
                waiting={!!side && !active}
                aggro={aggro === player.id}
                downsUsed={active ? fight.down : undefined}
                {...(active && controls.ship ? { ship: controls.ship } : {})}
                {...(active && controls.controls && !busy ? { controls: controls.controls } : {})}
              />
            );
          })}
        </div>
      </div>

      {side && <ActionBar state={state} side={side} controls={controls} />}
    </>
  );
}

/** Whose turn, which down, and what a 1st down would do right now. */
function BattleLine({ state }: { state: GameState }) {
  const config = useConfig();
  const fight = state.combat!;
  const side = fight.turn;
  const battle = { party: state.party, combat: fight };
  const name = combatEngine.sideName(battle, side);
  const after = (id: string | null) =>
    state.party.players.find((p) => p.id === combatEngine.seatAfter(battle, id))?.label ?? '—';
  const enemy = side.kind === 'enemy';
  const rule = enemy
    ? `1ST DOWN → BACK TO DOWN 1 · AFTER DOWN ${config.downCount} → ${after(fight.handedBy)}`
    : `1ST DOWN → ${after(side.id)} GOES NEXT · OUT OF DOWNS → ENEMY TURN`;

  return (
    <div className="relative flex flex-none items-center gap-3">
      <div className="h-[2px] flex-1" style={{ background: 'repeating-linear-gradient(90deg, var(--putty-600) 0 8px, transparent 8px 14px)' }} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${side.kind}:${side.id}:${fight.round}:${fight.outcome ?? ''}`}
          initial={{ opacity: 0, y: enemy ? -10 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: enemy ? 10 : -10 }}
          transition={{ duration: 0.2 }}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-2 border-border-strong bg-crt-glass px-3 py-1.5 font-mono text-[12px] text-crt-white"
        >
          <span className="text-crt-green-500">ROUND {fight.round}</span>
          <span>
            {enemy ? '▲ ' : '▼ '}
            <span className={enemy ? 'text-toggle-red-300' : 'text-crt-green-500'}>{name.toUpperCase()}</span>’S TURN
          </span>
          {!fight.outcome && (
            <>
              {fight.firstDowns > 0 && <span className="text-crt-green-500">1ST DOWNS ×{fight.firstDowns}</span>}
              <span className="text-amber-300">{rule}</span>
            </>
          )}
          {fight.outcome && <span className="text-amber-300">{fight.outcome.toUpperCase()}</span>}
        </motion.div>
      </AnimatePresence>
      <div className="h-[2px] flex-1" style={{ background: 'repeating-linear-gradient(90deg, var(--putty-600) 0 8px, transparent 8px 14px)' }} />
    </div>
  );
}

/** Between fights: the decks, the loot bag and the seats as they stand. */
function IdleTable({ state }: { state: GameState }) {
  const config = useConfig();
  const discards =
    state.decks.parts.discardPile.length +
    state.decks.cockpits.discardPile.length +
    state.decks.items.discardPile.length +
    state.decks.events.discardPile.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div className="flex flex-none items-center justify-center gap-3.5 py-2">
        <DeckStack label="COCKPITS" accent="var(--n-500)" caption={`${state.decks.cockpits.drawPile.length} LEFT`} />
        <DeckStack label="PARTS" accent="var(--role-gen)" caption={`${state.decks.parts.drawPile.length} LEFT`} />
        <DeckStack label="ITEMS" accent="var(--crt-green-700)" caption={`${state.decks.items.drawPile.length} LEFT`} />
        <DeckStack label="EVENTS" accent="var(--amber-500)" caption={`${state.decks.events.drawPile.length} LEFT`} />
        <DiscardStack count={discards} />
        <LootBag maxRarity={state.maxRarityNow} colors={RARITY_COLOR} />
      </div>

      <div className="flex flex-none gap-3 overflow-x-auto px-1 pb-2">
        {state.party.players.map((player) => (
          <PlayerPanel key={player.id} player={player} />
        ))}
      </div>

      <div className="flex-none font-mono text-[11px] text-putty-700">
        PHASE {state.phase.toUpperCase()} · HAND SIZE {config.handSize} · SCRAP CAP {config.scrapCap}
      </div>
    </div>
  );
}
