import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * The camera over the table: fit, zoom toward the cursor, pan, the seated
 * tilt, and the table turning — the short way round — so a given seat comes
 * to the bottom of the screen.
 *
 * All of it is written straight to the two elements' transforms: a wheel or a
 * drag shouldn't re-render the table.
 */
export interface Camera {
  zoomBy: (factor: number) => void;
  fit: () => void;
}

export function useCamera(
  stage: RefObject<HTMLDivElement | null>,
  cam: RefObject<HTMLDivElement | null>,
  table: RefObject<HTMLDivElement | null>,
  /** Degrees the table should be turned to. */
  wantAngle: number,
  tilt: boolean,
): Camera {
  const view = useRef({ zoom: 1, px: 0, py: 0, angle: 0 });
  const want = useRef({ angle: wantAngle, tilt });
  want.current = { angle: wantAngle, tilt };

  const apply = useCallback(
    (live = false) => {
      const s = stage.current;
      const c = cam.current;
      const t = table.current;
      if (!s || !c || !t) return;
      const v = view.current;
      // Turn the short way round.
      v.angle += ((((want.current.angle - v.angle) % 360) + 540) % 360) - 180;
      const sideways = Math.abs(Math.round(v.angle / 90)) % 2 === 1;
      const w = sideways ? t.offsetHeight : t.offsetWidth;
      const h = sideways ? t.offsetWidth : t.offsetHeight;
      if (!w || !h) return;
      const fit = Math.min(s.clientWidth / w, s.clientHeight / h) * (want.current.tilt ? 0.86 : 0.96);
      c.classList.toggle('live', live);
      c.style.transform = `translate(${v.px}px, ${v.py}px) scale(${fit * v.zoom})${want.current.tilt ? ' rotateX(18deg)' : ''}`;
      t.style.transform = `translate(-50%, -50%) rotate(${v.angle}deg)`;
    },
    [stage, cam, table],
  );

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const s = stage.current;
      if (!s) return;
      const v = view.current;
      const z = Math.min(5, Math.max(1, v.zoom * factor));
      const f = z / v.zoom;
      const r = s.getBoundingClientRect();
      const ox = cx - (r.left + r.width / 2);
      const oy = cy - (r.top + r.height / 2);
      v.px = (v.px - ox) * f + ox;
      v.py = (v.py - oy) * f + oy;
      v.zoom = z;
      if (z === 1) {
        v.px = 0;
        v.py = 0;
      }
      apply(true);
    },
    [stage, apply],
  );

  const fit = useCallback(() => {
    Object.assign(view.current, { zoom: 1, px: 0, py: 0 });
    apply();
  }, [apply]);

  const zoomBy = useCallback(
    (factor: number) => {
      const r = stage.current?.getBoundingClientRect();
      if (r) zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
    },
    [stage, zoomAt],
  );

  // The table turns, the tilt changes.
  useEffect(() => apply(), [apply, wantAngle, tilt]);

  // The stage or the table changes size: refit.
  useEffect(() => {
    const s = stage.current;
    const t = table.current;
    if (!s || !t) return;
    const ro = new ResizeObserver(() => apply());
    ro.observe(s);
    ro.observe(t);
    void document.fonts?.ready.then(() => apply());
    return () => ro.disconnect();
  }, [stage, table, apply]);

  // Wheel, pinch, drag, double-click, keys.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pan: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
    let pinch: { d: number; zoom: number } | null = null;
    let suppress = false;

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)), e.clientX, e.clientY);
    };
    const down = (e: PointerEvent) => {
      const el = e.target as Element;
      if (el.closest('.tt-chit.drag, .tt-drag')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.current.zoom };
        pan = null;
        return;
      }
      if (el.closest('.tt-hand')) return;
      pan = { x: e.clientX, y: e.clientY, px: view.current.px, py: view.current.py, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((pinch.zoom * d) / pinch.d / view.current.zoom, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (!pan) return;
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 5) return;
      pan.moved = true;
      s.classList.add('panning');
      view.current.px = pan.px + dx;
      view.current.py = pan.py + dy;
      apply(true);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pan?.moved) {
        suppress = true;
        // The click that ends a drag follows at once; don't let a stale flag eat a later one.
        window.setTimeout(() => (suppress = false), 0);
      }
      pan = null;
      s.classList.remove('panning');
    };
    // The click that ends a pan isn't a click on whatever was under it.
    const click = (e: MouseEvent) => {
      if (!suppress) return;
      suppress = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const dbl = (e: MouseEvent) => {
      if (!(e.target as Element).closest('button, .tt-card, .tt-die')) fit();
    };
    const key = (e: KeyboardEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') zoomBy(1.4);
      else if (e.key === '-') zoomBy(1 / 1.4);
      else if (e.key === '0') fit();
    };

    s.addEventListener('wheel', wheel, { passive: false });
    s.addEventListener('pointerdown', down);
    s.addEventListener('click', click, true);
    s.addEventListener('dblclick', dbl);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    return () => {
      s.removeEventListener('wheel', wheel);
      s.removeEventListener('pointerdown', down);
      s.removeEventListener('click', click, true);
      s.removeEventListener('dblclick', dbl);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    };
  }, [stage, apply, zoomAt, zoomBy, fit]);

  return { zoomBy, fit };
}
