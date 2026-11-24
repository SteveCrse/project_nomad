import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Cell, CardId, Ship, ShipSlot, SideRef, SlotIndex } from '@engine/types';
import { ship as shipEngine } from '@engine';
import { getPart } from '@data';
import { dragSource, useDropZone, type DragPayload } from '@/components/fx/drag';
import { heldChit } from '@/components/fx/tableFx';
import { fxKey } from '@/lib/combatView';
import { TableCard } from './TableCard';

/** Dragging markers between a ship's modules. */
export interface ChitDrag {
  /** Markers on a module that may still move this reroute. */
  sendable: (slot: SlotIndex) => number;
  /** null when a marker may go from → to. */
  error: (from: SlotIndex, to: SlotIndex) => string | null;
  onDrop: (from: SlotIndex, to: SlotIndex) => void;
}

/**
 * A ship being built: its modules can be picked up, and every open cell
 * around it is a place a card might go.
 */
export interface ShipBuild {
  /** The card picked up with a click, if any: where it may go lights up, and a click puts it there. */
  inHand: DragPayload | null;
  cellAccepts: (p: DragPayload, cell: Cell) => boolean;
  cellDrop: (p: DragPayload, cell: Cell) => void;
  slotAccepts: (p: DragPayload, slot: ShipSlot) => boolean;
  slotDrop: (p: DragPayload, slot: ShipSlot) => void;
  /** What picking this module up carries; null when it stays put (the cockpit). */
  lift: (slot: ShipSlot) => DragPayload | null;
  /** What picking a marker off this module carries; null when none of them may leave. */
  liftChit: (slot: ShipSlot) => DragPayload | null;
  onPick: (slot: ShipSlot) => void;
}

/** Keeps a pointer-down on something draggable from also panning the table. */
const grab = (handlers: { onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void }) =>
  handlers.onPointerDown
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          e.stopPropagation();
          handlers.onPointerDown!(e);
        },
      }
    : {};

/**
 * A dragged thing's ghost. The drag layer gives it the box the thing had on
 * screen — the table is zoomed, tilted and turned — so the card is drawn at
 * its printed size and scaled to fit that box.
 */
export function Ghost({ w, h, children }: { w: string; h: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const b = box.current;
    const c = card.current;
    if (b && c && c.offsetWidth > 0) setK(Math.min(b.offsetWidth / c.offsetWidth, b.offsetHeight / c.offsetHeight));
  }, []);
  return (
    <div ref={box} className="tt-ghost" style={{ width: '100%', height: '100%' }}>
      <div ref={card} style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: '0 0' }}>
        {children}
      </div>
    </div>
  );
}

export const cardGhost = (cardId: CardId) => () => (
  <Ghost w="var(--tt-cw)" h="var(--tt-ch)">
    <TableCard cardId={cardId} />
  </Ghost>
);
const chitGhost = () => <span className="tt-chit" style={{ width: '100%', height: '100%' }} />;
export const draggable = (payload: DragPayload | null, ghost: () => React.ReactNode) => grab(dragSource(payload, ghost));

/** The cells a ship covers, never less than the 3×3 around its cockpit; `open` adds the cells a module could be attached on. */
export function shipExtent(ship: Ship, open = false) {
  const b = shipEngine.gridBounds(ship);
  let minX = Math.min(b.minX, -1);
  let maxX = Math.max(b.maxX, 1);
  let minY = Math.min(b.minY, -1);
  let maxY = Math.max(b.maxY, 1);
  if (open) {
    for (const c of shipEngine.openCells(ship)) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }
  }
  return { minX, maxX, minY, maxY, cols: maxX - minX + 1, rows: maxY - minY + 1 };
}

/**
 * A ship laid out on the table: its module cards on their cells, each with
 * its energy markers on it. A destroyed module isn't drawn — it left for the
 * discard — and its cell reads as empty, like every other open cell, in the
 * screen's guide colour.
 *
 * `facing` is which way the front points as drawn: a seat's ship is front-up,
 * toward the middle of the table; the enemy's is front-down, toward the seat
 * it's turned to.
 */
export function TableShip({
  ship,
  side,
  facing,
  marks,
  targets,
  targetCls = 'tgt',
  selected,
  onModule,
  clickable,
  drag,
  build,
}: {
  ship: Ship;
  side: SideRef;
  facing: 'up' | 'down';
  marks: Record<string, string>;
  /** Modules that can be aimed at right now. */
  targets?: SlotIndex[];
  /** How a target is outlined: `tgt` to shoot at, `take` to pick up. */
  targetCls?: 'tgt' | 'take';
  selected?: SlotIndex | null;
  onModule?: (slot: SlotIndex) => void;
  /** Every live module takes a click (picking one up); otherwise only targets do. */
  clickable?: boolean;
  drag?: ChitDrag | null;
  build?: ShipBuild | null;
}) {
  const ext = shipExtent(ship, !!build);
  const open = new Set(build ? shipEngine.openCells(ship).map((c) => `${c.x},${c.y}`) : []);
  const root = useRef<HTMLDivElement>(null);
  const row = (y: number) => (facing === 'up' ? y - ext.minY : ext.maxY - y) + 1;
  const col = (x: number) => x - ext.minX + 1;
  const live = new Map(ship.slots.filter((s) => !s.destroyed).map((s) => [`${s.x},${s.y}`, s]));
  const gone = new Map(ship.slots.filter((s) => s.destroyed).map((s) => [`${s.x},${s.y}`, s]));

  // One drag at a time, tracked on the window so it survives leaving the card.
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const startDrag = (e: React.PointerEvent<HTMLElement>, from: SlotIndex) => {
    const d = dragRef.current;
    const shipEl = root.current;
    if (!d || !shipEl || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const chit = e.currentTarget;
    const held = heldChit(chit);
    chit.classList.add('lifted');
    const cards = [...shipEl.querySelectorAll<HTMLElement>('.tt-card')];
    for (const el of cards) {
      const to = Number(el.dataset.slot);
      if (to !== from) el.classList.add(d.error(from, to) ? 'drop-no' : 'drop-ok');
    }
    let over: HTMLElement | null = null;
    const under = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tt-card');
      return el && shipEl.contains(el) ? el : null;
    };
    const move = (ev: PointerEvent) => {
      held.move(ev.clientX, ev.clientY);
      const el = under(ev.clientX, ev.clientY);
      const ok = el?.classList.contains('drop-ok') ? el : null;
      if (over && over !== ok) over.classList.remove('drop-hover');
      ok?.classList.add('drop-hover');
      over = ok;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      for (const el of cards) el.classList.remove('drop-ok', 'drop-no', 'drop-hover');
      const el = ev.type === 'pointerup' ? under(ev.clientX, ev.clientY) : null;
      const to = el ? Number(el.dataset.slot) : null;
      const lands = to !== null && to !== from && !d.error(from, to);
      held.drop(!lands);
      chit.classList.remove('lifted');
      if (to !== null && to !== from) d.onDrop(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const cells = [];
  for (let y = ext.minY; y <= ext.maxY; y++) {
    for (let x = ext.minX; x <= ext.maxX; x++) {
      const slot = live.get(`${x},${y}`);
      const wreck = gone.get(`${x},${y}`);
      const style = { gridRow: row(y), gridColumn: col(x) };
      if (!slot && build && open.has(`${x},${y}`)) {
        cells.push(<OpenCell key={`o${x},${y}`} id={`cell:${side.id}:${x},${y}`} cell={{ x, y }} build={build} style={style} />);
        continue;
      }
      if (!slot) {
        cells.push(
          <div key={`g${x},${y}`} className="tt-guide" style={style} {...(wreck ? { 'data-slot-key': fxKey(side, wreck.index) } : {})} />,
        );
        continue;
      }
      const key = fxKey(side, slot.index);
      const isTarget = !!targets?.includes(slot.index);
      const canClick = !!onModule && (clickable || isTarget || (targets !== undefined && targets.length > 0));
      cells.push(
        <ModuleCard
          key={`${slot.partId}@${slot.index}`}
          slot={slot}
          slotKey={key}
          style={style}
          cls={[marks[key] ?? '', isTarget ? targetCls : '', selected === slot.index ? 'sel' : '', canClick || build ? 'can' : ''].join(' ')}
          sendable={drag ? drag.sendable(slot.index) : null}
          build={build ?? null}
          onClick={build ? () => build.onPick(slot) : canClick ? () => onModule!(slot.index) : undefined}
          onChitDown={drag ? (e) => startDrag(e, slot.index) : undefined}
        />,
      );
    }
  }

  return (
    <div
      ref={root}
      className="tt-ship"
      style={{ gridTemplateColumns: `repeat(${ext.cols}, var(--tt-cw))`, gridTemplateRows: `repeat(${ext.rows}, var(--tt-ch))` }}
    >
      {cells}
    </div>
  );
}

/** One module card on its cell, with its energy markers on its sockets. */
function ModuleCard({
  slot,
  slotKey,
  style,
  cls,
  sendable,
  build,
  onClick,
  onChitDown,
}: {
  slot: ShipSlot;
  slotKey: string;
  style: React.CSSProperties;
  cls: string;
  /** While markers can be dragged: how many of this module's may still move. */
  sendable: number | null;
  build: ShipBuild | null;
  onClick?: () => void;
  onChitDown?: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  const part = getPart(slot.partId);
  const zone = useDropZone(`slot:${slotKey}`, build ? { accepts: (p) => build.slotAccepts(p, slot), onDrop: (p) => build.slotDrop(p, slot) } : null);
  // Markers that turn up after the card is on the table land, rather than appear.
  const before = useRef<number | null>(null);
  const prev = before.current;
  useEffect(() => {
    before.current = slot.energy;
  });
  if (!part) return <div className="tt-guide" style={style} />;
  // With a reroute in hand, what arrived sits last and stays put.
  const arrived = sendable === null ? 0 : Math.max(0, slot.energy - sendable);
  const lifted = build?.lift(slot) ?? null;
  const chit = build?.liftChit(slot) ?? null;
  // A card in hand that may land on this one (a swap, a token) lights it up.
  const takes = !!build?.inHand && build.slotAccepts(build.inHand, slot);
  const lit = zone.over ? ' drop-ok drop-hover' : zone.active || takes ? ' drop-ok' : '';

  return (
    <TableCard
      {...zone.props}
      cardId={slot.partId}
      cls={`${cls}${lit}${lifted ? ' tt-drag' : ''}`}
      style={style}
      data-slot-key={slotKey}
      data-slot={slot.index}
      onClick={takes && build?.inHand ? () => build.slotDrop(build.inHand!, slot) : onClick}
      {...draggable(lifted, cardGhost(slot.partId))}
      energy={slot.energy}
      marker={(i) => {
        const isArrived = i >= slot.energy - arrived;
        const canDrag = !isArrived && !!onChitDown && sendable !== null;
        const landing = !isArrived && prev !== null && i >= prev;
        return (
          <span
            className={`tt-chit${canDrag || chit ? ' drag' : ''}${isArrived ? ' arrived' : ''}${landing ? ' landing' : ''}`}
            {...(chit ? draggable(chit, chitGhost) : { onPointerDown: canDrag ? onChitDown : undefined })}
          />
        );
      }}
    />
  );
}

/** An open cell beside a ship being built. Lights up when what's held may land here. */
function OpenCell({ id, cell, build, style }: { id: string; cell: Cell; build: ShipBuild; style: React.CSSProperties }) {
  const zone = useDropZone(id, { accepts: (p) => build.cellAccepts(p, cell), onDrop: (p) => build.cellDrop(p, cell) });
  const takes = !zone.dragging && !!build.inHand && build.cellAccepts(build.inHand, cell);
  return (
    <div
      {...zone.props}
      className={`tt-guide tt-open${zone.over ? ' over' : zone.active || takes ? ' lit' : ''}`}
      style={style}
      title={takes ? 'Put it here' : undefined}
      onClick={takes && build.inHand ? () => build.cellDrop(build.inHand!, cell) : undefined}
    />
  );
}
