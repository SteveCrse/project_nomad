import { useEffect, useRef } from 'react';
import type { Ship, ShipSlot, SideRef, SlotIndex } from '@engine/types';
import { attackOf, outputOf, printedText, ship as shipEngine } from '@engine';
import { getPart } from '@data';
import { heldChit } from '@/components/fx/tableFx';
import { fxKey } from '@/lib/combatView';
import { ROLE_COLOR } from '@/lib/palette';

/** Dragging markers between a ship's modules. */
export interface ChitDrag {
  /** Markers on a module that may still move this reroute. */
  sendable: (slot: SlotIndex) => number;
  /** null when a marker may go from → to. */
  error: (from: SlotIndex, to: SlotIndex) => string | null;
  onDrop: (from: SlotIndex, to: SlotIndex) => void;
}

/** The cells a ship covers, never less than the 3×3 around its cockpit. */
export function shipExtent(ship: Ship) {
  const b = shipEngine.gridBounds(ship);
  const minX = Math.min(b.minX, -1);
  const maxX = Math.max(b.maxX, 1);
  const minY = Math.min(b.minY, -1);
  const maxY = Math.max(b.maxY, 1);
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
  selected,
  onModule,
  clickable,
  drag,
}: {
  ship: Ship;
  side: SideRef;
  facing: 'up' | 'down';
  marks: Record<string, string>;
  /** Modules that can be aimed at right now. */
  targets?: SlotIndex[];
  selected?: SlotIndex | null;
  onModule?: (slot: SlotIndex) => void;
  /** Every live module takes a click (picking one up); otherwise only targets do. */
  clickable?: boolean;
  drag?: ChitDrag | null;
}) {
  const ext = shipExtent(ship);
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
    const cards = [...shipEl.querySelectorAll<HTMLElement>('.tt-module')];
    for (const el of cards) {
      const to = Number(el.dataset.slot);
      if (to !== from) el.classList.add(d.error(from, to) ? 'drop-no' : 'drop-ok');
    }
    let over: HTMLElement | null = null;
    const under = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tt-module');
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
          cls={[marks[key] ?? '', isTarget ? 'tgt' : '', selected === slot.index ? 'sel' : '', canClick ? 'can' : ''].join(' ')}
          sendable={drag ? drag.sendable(slot.index) : null}
          onClick={canClick ? () => onModule!(slot.index) : undefined}
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

/** One module card, as printed: role band, name, a socket per ⚡ it can hold, its numbers. */
function ModuleCard({
  slot,
  slotKey,
  style,
  cls,
  sendable,
  onClick,
  onChitDown,
}: {
  slot: ShipSlot;
  slotKey: string;
  style: React.CSSProperties;
  cls: string;
  /** While markers can be dragged: how many of this module's may still move. */
  sendable: number | null;
  onClick?: () => void;
  onChitDown?: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  const part = getPart(slot.partId);
  // Markers that turn up after the card is on the table land, rather than appear.
  const before = useRef<number | null>(null);
  const prev = before.current;
  useEffect(() => {
    before.current = slot.energy;
  });
  if (!part) return <div className="tt-guide" style={style} />;
  const atk = attackOf(part);
  const gen = outputOf(part);
  const cap = Math.max(part.energyCapacity, slot.energy);
  // With a reroute in hand, what arrived sits last and stays put.
  const arrived = sendable === null ? 0 : Math.max(0, slot.energy - sendable);

  return (
    <div
      className={`tt-module role-${part.role} ${cls}`}
      style={style}
      data-slot-key={slotKey}
      data-slot={slot.index}
      title={`${part.name} — ${printedText(part)}`}
      onClick={onClick}
    >
      <div className="tt-band" style={{ background: ROLE_COLOR[part.role] }}>
        <span>{part.role}</span>
        {part.firstDown && <span className="tt-first">1ST</span>}
      </div>
      <div className="tt-name">{part.name}</div>
      <div className={`tt-sockets${cap > 12 ? ' dense' : ''}`}>
        {Array.from({ length: cap }, (_, i) => {
          const on = i < slot.energy;
          const isArrived = on && i >= slot.energy - arrived;
          const canDrag = on && !isArrived && !!onChitDown && sendable !== null;
          const landing = on && !isArrived && prev !== null && i >= prev;
          return (
            <span key={i} className="tt-sock">
              {on && (
                <span
                  className={`tt-chit${canDrag ? ' drag' : ''}${isArrived ? ' arrived' : ''}${landing ? ' landing' : ''}`}
                  onPointerDown={canDrag ? onChitDown : undefined}
                />
              )}
            </span>
          );
        })}
      </div>
      <div className="tt-stats">
        {atk > 0 && (
          <span>
            ATK <b>{atk}</b>
          </span>
        )}
        {gen > 0 && (
          <span>
            GEN <b>+{gen}</b>
          </span>
        )}
        <span>
          MAX <b>{part.energyCapacity}</b>
        </span>
      </div>
    </div>
  );
}
