import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

const PIPS: Record<number, number[]> = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
/** The turn that brings each face to the front. */
const FACE: Record<number, [number, number]> = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };

/** How long the result sits on the table before it's applied, in ms. */
const READ_MS = 800;

const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, reduced() ? Math.min(ms, 60) : ms));

/**
 * The die, on the table.
 *
 * A step that rolled is held back by the game store until its dice have been
 * seen. Here they're thrown — a click on the die, or the panel's button — and
 * tumble to the value the engine rolled, one after another when there are
 * several; the panel reads each result as it lands, and only then does the
 * step apply. A die that isn't a d6 is thrown the same way and reads as its
 * number.
 */
export function TableDie() {
  const staged = useGameStore((s) => s.staged);
  const throwDice = useGameStore((s) => s.throwDice);
  const commit = useGameStore((s) => s.commitStaged);
  const setLanded = useUiStore((s) => s.setRollsLanded);
  const die = useRef<HTMLDivElement>(null);
  const cur = useRef('translateY(0px) rotateX(0deg) rotateY(0deg)');
  /** Set while a die that isn't a d6 is out: what its faces read. */
  const [label, setLabel] = useState<string | null>(null);

  const id = staged?.rolls[0]?.id ?? null;
  const thrown = !!staged?.thrown;
  const rolls = useRef(staged?.rolls ?? []);
  rolls.current = staged?.rolls ?? [];

  useEffect(() => {
    setLanded(0);
    const first = rolls.current[0];
    setLabel(first && first.die !== 'd6' ? first.die : null);
  }, [id, setLanded]);

  useEffect(() => {
    if (!thrown || id === null) return;
    let dead = false;
    const tumble = async (value: number, pips: boolean) => {
      const el = die.current;
      if (!el) return;
      const [fx, fy] = FACE[pips ? value : 1] ?? [0, 0];
      const tx = fx + 360 * (2 + Math.floor(Math.random() * 2));
      const ty = fy + 360 * (2 + Math.floor(Math.random() * 2));
      await el
        .animate(
          [
            { transform: cur.current },
            { transform: `translateY(-50px) rotateX(${tx * 0.45}deg) rotateY(${ty * 0.55}deg)`, offset: 0.35 },
            { transform: `translateY(0px) rotateX(${tx * 0.9}deg) rotateY(${ty * 0.92}deg)`, offset: 0.7 },
            { transform: `translateY(-10px) rotateX(${tx * 0.97}deg) rotateY(${ty * 0.98}deg)`, offset: 0.84 },
            { transform: `translateY(0px) rotateX(${tx}deg) rotateY(${ty}deg)` },
          ],
          { duration: reduced() ? 1 : 1150, easing: 'cubic-bezier(.25,.6,.3,1)' },
        )
        .finished.catch(() => {});
      cur.current = `translateY(0px) rotateX(${fx}deg) rotateY(${fy}deg)`;
      el.style.transform = cur.current;
    };
    void (async () => {
      let landed = 0;
      for (const roll of rolls.current) {
        const pips = roll.die === 'd6';
        for (const value of roll.dice) {
          if (dead) return;
          setLabel(pips ? null : roll.die);
          await tumble(value, pips);
          if (dead) return;
          if (!pips) setLabel(String(value));
          if (roll.dice.length > 1) await sleep(300);
        }
        setLanded(++landed);
        await sleep(350);
      }
      await sleep(READ_MS);
      if (!dead) commit();
    })();
    return () => {
      dead = true;
    };
  }, [thrown, id, commit, setLanded]);

  const waiting = !!staged && !thrown;
  return (
    <div className={`tt-die-zone${waiting ? ' await' : ''}`}>
      <div className="tt-die-ring" />
      <div className="tt-die-shadow" />
      <div className="tt-die-view">
        <div
          ref={die}
          className="tt-die"
          role="button"
          tabIndex={0}
          aria-label={waiting ? 'Die, click to roll' : 'Die'}
          style={{ transform: cur.current }}
          onClick={() => waiting && throwDice()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && waiting) {
              e.preventDefault();
              e.stopPropagation();
              throwDice();
            }
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((f) =>
            label !== null ? (
              <div key={f} className={`face num f${f}`}>
                {label}
              </div>
            ) : (
              <div key={f} className={`face f${f}`}>
                {PIPS[f]!.map((p) => (
                  <span key={p} className="pip" style={{ gridArea: `${Math.floor((p - 1) / 3) + 1} / ${((p - 1) % 3) + 1}` }} />
                ))}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
