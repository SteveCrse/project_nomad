import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { create } from 'zustand';
import type { CardId, SlotIndex } from '@engine/types';
import { departFrom } from '@/lib/fly';

/**
 * Drag and drop, by pointer.
 *
 * The card follows the pointer as a ghost; every place it may land lights up
 * while it's in the air, and letting go anywhere else sends it back where it
 * came from. Built on pointer events rather than the browser's own drag and
 * drop, which can't answer "may it land here?" mid-drag or animate the miss.
 *
 * A drag only starts once the pointer has moved a few pixels, so a plain
 * click on a draggable card is still a click.
 */

export type DragPayload =
  | { kind: 'table'; cardId: CardId }
  | { kind: 'hold'; cardId: CardId }
  | { kind: 'scrap'; cardId: CardId }
  | { kind: 'grid'; slot: SlotIndex; cardId: CardId }
  /** A leftover energy token, off the pool. */
  | { kind: 'token' }
  /** ⚡ off a module, in a reroute. */
  | { kind: 'reroute'; slot: SlotIndex };

interface Point {
  x: number;
  y: number;
}

interface DragState {
  payload: DragPayload | null;
  ghost: ReactNode;
  origin: DOMRect | null;
  /** Where in the element the pointer took hold. */
  grip: Point;
  pointer: Point;
  /** The drop zone under the pointer, when it'll take the payload. */
  over: string | null;
  /** Let go somewhere it can't land — on its way home. */
  returning: boolean;
}

const IDLE: DragState = {
  payload: null,
  ghost: null,
  origin: null,
  grip: { x: 0, y: 0 },
  pointer: { x: 0, y: 0 },
  over: null,
  returning: false,
};

export const useDragStore = create<DragState>(() => IDLE);

interface Zone {
  accepts: (payload: DragPayload) => boolean;
  onDrop: (payload: DragPayload) => void;
}

const zones = new Map<string, { current: Zone }>();

/** The zone under a point that will take this payload. */
function zoneAt(point: Point, payload: DragPayload): string | null {
  const el = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-drop-id]');
  const id = el?.dataset.dropId;
  if (!id) return null;
  return zones.get(id)?.current.accepts(payload) ? id : null;
}

/** How long a missed drop takes to fly home, at most, before it's cleared anyway. */
const RETURN_MS = 450;

/**
 * Let go somewhere it can't land: the ghost flies back to where it came from.
 * The animation clears it when it lands; the timer makes sure it's cleared
 * even when the animation can't run (a tab in the background doesn't paint).
 */
function sendHome(pointer: Point) {
  useDragStore.setState({ returning: true, over: null, pointer });
  const payload = useDragStore.getState().payload;
  setTimeout(() => {
    const now = useDragStore.getState();
    if (now.returning && now.payload === payload) useDragStore.setState(IDLE);
  }, RETURN_MS);
}

/** Make an element draggable: spread what this returns on it. Not a hook — call it anywhere. */
export function dragSource(
  payload: DragPayload | null,
  ghost: () => ReactNode,
): { onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void } {
  if (!payload) return {};
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      const now = useDragStore.getState();
      if (now.payload && !now.returning) return;
      if (now.returning) useDragStore.setState(IDLE); // still flying home — let it go
      const el = e.currentTarget;
      const start = { x: e.clientX, y: e.clientY };
      let started = false;

      const move = (ev: PointerEvent) => {
        const pointer = { x: ev.clientX, y: ev.clientY };
        if (!started) {
          if (Math.hypot(pointer.x - start.x, pointer.y - start.y) < 5) return;
          started = true;
          const origin = el.getBoundingClientRect();
          document.body.classList.add('dragging');
          useDragStore.setState({
            payload,
            ghost: ghost(),
            origin,
            grip: { x: start.x - origin.left, y: start.y - origin.top },
            pointer,
            over: null,
            returning: false,
          });
        }
        useDragStore.setState({ pointer, over: zoneAt(pointer, payload) });
      };

      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        document.body.classList.remove('dragging');
      };

      const up = (ev: PointerEvent) => {
        stop();
        if (!started) return; // a click — let it through
        // The click that follows a drag isn't one.
        const swallow = (ce: MouseEvent) => {
          ce.stopPropagation();
          ce.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

        const drag = useDragStore.getState();
        const pointer = { x: ev.clientX, y: ev.clientY };
        const id = zoneAt(pointer, payload);
        const zone = id ? zones.get(id)?.current : undefined;
        if (zone && drag.origin) {
          // Whatever the drop makes flies in from where the ghost was let go.
          const left = pointer.x - drag.grip.x;
          const top = pointer.y - drag.grip.y;
          const landed = new DOMRect(left, top, drag.origin.width, drag.origin.height);
          if ('cardId' in payload) departFrom(`card:${payload.cardId}`, landed);
          useDragStore.setState(IDLE);
          zone.onDrop(payload);
          return;
        }
        sendHome(pointer);
      };

      const cancel = () => {
        stop();
        if (started) sendHome(useDragStore.getState().pointer);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    },
  };
}

/**
 * Make an element a place something can be dropped. Spread `props` on it;
 * `active` says a drag is on that this zone would take, `over` that it's
 * hovering here right now.
 */
export function useDropZone(
  id: string,
  zone: Zone | null,
): { props: { 'data-drop-id'?: string }; active: boolean; over: boolean; dragging: boolean } {
  const ref = useRef<Zone>(zone ?? { accepts: () => false, onDrop: () => {} });
  ref.current = zone ?? { accepts: () => false, onDrop: () => {} };

  useEffect(() => {
    zones.set(id, ref);
    return () => {
      if (zones.get(id) === ref) zones.delete(id);
    };
  }, [id]);

  const payload = useDragStore((s) => (s.returning ? null : s.payload));
  const over = useDragStore((s) => s.over === id);
  const active = !!payload && !!zone && zone.accepts(payload);
  return { props: zone ? { 'data-drop-id': id } : {}, active, over: active && over, dragging: !!payload };
}

/** The card in the air. Mounted once, over everything. */
export function DragLayer() {
  const drag = useDragStore();
  if (!drag.payload || !drag.origin) return null;
  const { origin, grip, pointer } = drag;
  const at = { x: pointer.x - grip.x, y: pointer.y - grip.y };

  return createPortal(
    <motion.div
      className="pointer-events-none fixed top-0 left-0 z-[100]"
      style={{ width: origin.width, height: origin.height }}
      initial={{ x: origin.left, y: origin.top, scale: 1, rotate: 0 }}
      animate={
        drag.returning
          ? { x: origin.left, y: origin.top, scale: 1, rotate: 0, opacity: 0.85 }
          : { x: at.x, y: at.y, scale: 1.06, rotate: 2.5, opacity: 1 }
      }
      transition={
        drag.returning
          ? { type: 'spring', stiffness: 380, damping: 30 }
          : { x: { duration: 0 }, y: { duration: 0 }, default: { duration: 0.12 } }
      }
      onAnimationComplete={() => {
        if (useDragStore.getState().returning) useDragStore.setState(IDLE);
      }}
    >
      <div className="h-full w-full shadow-[6px_10px_0_rgb(0_0_0/0.28)]">{drag.ghost}</div>
    </motion.div>,
    document.body,
  );
}
