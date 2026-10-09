import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { RunEvent, SlotRef } from '@engine/types';
import { getCard } from '@data';
import { FLIGHT_MS, useGameStore, type Flight } from '@/store/gameStore';

/**
 * The table's effects layer.
 *
 * The engine records what happened as events; this plays them back over the
 * table in the order they happened — a shot crossing to its target, a module
 * shaking as a hit lands, ⚡ floating off it, charge streaming along a
 * reroute, the turn changing hands — so the state never just snaps to the
 * next one. Modules are found by their `data-slot-key`; an event about a
 * module that isn't on screen (a hazard hitting a ship while the table shows
 * the map) becomes a toast instead.
 */

interface Point {
  x: number;
  y: number;
}

type Item =
  | { id: number; kind: 'float'; at: Point; text: string; color: string; big?: boolean }
  | { id: number; kind: 'flash'; rect: DOMRect; color: string }
  | { id: number; kind: 'burst'; at: Point; color: string }
  | { id: number; kind: 'orb'; from: Point; to: Point; delay: number }
  | { id: number; kind: 'banner'; text: string; color: string }
  | { id: number; kind: 'toast'; text: string; tone: 'enemy' | 'info' | 'damage' };

/** How long each kind stays on screen, in ms. */
const LIFE: Record<Item['kind'], number> = {
  float: 1300,
  flash: 520,
  burst: 700,
  orb: 1100,
  banner: 1500,
  toast: 3200,
};

/** How long an event holds the stage before the next one plays. */
const BEAT: Partial<Record<RunEvent['kind'], number>> = {
  'action-card': 420,
  reroute: 520,
  hit: 300,
  charge: 220,
  drain: 120,
  'first-down': 500,
  turn: 300,
};

const keyOf = (ref: SlotRef) => `${ref.side.kind}:${ref.side.id}:${ref.slot}`;

const find = (ref: SlotRef): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-slot-key="${keyOf(ref)}"]`);

const centre = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

let nextId = 1;

export function FxLayer() {
  const state = useGameStore((s) => s.state);
  const flight = useGameStore((s) => s.flight);
  const [items, setItems] = useState<Item[]>([]);
  const seen = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const add = useCallback<Add>((item, life = LIFE[item.kind]) => {
    const id = nextId++;
    // One banner at a time: a new one pushes the last off.
    setItems((list) => [...list.filter((i) => item.kind !== 'banner' || i.kind !== 'banner'), { ...item, id } as Item]);
    timers.current.push(window.setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), life));
  }, []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // New events since the last look, played in order.
  useEffect(() => {
    if (!state) return;
    if (seen.current === null || state.eventCounter < seen.current) {
      seen.current = state.eventCounter;
      return;
    }
    const fresh = state.events.filter((e) => e.id > seen.current!);
    seen.current = state.eventCounter;
    let t = 0;
    for (const event of fresh) {
      later(t, () => play(event, add));
      t += BEAT[event.kind] ?? 0;
    }
  }, [state]);

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      <AnimatePresence>{flight && <Shot key={keyOf(flight.from) + keyOf(flight.to)} flight={flight} onLand={add} />}</AnimatePresence>
      <AnimatePresence>
        {items.map((item) => (
          <FxItem key={item.id} item={item} />
        ))}
      </AnimatePresence>
      <div className="absolute top-[68px] left-1/2 flex w-[min(560px,90vw)] -translate-x-1/2 flex-col items-center gap-1.5">
        <AnimatePresence>
          {items
            .filter((i): i is Extract<Item, { kind: 'toast' }> => i.kind === 'toast')
            .slice(-4)
            .map((toast) => (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                className="border-2 bg-crt-glass px-3 py-1.5 font-mono text-[12px] text-crt-white shadow-raised"
                style={{
                  borderColor:
                    toast.tone === 'enemy' ? 'var(--toggle-red-500)' : toast.tone === 'damage' ? 'var(--amber-500)' : 'var(--console-border)',
                }}
              >
                {toast.text}
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}

/** An item before it has an id — `Omit` taken member by member, so each keeps its own fields. */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewItem = Without<Item, 'id'>;
type Add = (item: NewItem, life?: number) => void;

/** One event, as the table sees it. */
function play(event: RunEvent, add: Add) {
  switch (event.kind) {
    case 'hit': {
      const el = find(event.target);
      const text = event.negated ? 'NEGATED' : event.destroyed ? 'DESTROYED' : `−${event.lost}⚡`;
      if (!el) {
        add({ kind: 'toast', text: `${event.name}: ${text.toLowerCase()}`, tone: 'damage' });
        return;
      }
      const rect = el.getBoundingClientRect();
      el.animate(
        [
          { translate: '0 0' },
          { translate: '-6px 0' },
          { translate: '5px 0' },
          { translate: '-4px 0' },
          { translate: '3px 0' },
          { translate: '0 0' },
        ],
        { duration: 380, easing: 'ease-out' },
      );
      add({ kind: 'flash', rect, color: event.negated ? 'rgb(155 160 143 / 0.6)' : 'rgb(179 59 46 / 0.55)' });
      add({ kind: 'float', at: centre(rect), text, color: event.negated ? 'var(--steel-700)' : 'var(--toggle-red-500)', big: event.destroyed });
      if (event.destroyed) add({ kind: 'burst', at: centre(rect), color: event.firstDown ? 'var(--amber-500)' : 'var(--toggle-red-500)' });
      return;
    }
    case 'charge':
    case 'drain': {
      const el = find(event.target);
      if (!el || event.amount <= 0) return;
      const rect = el.getBoundingClientRect();
      const up = event.kind === 'charge';
      el.animate(
        [
          { boxShadow: '0 0 0 0 transparent' },
          { boxShadow: `0 0 0 6px ${up ? 'rgb(159 217 160 / 0.7)' : 'rgb(217 154 62 / 0.6)'}` },
          { boxShadow: '0 0 0 0 transparent' },
        ],
        { duration: 600, easing: 'ease-out' },
      );
      add({ kind: 'float', at: centre(rect), text: `${up ? '+' : '−'}${event.amount}⚡`, color: up ? 'var(--crt-green-700)' : 'var(--amber-700)' });
      return;
    }
    case 'reroute': {
      let delay = 0;
      for (const move of event.moves) {
        const from = find({ side: event.side, slot: move.from });
        const to = find({ side: event.side, slot: move.to });
        if (!from || !to) continue;
        const a = centre(from.getBoundingClientRect());
        const b = centre(to.getBoundingClientRect());
        const orbs = Math.min(move.amount, 6);
        for (let i = 0; i < orbs; i++) add({ kind: 'orb', from: a, to: b, delay: delay + i * 0.08 });
        const landing = to;
        const amount = move.amount;
        window.setTimeout(() => {
          landing.animate(
            [{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: '0 0 0 6px rgb(159 217 160 / 0.7)' }, { boxShadow: '0 0 0 0 transparent' }],
            { duration: 500 },
          );
          add({ kind: 'float', at: b, text: `+${amount}⚡`, color: 'var(--crt-green-700)' });
        }, (delay + 0.45) * 1000);
        delay += 0.12;
      }
      return;
    }
    case 'action-card': {
      const name = getCard(event.cardId)?.name ?? event.cardId;
      add({
        kind: 'toast',
        tone: 'enemy',
        text: event.played
          ? `DOWN ${event.down + 1} · ${name.toUpperCase()}`
          : `DOWN ${event.down + 1} · ${name} — can’t (${event.reason}) · discarded`,
      });
      return;
    }
    case 'turn':
      add({ kind: 'banner', text: event.label.toUpperCase(), color: event.side.kind === 'enemy' ? 'var(--toggle-red-500)' : 'var(--accent-primary)' });
      return;
    case 'first-down':
      add({ kind: 'banner', text: '1ST DOWN!', color: 'var(--amber-500)' });
      return;
    case 'outcome':
      add({ kind: 'banner', text: event.outcome === 'victory' ? 'VICTORY' : 'DEFEAT', color: event.outcome === 'victory' ? 'var(--crt-green-500)' : 'var(--toggle-red-500)' }, 2000);
      return;
    case 'roll':
      return; // the dice overlay showed it
  }
}

/** A shot crossing the table: a bolt from the gun to the module it's aimed at. */
function Shot({ flight, onLand }: { flight: Flight; onLand: Add }) {
  const [path, setPath] = useState<{ a: Point; b: Point } | null>(null);
  useEffect(() => {
    const from = find(flight.from);
    const to = find(flight.to);
    if (!from || !to) return;
    const a = centre(from.getBoundingClientRect());
    const b = centre(to.getBoundingClientRect());
    setPath({ a, b });
    from.animate([{ translate: '0 0' }, { translate: '0 3px' }, { translate: '0 0' }], { duration: 160 });
    if (!flight.hit) {
      const t = window.setTimeout(() => onLand({ kind: 'float', at: b, text: 'MISS', color: 'var(--putty-700)', big: true }), FLIGHT_MS - 40);
      return () => clearTimeout(t);
    }
  }, [flight, onLand]);
  if (!path) return null;
  const angle = (Math.atan2(path.b.y - path.a.y, path.b.x - path.a.x) * 180) / Math.PI;
  // A miss sails past: it ends short and to the side of the target.
  const end = flight.hit ? path.b : { x: path.b.x + 34, y: path.b.y - 18 };
  return (
    <motion.div
      className="absolute top-0 left-0 h-[6px] w-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        background: flight.from.side.kind === 'enemy' ? 'var(--toggle-red-500)' : 'var(--amber-300)',
        boxShadow: `0 0 12px 3px ${flight.from.side.kind === 'enemy' ? 'rgb(179 59 46 / 0.8)' : 'rgb(240 199 122 / 0.9)'}`,
        rotate: angle,
      }}
      initial={{ x: path.a.x, y: path.a.y, opacity: 0, scaleX: 0.4 }}
      animate={{ x: end.x, y: end.y, opacity: [0, 1, 1, flight.hit ? 1 : 0], scaleX: 1 }}
      exit={{ opacity: 0, scale: 2.4, transition: { duration: 0.18 } }}
      transition={{ duration: FLIGHT_MS / 1000, ease: 'easeIn' }}
    />
  );
}

function FxItem({ item }: { item: Item }) {
  switch (item.kind) {
    case 'float':
      return (
        <motion.div
          className={`absolute -translate-x-1/2 -translate-y-1/2 font-display font-bold whitespace-nowrap ${item.big ? 'text-[20px]' : 'text-[16px]'}`}
          style={{ left: item.at.x, top: item.at.y, color: item.color, textShadow: '0 1px 0 var(--cream-100), 0 0 6px var(--cream-100)' }}
          initial={{ opacity: 0, y: 6, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], y: -46, scale: [0.6, 1.2, 1, 1] }}
          transition={{ duration: LIFE.float / 1000, times: [0, 0.15, 0.7, 1], ease: 'easeOut' }}
        >
          {item.text}
        </motion.div>
      );
    case 'flash':
      return (
        <motion.div
          className="absolute"
          style={{ left: item.rect.left, top: item.rect.top, width: item.rect.width, height: item.rect.height, background: item.color }}
          initial={{ opacity: 0.95 }}
          animate={{ opacity: 0 }}
          transition={{ duration: LIFE.flash / 1000, ease: 'easeOut' }}
        />
      );
    case 'burst':
      return (
        <div className="absolute" style={{ left: item.at.x, top: item.at.y }}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const r = 46 + (i % 3) * 14;
            return (
              <motion.div
                key={i}
                className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2"
                style={{ background: item.color }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r, opacity: 0, rotate: 180 }}
                transition={{ duration: LIFE.burst / 1000, ease: 'easeOut' }}
              />
            );
          })}
        </div>
      );
    case 'orb':
      return (
        <motion.div
          className="absolute top-0 left-0 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'var(--crt-green-500)', boxShadow: '0 0 10px 3px rgb(159 217 160 / 0.85)' }}
          initial={{ x: item.from.x, y: item.from.y, opacity: 0, scale: 0.5 }}
          animate={{ x: item.to.x, y: item.to.y, opacity: [0, 1, 1, 0], scale: [0.5, 1.1, 1, 0.6] }}
          transition={{ duration: 0.5, delay: item.delay, ease: 'easeInOut' }}
        />
      );
    case 'banner':
      return (
        <motion.div
          className="absolute top-[38%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center"
          initial={{ opacity: 0, scale: 0.7, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 360, damping: 22 }}
        >
          <div
            className="border-y-4 bg-crt-glass/90 px-10 py-3 font-display text-[30px] font-extrabold tracking-[0.08em] text-crt-white shadow-panel"
            style={{ borderColor: item.color, textShadow: `0 0 18px ${item.color}` }}
          >
            {item.text}
          </div>
        </motion.div>
      );
    case 'toast':
      return null; // stacked separately
  }
}
