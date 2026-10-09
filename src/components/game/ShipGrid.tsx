import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Cell, Ship, ShipSlot } from '@engine/types';
import { ship as shipEngine } from '@engine';

export type GridSize = 'sm' | 'md' | 'lg';

/** Cell size in px, per grid size. */
export const CELL: Record<GridSize, { w: number; h: number; gap: number }> = {
  sm: { w: 68, h: 90, gap: 5 },
  md: { w: 76, h: 100, gap: 6 },
  lg: { w: 104, h: 140, gap: 8 },
};

/**
 * A ship on its grid.
 *
 * The cockpit is the anchor: rows above it are the front, its own row is its
 * sides, rows below are the back. A player's ship is drawn front-up, facing
 * the enemy at the top of the table; an enemy is drawn the other way up, front
 * facing down at the players — the same grid, flipped.
 *
 * Laying cells out is all this does. What goes *in* a cell — a tile that can
 * be clicked, dragged, dropped on — is the caller's, through `renderSlot` and
 * (when editing) `renderEmpty` for the open cells around the ship.
 */
export function ShipGrid({
  ship,
  facing = 'up',
  size = 'sm',
  renderSlot,
  renderEmpty,
  zoneLabels = true,
}: {
  ship: Ship;
  facing?: 'up' | 'down';
  size?: GridSize;
  renderSlot: (slot: ShipSlot) => ReactNode;
  /** When given, the ring of open cells around the ship is drawn too. */
  renderEmpty?: (cell: Cell) => ReactNode;
  zoneLabels?: boolean;
}) {
  const { w, h, gap } = CELL[size];
  const bounds = shipEngine.gridBounds(ship);
  const pad = renderEmpty ? 1 : 0;
  const minX = bounds.minX - pad;
  const maxX = bounds.maxX + pad;
  const minY = bounds.minY - pad;
  const maxY = bounds.maxY + pad;
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const row = (y: number) => (facing === 'up' ? y - minY : maxY - y) + 1;
  const col = (x: number) => x - minX + 1;
  const cockpitY = ship.slots[shipEngine.cockpitIndex(ship)]?.y ?? 0;

  const open = renderEmpty ? shipEngine.openCells(ship) : [];
  const ys = Array.from({ length: rows }, (_, i) => (facing === 'up' ? minY + i : maxY - i));

  return (
    <div className="flex items-stretch gap-1">
      {zoneLabels && (
        <div
          className="grid flex-none"
          style={{ gridTemplateRows: `repeat(${rows}, ${h}px)`, rowGap: gap, width: 12 }}
        >
          {ys.map((y) => (
            <div key={y} className="flex items-center justify-center">
              <span
                className={`font-mono text-[8px] tracking-[0.2em] [writing-mode:vertical-rl] ${
                  y === cockpitY ? 'text-putty-700' : 'text-putty-500'
                }`}
              >
                {y < cockpitY ? 'FRONT' : y > cockpitY ? 'BACK' : 'SIDES'}
              </span>
            </div>
          ))}
        </div>
      )}
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${w}px)`,
          gridTemplateRows: `repeat(${rows}, ${h}px)`,
          gap,
        }}
      >
        {/* The cockpit's row, ruled across: front on one side of it, back on the other. */}
        <div
          className="pointer-events-none border-y border-dashed border-putty-500/60 bg-putty-400/10"
          style={{ gridColumn: `1 / span ${cols}`, gridRow: row(cockpitY), margin: `-${Math.ceil(gap / 2)}px -4px` }}
        />
        {open.map((cell) => (
          <motion.div
            key={`open:${cell.x},${cell.y}`}
            layout="position"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            style={{ gridColumn: col(cell.x), gridRow: row(cell.y) }}
          >
            {renderEmpty!(cell)}
          </motion.div>
        ))}
        {ship.slots.map((slot) => (
          <motion.div
            key={`slot:${slot.x},${slot.y}:${slot.partId}`}
            layout="position"
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            style={{ gridColumn: col(slot.x), gridRow: row(slot.y) }}
          >
            {renderSlot(slot)}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
