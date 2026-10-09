import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameState, SideRef } from '@engine/types';
import { ACTION_LABEL, ACTION_TEXT, activeEffects, combat, printedText } from '@engine';
import { Button, DownsTracker, Stepper } from '@/components/ds';
import { ROLE_COLOR } from '@/lib/palette';
import { handOptions, reviveOptions } from '@/lib/combatView';
import { aimsAtEnemy, type CombatControls } from '@/lib/combatControls';
import { useConfig } from '@/store/configStore';
import { useBusy, useGameStore } from '@/store/gameStore';
import { useUiStore, type CombatMode } from '@/store/uiStore';
import { getCard, getPart } from '@data';

type ModeKind = CombatMode['kind'];

/**
 * The bar along the bottom of the table: what the seat on the clock can do
 * with its next down, and the button that ends its turn.
 *
 * Attack, Generate and Reroute are always there; Ability and Item turn up
 * when the ship or the hand has one. Pressing one puts the table in that mode
 * — the modules that can do it light up on the ship, and an attack then asks
 * for its target on the enemy. A turn never ends by itself: when it's over
 * (a 1st down, the last down) the bar says so and waits for End Turn.
 *
 * On the enemy's turn it steps the enemy through its action decks, one down
 * per click, so every card and every roll can be read.
 */
export function ActionBar({ state, side, controls }: { state: GameState; side: SideRef; controls: CombatControls }) {
  const config = useConfig();
  const fight = state.combat!;
  const busy = useBusy();
  const error = useGameStore((s) => s.error);
  const endTurn = useGameStore((s) => s.endTurn);
  const enemyStep = useGameStore((s) => s.enemyStep);
  const takeDown = useGameStore((s) => s.takeDown);
  const clearError = useGameStore((s) => s.clearError);
  const mode = useUiStore((s) => s.combatMode);
  const setMode = useUiStore((s) => s.setCombatMode);
  const manualDamage = useUiStore((s) => s.manualDamage);
  const setManualDamage = useUiStore((s) => s.setManualDamage);
  const undoLeg = useUiStore((s) => s.undoRerouteLeg);
  const setRerouteAmount = useUiStore((s) => s.setRerouteAmount);

  const holder = `${side.kind}:${side.id}:${fight.round}`;
  useEffect(() => {
    setMode(null);
    clearError();
  }, [holder, setMode, clearError]);

  const enemyTurn = side.kind === 'enemy';
  const battle = { party: state.party, combat: fight };
  const name = combat.sideName(battle, side);
  const nextSeat = state.party.players.find((p) => p.id === combat.seatAfter(battle, side.kind === 'player' ? side.id : fight.handedBy));
  const hand = handOptions(state, config, side, null, manualDamage);
  const revives = reviveOptions(state, config, side);
  const over = fight.turnOver;

  // Keys: A / G / R pick an action, Esc drops it, Enter ends a finished turn or plays the enemy's down.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (busy || e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') setMode(null);
      if (enemyTurn) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          enemyStep();
        }
        return;
      }
      if (over && e.key === 'Enter') {
        e.preventDefault(); // a focused button would press itself as well
        endTurn();
      }
      if (over) return;
      const pick = ({ a: 'attack', g: 'generate', r: 'reroute' } as const)[e.key.toLowerCase() as 'a' | 'g' | 'r'];
      if (pick) choose(pick);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const choose = (kind: ModeKind) => {
    clearError();
    if (mode?.kind === kind) return setMode(null);
    if (kind === 'attack') setMode({ kind, slot: null });
    else if (kind === 'reroute') setMode({ kind, from: null, moves: [] });
    else if (kind === 'use') setMode({ kind, slot: null });
    else if (kind === 'item') setMode({ kind, cardId: null });
    else setMode({ kind });
  };

  if (enemyTurn) {
    const card = getCard(fight.actionDecks[fight.down]?.faceUp);
    const action = card?.kind === 'action' ? card.action : null;
    return (
      <Shell key={`enemy-${fight.down}`} tone="danger">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="font-display text-[14px] font-bold text-toggle-red-700">
            {name.toUpperCase()}’S TURN · DOWN {fight.down + 1}/{config.downCount}
          </div>
          <div className="text-[14px] leading-tight text-putty-800">
            {action ? (
              <>
                Face up: <span className="font-bold">{ACTION_LABEL[action]}</span> — {ACTION_TEXT[action]} If it can’t, the
                card goes to the bottom of the deck and the next one is turned. After Down {config.downCount}: {nextSeat?.label ?? '—'}.
              </>
            ) : (
              'This down’s deck is empty.'
            )}
          </div>
        </div>
        <Button className={busy ? '' : 'attention'} variant="danger" disabled={busy} onClick={enemyStep} title="Enter">
          Play down {fight.down + 1} ▶
        </Button>
      </Shell>
    );
  }

  if (over) {
    const firstDown = over === 'first-down';
    return (
      <Shell key="over" tone="accent">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="font-display text-[15px] font-bold">
            {firstDown ? '1ST DOWN!' : over === 'destroyed' ? 'SHOT DOWN' : 'OUT OF DOWNS'}
          </div>
          <div className="text-[14px] text-putty-800">
            {firstDown
              ? `${name}’s turn is over — the rest of its downs are forfeit, and the enemy doesn’t get a look in. ${nextSeat?.label ?? 'The next seat'} goes next.`
              : `${name}’s turn is over without a 1st down — the enemy takes its turn.`}
          </div>
        </div>
        <DownsTracker current={fight.down} total={config.downCount} size="sm" />
        <Button className="attention" size="lg" onClick={endTurn} title="Enter">
          End turn → {firstDown ? (nextSeat?.label ?? 'next seat') : 'enemy'}
        </Button>
      </Shell>
    );
  }

  const abilityCount = controls.options.filter((o) => o.use && !o.use.error).length;
  const count = (pick: 'fire' | 'generate') => controls.options.filter((o) => !o.destroyed && o[pick] && !o[pick]!.error).length;
  const buttons: { kind: ModeKind; label: string; key?: string; tone: string; count: number; show: boolean }[] = [
    { kind: 'attack', label: 'Attack', key: 'A', tone: ROLE_COLOR.WPN, count: count('fire'), show: true },
    { kind: 'generate', label: 'Generate', key: 'G', tone: ROLE_COLOR.GEN, count: count('generate'), show: true },
    { kind: 'reroute', label: 'Reroute', key: 'R', tone: ROLE_COLOR.RDS, count: -1, show: true },
    { kind: 'use', label: 'Ability', tone: ROLE_COLOR.OTH, count: abilityCount, show: abilityCount > 0 },
    { kind: 'item', label: `Item`, tone: 'var(--amber-500)', count: hand.filter((h) => !h.option.error).length, show: hand.length > 0 },
  ];
  const manual =
    controls.options.some((o) => (o.part.effects ?? []).some((e) => e.type === 'manual')) ||
    hand.some((h) => (h.card.effects ?? []).some((e) => e.type === 'manual'));

  return (
    <Shell key={`turn-${side.id}`} tone="accent">
      <div className="flex flex-none flex-col items-start gap-1">
        <div className="font-display text-[14px] font-bold">{name.toUpperCase()}</div>
        <div className="flex items-center gap-1.5">
          <DownsTracker current={fight.down} total={config.downCount} size="sm" />
          <span className="font-mono text-[10px] text-putty-700">
            DOWN {Math.min(fight.down + 1, config.downCount)}/{config.downCount}
          </span>
        </div>
      </div>

      <div className="flex flex-none gap-1.5">
        {buttons
          .filter((b) => b.show)
          .map((b) => {
            const on = mode?.kind === b.kind;
            return (
              <motion.button
                key={b.kind}
                whileTap={{ scale: 0.94 }}
                disabled={busy || b.count === 0}
                onClick={() => choose(b.kind)}
                title={b.count === 0 ? `Nothing can ${b.label.toLowerCase()} right now` : b.key ? `${b.label} (${b.key})` : b.label}
                className={[
                  'relative flex h-[52px] min-w-[96px] cursor-pointer flex-col items-center justify-center border-2 px-3 font-display text-[13px] font-bold tracking-[0.04em] uppercase transition-colors duration-150',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  on ? 'border-n-900 bg-n-900 text-cream-100' : 'border-n-900 bg-cream-100 shadow-raised hover:bg-putty-100',
                ].join(' ')}
                style={{ borderBottom: `5px solid ${b.tone}` }}
              >
                {b.label}
                <span className={`font-mono text-[9px] font-normal ${on ? 'text-putty-300' : 'text-putty-600'}`}>
                  {b.count >= 0 ? `${b.count} READY` : 'MOVE ⚡'}
                  {b.key ? ` · ${b.key}` : ''}
                </span>
              </motion.button>
            );
          })}
      </div>

      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${mode?.kind ?? 'none'}:${controls.prompt}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-[14px] leading-tight text-putty-800"
          >
            {controls.prompt}
          </motion.div>
        </AnimatePresence>

        {mode?.kind === 'attack' && mode.slot !== null && controls.spend && controls.spend.max >= controls.spend.min && (
          <div className="flex items-center gap-2">
            <Stepper
              label="SPEND ⚡"
              value={controls.spend.value}
              onChange={(spend) => setMode({ ...mode, spend })}
              min={controls.spend.min}
              max={controls.spend.max}
            />
            <span className="text-[12px] text-putty-700">
              {controls.spend.min === controls.spend.max
                ? `this shot spends ${controls.spend.min}⚡`
                : `${controls.spend.min}–${controls.spend.max}⚡ — what you spend is gone, hit or miss`}
            </span>
          </div>
        )}

        {mode?.kind === 'reroute' && controls.move && (
          <div className="flex items-center gap-2">
            <Stepper label="MOVE ⚡" value={controls.move.value} onChange={setRerouteAmount} min={1} max={controls.move.max} />
            <span className="text-[12px] text-putty-700">per click — less if the module it goes to is fuller</span>
          </div>
        )}

        {mode?.kind === 'reroute' && controls.plan && (
          <div className="flex flex-wrap items-center gap-1.5">
            <AnimatePresence initial={false}>
              {mode.moves.map((m, i) => (
                <motion.span
                  key={`${i}-${m.from}-${m.to}`}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="border border-crt-green-700 bg-crt-glass px-1.5 py-0.5 font-mono text-[11px] text-crt-green-500"
                >
                  {getPart(controls.acting?.ship.slots[m.from]?.partId)?.name ?? '?'} → {getPart(controls.acting?.ship.slots[m.to]?.partId)?.name ?? '?'} · {m.amount}⚡
                </motion.span>
              ))}
            </AnimatePresence>
            {mode.moves.length > 0 && (
              <>
                <Button size="sm" variant="ghost" onClick={undoLeg}>
                  Undo
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode({ kind: 'reroute', from: null, moves: [] })}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !!controls.plan.error}
                  title={controls.plan.error ?? undefined}
                  onClick={() => {
                    if (takeDown({ type: 'reroute', moves: mode.moves })) setMode(null);
                  }}
                >
                  Reroute · {freeReroute(controls) ? 'free' : '1 down'}
                </Button>
              </>
            )}
          </div>
        )}

        {mode?.kind === 'item' && (
          <div className="flex flex-wrap gap-1.5">
            {hand.map((h, i) => (
              <button
                key={`${h.cardId}-${i}`}
                disabled={!!h.option.error || busy}
                title={h.option.error ?? printedText(h.card)}
                onClick={() => {
                  if (aimsAtEnemy(activeEffects(h.card), manualDamage)) setMode({ kind: 'item', cardId: h.cardId });
                  else if (takeDown({ type: 'play-card', cardId: h.cardId, ...(manualDamage > 0 ? { manualDamage } : {}) })) setMode(null);
                }}
                className={`cursor-pointer border px-2 py-1 font-mono text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${
                  mode.cardId === h.cardId ? 'border-n-900 bg-n-900 text-cream-100' : 'border-n-900 bg-cream-100 shadow-raised'
                }`}
              >
                {h.card.name.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {(mode?.kind === 'use' || mode?.kind === 'item') && manual && (
          <div className="flex items-center gap-2">
            <Stepper label="HIT ⚔" value={manualDamage} onChange={setManualDamage} min={0} max={20} />
            <span className="text-[12px] text-putty-700">for cards resolved at the table — 0 just logs it</span>
          </div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="font-mono text-[11px] text-toggle-red-500">
            {error}
          </motion.div>
        )}
      </div>

      <div className="flex flex-none flex-col items-end gap-1.5">
        {revives.map((r) => (
          <Button
            key={r.player.id}
            size="sm"
            variant="secondary"
            disabled={!!r.option.error || busy}
            title={r.option.error ?? undefined}
            onClick={() => takeDown(r.option.action)}
          >
            Revive {r.player.label} · 1 down
          </Button>
        ))}
        <div className="flex gap-1.5">
          {mode && (
            <Button size="sm" variant="ghost" onClick={() => setMode(null)} title="Esc">
              Cancel
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={busy} onClick={endTurn} title="No 1st down — the enemy takes its turn">
            End turn early
          </Button>
        </div>
      </div>
    </Shell>
  );
}

const freeReroute = (controls: CombatControls): boolean =>
  controls.options.some((o) => !o.destroyed && o.energy > 0 && !!o.part.freeReroute);

function Shell({ tone, children }: { tone: 'accent' | 'danger'; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="flex flex-none flex-wrap items-center gap-3 border-2 bg-surface-panel px-3 py-2.5 shadow-panel transition-[border-color] duration-300"
      style={{ borderColor: tone === 'danger' ? 'var(--toggle-red-500)' : 'var(--accent-primary)' }}
    >
      {children}
    </motion.div>
  );
}
