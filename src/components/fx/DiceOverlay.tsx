import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DieKind, GameState, RunEvent, SideRef } from '@engine/types';
import { DIE_SIDES, HIT_DIE, combat, spendRange } from '@engine';
import { getCard, getPart } from '@data';
import { Button, Stepper } from '@/components/ds';
import { useGameStore, type RollEvent, type Staged } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/** How long the dice tumble before the first one lands, in ms. */
const TUMBLE_MS = 700;
/** Gap between one die landing and the next. */
const STAGGER_MS = 380;

/**
 * Dice on the table.
 *
 * Nothing that rolls is applied unseen: a step that rolled is held back (see
 * the game store) and shown here first. The table reads what's being rolled
 * for and what it needs, clicks to throw, watches the dice land, reads the
 * result — "Rolled a 3 — HIT!" — and only then lets it happen.
 *
 * Until the dice are thrown a seat's own down is still in hand: an attack's
 * spend can be changed, and the down taken back (Cancel, Esc, or a click
 * beside the tray) to do something else.
 */
export function DiceOverlay() {
  const staged = useGameStore((s) => s.staged);
  const state = useGameStore((s) => s.state);
  return (
    <AnimatePresence>
      {staged && state && <DiceTray key={staged.rolls[0]?.id ?? 0} staged={staged} state={state} />}
    </AnimatePresence>
  );
}

function DiceTray({ staged, state }: { staged: Staged; state: GameState }) {
  const throwDice = useGameStore((s) => s.throwDice);
  const commit = useGameStore((s) => s.commitStaged);
  const restage = useGameStore((s) => s.restage);
  const cancelStaged = useGameStore((s) => s.cancelStaged);
  const setMode = useUiStore((s) => s.setCombatMode);
  const [landed, setLanded] = useState(0);
  const rolls = staged.rolls;
  const done = staged.thrown && landed >= rolls.length;
  const action = staged.thrown ? undefined : staged.action;

  // An attack's spend, while the dice are still in hand.
  const attack = action?.type === 'attack' ? action : null;
  const seat = state.combat?.turn.kind === 'player' ? state.party.players.find((p) => p.id === state.combat!.turn.id) : null;
  const gunSlot = attack ? seat?.ship.slots[attack.slot] : undefined;
  const gun = getPart(gunSlot?.partId);
  const range = gun && gunSlot ? spendRange(gun, gunSlot.energy) : null;
  const spend = attack && range ? (attack.spend ?? range.max) : null;

  /** Take the down back; an attack goes back to its module, picked, to aim again or drop. */
  const cancel = () => {
    if (!action) return;
    cancelStaged();
    setMode(action.type === 'attack' ? { kind: 'attack', slot: action.slot, spend: action.spend } : null);
  };

  // Land the dice one after another once they're thrown.
  useEffect(() => {
    if (!staged.thrown) return;
    const timers = rolls.map((_, i) => setTimeout(() => setLanded(i + 1), TUMBLE_MS + i * STAGGER_MS));
    return () => timers.forEach(clearTimeout);
  }, [staged.thrown, rolls]);

  // Enter or Space: throw, then carry on.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return cancel();
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!staged.thrown) throwDice();
      else if (done) commit();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const side = rolls[0]?.side;
  const who = side ? whoRolls(staged.state, side) : { name: '—', color: 'var(--n-900)' };
  const card = staged.events.find((e): e is Extract<RunEvent, { kind: 'action-card' }> => e.kind === 'action-card' && e.played);
  const enemy = side?.kind === 'enemy';

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-n-950/55 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      onClick={(e) => e.target === e.currentTarget && cancel()}
    >
      <motion.div
        className="w-full max-w-[560px] border-2 bg-surface-panel shadow-panel"
        style={{ borderColor: enemy ? 'var(--toggle-red-500)' : 'var(--accent-primary)' }}
        initial={{ y: 40, scale: 0.94, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, scale: 0.97, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      >
        <div className="h-1.5" style={{ background: who.color }} />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-baseline gap-3">
            <div className="font-display text-[17px] font-bold" style={{ color: enemy ? 'var(--toggle-red-700)' : undefined }}>
              {who.name.toUpperCase()} ROLLS
            </div>
            {card && (
              <div className="font-mono text-[11px] tracking-[0.08em] text-putty-700">
                DOWN {card.down + 1} · {getCard(card.cardId)?.name?.toUpperCase() ?? ''}
              </div>
            )}
          </div>

          {rolls.map((roll, i) => (
            <RollRow key={roll.id} roll={roll} thrown={staged.thrown} landed={landed > i} onThrow={throwDice} />
          ))}

          {attack && range && spend !== null && range.max > range.min && (
            <div className="flex items-center gap-2">
              <Stepper
                label="SPEND ⚡"
                value={spend}
                onChange={(n) => restage({ ...attack, spend: n })}
                min={range.min}
                max={range.max}
              />
              <span className="text-[12px] text-putty-700">
                of {gunSlot?.energy}⚡ on {gun?.name} — what you spend is gone, hit or miss
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            {action && (
              <Button variant="ghost" onClick={cancel} title="Esc — take the down back">
                Cancel
              </Button>
            )}
            <span className="font-mono text-[10px] tracking-[0.12em] text-putty-600">ENTER / SPACE</span>
            {!staged.thrown ? (
              <Button className="attention" onClick={throwDice}>
                Roll the dice
              </Button>
            ) : (
              <Button disabled={!done} onClick={commit} variant={done ? 'primary' : 'secondary'}>
                {done ? 'Continue' : 'Rolling…'}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** One roll: what it's for, what it needs, the dice, and — once they land — the verdict. */
function RollRow({
  roll,
  thrown,
  landed,
  onThrow,
}: {
  roll: RollEvent;
  thrown: boolean;
  landed: boolean;
  onThrow: () => void;
}) {
  const need = needText(roll);
  const total = roll.dice.reduce((a, b) => a + b, 0);
  const shout = roll.outcome === 'HIT' || roll.outcome === 'No hit' ? '!' : '';
  const verdict =
    roll.success === null
      ? `Rolled ${roll.dice.length > 1 ? `${roll.dice.join(' + ')} = ${total}` : total} — ${roll.outcome}`
      : `Rolled ${roll.dice.length > 1 ? roll.dice.join(', ') : `a ${roll.dice[0]}`} — ${roll.outcome}${shout}`;
  const tone = roll.success === null ? 'var(--n-900)' : roll.success ? 'var(--crt-green-700)' : 'var(--toggle-red-500)';

  return (
    <div className="flex flex-col gap-2 border border-border-strong bg-putty-100 p-3">
      <div className="text-[15px] leading-tight font-semibold">{roll.label}</div>
      <div className="font-mono text-[11px] text-putty-700">{need}</div>
      <div className="flex items-center gap-4">
        <button
          className="flex cursor-pointer gap-2 disabled:cursor-default"
          disabled={thrown}
          onClick={onThrow}
          title={thrown ? undefined : 'Throw'}
        >
          {roll.dice.map((value, i) => (
            <Die key={i} die={roll.die} value={value} state={!thrown ? 'waiting' : landed ? 'landed' : 'tumbling'} />
          ))}
        </button>
        <AnimatePresence>
          {landed && (
            <motion.div
              initial={{ opacity: 0, x: -12, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className="font-display text-[17px] font-bold"
              style={{ color: tone }}
            >
              {verdict}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** What a roll needs, in words. */
function needText(roll: RollEvent): string {
  if (!roll.rule) return `Roll ${roll.dice.length}${roll.die} and add them up.`;
  const sides = DIE_SIDES[roll.die];
  const under = /^≤ (\d+)$/.exec(roll.rule);
  if (under && roll.die === 'd6') {
    const n = Math.max(0, Math.min(Number(under[1]), HIT_DIE));
    return `Hits on ${roll.rule} — the ⚡ on the module firing · ${n} in ${sides}`;
  }
  return `Roll ${roll.dice.length}${roll.die} — hits on ${roll.rule}.`;
}

function whoRolls(state: GameState, side: SideRef): { name: string; color: string } {
  if (side.kind === 'player') {
    const player = state.party.players.find((p) => p.id === side.id);
    return { name: player?.label ?? side.id, color: player?.accent ?? 'var(--accent-primary)' };
  }
  const battle = state.combat ? { party: state.party, combat: state.combat } : null;
  return { name: battle ? combat.sideName(battle, side) : 'Enemy', color: 'var(--toggle-red-500)' };
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

/**
 * One die. Waiting, it sits there with a question mark, asking to be thrown;
 * tumbling, it spins through random faces; landed, it shows what it rolled.
 */
function Die({ die, value, state }: { die: DieKind; value: number; state: 'waiting' | 'tumbling' | 'landed' }) {
  const sides = DIE_SIDES[die];
  const [face, setFace] = useState(() => 1 + Math.floor(Math.random() * sides));

  useEffect(() => {
    if (state !== 'tumbling') return;
    const timer = setInterval(() => setFace(1 + Math.floor(Math.random() * sides)), 70);
    return () => clearInterval(timer);
  }, [state, sides]);

  const shown = state === 'landed' ? value : face;
  return (
    <motion.div
      className="relative flex h-[58px] w-[58px] items-center justify-center rounded-[9px] border-2 border-n-900 bg-cream-100 shadow-[3px_4px_0_rgb(0_0_0/0.3)]"
      animate={
        state === 'tumbling'
          ? { rotate: [0, 120, 240, 360], y: [0, -16, 0, -8, 0], transition: { duration: 0.45, repeat: Infinity, ease: 'linear' } }
          : state === 'landed'
            ? { rotate: 0, y: 0, scale: [1.25, 0.94, 1], transition: { duration: 0.35 } }
            : { rotate: [-4, 4, -4], transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }
      }
    >
      {state === 'waiting' ? (
        <span className="font-display text-[24px] font-bold text-putty-600">?</span>
      ) : die === 'd6' ? (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {(PIPS[shown] ?? []).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={9} fill="var(--n-900)" />
          ))}
        </svg>
      ) : (
        <span className="font-display text-[22px] font-bold">{shown}</span>
      )}
      <span className="absolute right-1 bottom-0 font-mono text-[8px] text-putty-600">{die}</span>
    </motion.div>
  );
}
