import type { Cell, Ship, ShipSlot } from '../types/ship';
import type { ModuleRole, PartCard } from '../types/card';
import type { PartId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import { placementLine } from '../cards';
import { cellsAround, cockpitIndex, slotAt, touching } from './module';
import { placeModule, moveModule } from './build';

// ----------------------------------------------------------------- layout

const roleOf = (content: Content, slot: ShipSlot | undefined): ModuleRole | undefined =>
  slot && !slot.destroyed ? partOf(content, slot.partId)?.role : undefined;

const nameOf = (content: Content, slot: ShipSlot): string => partOf(content, slot.partId)?.name ?? 'Module';

/** Every module that can be reached from the cockpit, cell to touching cell. */
function attached(ship: Ship): Set<SlotIndex> {
  const start = ship.slots[cockpitIndex(ship)];
  const seen = new Set<SlotIndex>();
  if (!start) return seen;
  const queue = [start];
  seen.add(start.index);
  while (queue.length > 0) {
    const at = queue.shift()!;
    for (const cell of cellsAround(at)) {
      const next = slotAt(ship, cell);
      if (!next || next.destroyed || seen.has(next.index)) continue;
      seen.add(next.index);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * Everything wrong with a ship's layout, as sentences. Empty means it flies.
 *
 * Read off the whole grid rather than one placement at a time, so a move that
 * fixes one module and breaks another is caught either way round.
 */
export function layoutErrors(content: Content, ship: Ship): string[] {
  const errors: string[] = [];
  const cockpit = ship.slots[cockpitIndex(ship)];
  if (!cockpit) return ['The ship has no cockpit.'];
  const live = ship.slots.filter((s) => !s.destroyed);

  const cells = new Set<string>();
  for (const slot of ship.slots) {
    const key = `${slot.x},${slot.y}`;
    if (cells.has(key)) errors.push(`Two modules share the cell at ${key}.`);
    cells.add(key);
  }

  const reach = attached(ship);
  for (const slot of live) {
    if (!reach.has(slot.index)) {
      errors.push(`${nameOf(content, slot)} isn’t attached — every module has to touch the cockpit or a module that does.`);
    }
  }

  for (const slot of live) {
    if (roleOf(content, slot) === 'WPN' && slot.y < cockpit.y) {
      errors.push(`${nameOf(content, slot)} is a weapon — weapons go beside or behind the cockpit, never in front of it.`);
    }
  }

  for (const shield of live) {
    if (roleOf(content, shield) !== 'SHD') continue;
    for (const ahead of live) {
      if (ahead.x === shield.x && ahead.y < shield.y) {
        errors.push(`${nameOf(content, ahead)} sits in front of ${nameOf(content, shield)} — nothing may sit in front of a shield.`);
      }
    }
  }

  for (const slot of live) {
    const part = partOf(content, slot.partId);
    for (const rule of part?.placement ?? []) {
      if (breaks(content, ship, slot, rule.rule, rule.role)) {
        errors.push(`${part?.name ?? 'Module'}: ${placementLine(rule, part?.role)}`);
      }
    }
  }
  return errors;
}

/** Does this module break one of its own placement limits? */
function breaks(content: Content, ship: Ship, slot: ShipSlot, rule: string, role: ModuleRole): boolean {
  const others = ship.slots.filter((s) => s.index !== slot.index && roleOf(content, s) === role);
  const ahead = () => others.some((s) => s.x === slot.x && s.y < slot.y);
  const behind = () => others.some((s) => s.x === slot.x && s.y > slot.y);
  const beside = () => others.some((s) => touching(s, slot));
  switch (rule) {
    case 'not-in-front-of':
      return behind();
    case 'not-behind':
      return ahead();
    case 'next-to':
      return !beside();
    case 'not-next-to':
      return beside();
    default:
      return false;
  }
}

export const layoutOk = (content: Content, ship: Ship): boolean =>
  layoutErrors(content, ship).length === 0;

/**
 * Is an edit acceptable? It may not break anything that wasn't already
 * broken. A ship that comes out of a fight with a module shot out from
 * between two others can be worked on without fixing everything first.
 */
export function editAllowed(content: Content, before: Ship, after: Ship): boolean {
  const was = new Set(layoutErrors(content, before));
  return layoutErrors(content, after).every((e) => was.has(e));
}

/**
 * Empty cells a module could be attached to: every cell touching a module
 * that's still there. `without` leaves one module out of the reckoning — the
 * one being moved.
 */
export function openCells(ship: Ship, without?: SlotIndex): Cell[] {
  const out = new Map<string, Cell>();
  for (const slot of ship.slots) {
    if (slot.destroyed || slot.index === without) continue;
    for (const cell of cellsAround(slot)) {
      const there = slotAt(ship, cell);
      if (there && there.index !== without) continue;
      out.set(`${cell.x},${cell.y}`, cell);
    }
  }
  return [...out.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Would the layout still hold with this module attached on `cell`? */
export const canPlaceAt = (content: Content, ship: Ship, partId: PartId, cell: Cell): boolean =>
  !slotAt(ship, cell) && editAllowed(content, ship, placeModule(content, ship, partId, cell, 0));

/** Every cell a module could legally be attached to, front first. */
export const legalCells = (content: Content, ship: Ship, partId: PartId): Cell[] =>
  openCells(ship).filter((cell) => canPlaceAt(content, ship, partId, cell));

/** Would moving this module to `cell` (swapping, if it's taken) leave a legal layout? */
export function canMoveTo(content: Content, ship: Ship, from: SlotIndex, cell: Cell): boolean {
  const moving = ship.slots[from];
  if (!moving || from === cockpitIndex(ship)) return false;
  if (moving.x === cell.x && moving.y === cell.y) return false;
  const there = slotAt(ship, cell);
  if (there && there.index === cockpitIndex(ship)) return false;
  const after = moveModule(ship, from, cell);
  return after !== ship && editAllowed(content, ship, after);
}

/**
 * Where a module goes when nobody chose — the auto-arranger behind the
 * enemies, the boss and "draft the rest". It plays the layout rules the way a
 * table would: guns beside the cockpit, shields over whatever is worth
 * covering (the cockpit first), generators touching what they feed. Null
 * when nowhere is legal.
 */
export function bestCell(content: Content, ship: Ship, partId: PartId): Cell | null {
  const part = partOf(content, partId);
  if (!part) return null;
  let best: Cell | null = null;
  let top = -Infinity;
  for (const cell of legalCells(content, ship, partId)) {
    const score = cellScore(content, ship, part, cell);
    if (score > top) {
      top = score;
      best = cell;
    }
  }
  return best;
}

function cellScore(content: Content, ship: Ship, part: PartCard, cell: Cell): number {
  const around = cellsAround(cell)
    .map((c) => roleOf(content, slotAt(ship, c)))
    .filter((r): r is ModuleRole => !!r);
  const touches = (role: ModuleRole) => around.filter((r) => r === role).length;
  const spread = Math.abs(cell.x) * 0.5;
  // The front is where shields go; anything else there is in their way.
  const rear = cell.y >= 0 ? 2 : -2;

  switch (part.role) {
    case 'WPN':
      return touches('COCKPIT') * 10 + (cell.y === 0 ? 4 : 0) + touches('GEN') * 2 - spread - cell.y;
    case 'SHD': {
      // Worth whatever it would cover: the cockpit most, then the guns.
      const covered = ship.slots
        .filter((s) => !s.destroyed && s.x === cell.x && s.y > cell.y)
        .reduce((sum, s) => {
          const role = roleOf(content, s);
          return sum + (role === 'COCKPIT' ? 6 : role === 'WPN' ? 3 : 1);
        }, 0);
      return covered * 10 - spread;
    }
    case 'GEN':
      return touches('WPN') * 5 + touches('COCKPIT') * 4 + rear - spread;
    case 'RDS':
      return touches('WPN') * 3 + touches('GEN') * 3 + touches('COCKPIT') * 2 + rear - spread;
    default:
      return (cell.y > 0 ? 3 : cell.y === 0 ? 1 : -2) + around.length - spread;
  }
}
