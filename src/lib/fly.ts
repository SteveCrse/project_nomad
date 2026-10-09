import { useLayoutEffect, type RefObject } from 'react';

/**
 * Cards that fly from where they were to where they land.
 *
 * Taking a card off the draft table re-renders it somewhere else entirely —
 * the hold, a cell of the grid — as a new element. So the old element leaves
 * its rect behind under a key (`card:<id>`), and whichever new element mounts
 * under that key next plays the move backwards from it: a FLIP, by hand.
 */

interface Departure {
  rect: DOMRect;
  at: number;
}

const departures = new Map<string, Departure>();

/** How long a departure waits for something to land, in ms. */
const LANDING_WINDOW = 900;

/** Leave a rect behind for the next element mounting under `key`. */
export function departFrom(key: string, rect: DOMRect | undefined | null): void {
  if (rect) departures.set(key, { rect, at: performance.now() });
}

/** Elements that have already made their entrance — StrictMode runs effects twice. */
const arrived = new WeakSet<Element>();

const reduceMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * On mount, fly in from a departure left under `key`, if there's a fresh one.
 * Otherwise `fallback` runs — a pop, usually — so nothing just appears.
 */
export function useFlyIn(
  ref: RefObject<HTMLElement | null>,
  key: string | null,
  fallback: 'pop' | 'none' = 'pop',
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || arrived.has(el) || reduceMotion()) return;
    arrived.add(el);
    const from = key ? departures.get(key) : undefined;
    if (key && from && performance.now() - from.at < LANDING_WINDOW) {
      departures.delete(key);
      const to = el.getBoundingClientRect();
      if (to.width > 0 && to.height > 0) {
        const dx = from.rect.left - to.left;
        const dy = from.rect.top - to.top;
        const sx = from.rect.width / to.width;
        const sy = from.rect.height / to.height;
        el.animate(
          [
            { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, zIndex: 30 },
            { transformOrigin: 'top left', transform: 'none', zIndex: 30 },
          ],
          { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
        return;
      }
    }
    if (fallback === 'pop') {
      el.animate(
        [
          { transform: 'scale(0.8)', opacity: 0 },
          { transform: 'scale(1.04)', opacity: 1, offset: 0.7 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 260, easing: 'ease-out' },
      );
    }
    // Mount only: a re-render is not an arrival.
  }, []);
}
