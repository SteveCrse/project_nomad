/**
 * Physical things moving across the tabletop: energy markers between modules
 * and the supply pile, cards between decks, hands, the reveal spot and the
 * discard.
 *
 * The table is zoomed, tilted and turned, so nothing here knows its layout —
 * every flight reads the two rects off the screen and crosses between them in
 * a fixed layer above everything. A flight is a ghost: the real marker or card
 * is drawn by React wherever the state says it is.
 */

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const reduced = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The tabletop is on screen — effects go to the table rather than over it. */
export const tableMounted = (): boolean => !!document.querySelector('.tt-table');

function layer(): HTMLElement {
  let el = document.getElementById('tt-fx');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tt-fx';
    document.body.appendChild(el);
  }
  return el;
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** A box of a given size sitting on the middle of an element. */
const centred = (el: Element, w: number, h: number): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - h / 2, width: w, height: h };
};

/** Fly a ghost from one box to another along a low arc. */
export function fly(from: Box, to: Box, cls: string, html = '', dur = 480, scaleTo = 1, arc = 40): Promise<void> {
  const g = document.createElement('div');
  g.className = `tt-fxg ${cls}`;
  g.innerHTML = html;
  Object.assign(g.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  layer().appendChild(g);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  return g
    .animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0deg)' },
        { transform: `translate(${dx / 2}px, ${dy / 2 - arc}px) scale(${((1 + scaleTo) / 2) * 1.15}) rotate(8deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scaleTo}) rotate(0deg)` },
      ],
      { duration: reduced() ? 1 : dur, easing: 'cubic-bezier(.3,.7,.3,1)' },
    )
    .finished.then(
      () => g.remove(),
      () => g.remove(),
    );
}

const slotEl = (key: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-slot-key="${key}"]`);
const socketsOf = (key: string): Element | null => slotEl(key)?.querySelector('.tt-sockets') ?? slotEl(key);
const bank = (): Element | null => document.querySelector('.tt-bank');

/** How big a marker is drawn right now, zoom included. */
function chitPx(): number {
  const any = document.querySelector('.tt-bank .tt-chit');
  return any ? Math.max(6, any.getBoundingClientRect().width) : 14;
}

function stream(from: Element | null, to: Element | null, n: number, stagger: number): void {
  if (!from || !to || n <= 0) return;
  const s = chitPx();
  for (let i = 0; i < Math.min(n, 12); i++) {
    window.setTimeout(() => void fly(centred(from, s, s), centred(to, s, s), 'tt-chit', '', 480), i * stagger);
  }
}

/** Markers off a module, back to the supply: a spent shot, a hit taken, a drain. */
export const chitsToSupply = (key: string, n: number): void => stream(socketsOf(key), bank(), n, 60);

/** Markers from the supply onto a module: generated, restored. */
export const chitsFromSupply = (key: string, n: number): void => stream(bank(), socketsOf(key), n, 90);

/** Markers from one module to another: a reroute the table didn't drag itself. */
export const chitsBetween = (from: string, to: string, n: number): void => stream(socketsOf(from), socketsOf(to), n, 70);

/** Markers between any two places on the table: a seat's tokens paid into the supply. */
export const chitsBetweenEls = (from: Element | null, to: Element | null, n: number): void => stream(from, to, n, 70);

const BACK = 'N.O.M.A.D.';

/** A destroyed module leaves its ship for the discard. */
export function moduleToDiscard(key: string): void {
  const el = slotEl(key);
  const discard = document.getElementById('tt-discard');
  if (!el || !discard) return;
  const r = boxOf(el);
  void fly(r, centred(discard, r.width * 0.8, r.height * 0.8), 'tt-back', BACK, 620, 0.8, 60);
}

/** A card, face down, from one place on the table to another. */
export function cardFlight(from: Element | null, to: Element | null, cls = '', dur = 600): void {
  if (!from || !to) return;
  const a = boxOf(from);
  const b = boxOf(to);
  const w = Math.min(a.width, 122);
  const h = Math.min(a.height, 170);
  void fly(
    { left: a.left + a.width / 2 - w / 2, top: a.top + a.height / 2 - h / 2, width: w, height: h },
    centred(to, w, h),
    `tt-back ${cls}`,
    BACK,
    dur,
    Math.min(1.6, Math.max(0.5, Math.min(b.width, 122) / w)),
    50,
  );
}

/** A marker held under the pointer while it's dragged; returns how to move and drop it. */
export function heldChit(from: Element): { move: (x: number, y: number) => void; drop: (back: boolean) => void } {
  const r = boxOf(from);
  const g = document.createElement('div');
  g.className = 'tt-fxg tt-chit';
  const w = r.width * 1.3;
  const h = r.height * 1.3;
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${w}px`, height: `${h}px` });
  layer().appendChild(g);
  return {
    move: (x, y) => {
      g.style.left = `${x - w / 2}px`;
      g.style.top = `${y - h / 2}px`;
    },
    drop: (back) => {
      const at = boxOf(g);
      g.remove();
      if (back) void fly(at, r, 'tt-chit', '', 260, 1, 0);
    },
  };
}
