import type { Cell, Ship, ShipSlot } from '../types/ship';
import type { BossSheet, EnemyInstance } from '../types/enemy';
import type { GameConfig, ShipSizeRule } from '../types/config';
import { enemyModuleCount } from '../types/config';
import type { ModuleRole, PartCard } from '../types/card';
import type { EnemyId, PartId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Deck } from '../deck';
import { draw, returnToDeck } from '../deck';
import type { Rng } from '../rng';
import { placementLine, powerCostOf } from '../cards';
import { cellsAround, cockpitIndex, maxEnergyOf, roomIn, slotAt, touching } from './module';

export * from './module';
export * from './reroute';

/**
 * Ships, on a grid.
 *
 * A ship is a cockpit at cell (0, 0) with modules attached around it, and the
 * same rules build every ship on the table — players' at the draft and at the
 * end of a mission, enemies' at spawn. Lower rows are the front: for a player
 * that's everything above the cockpit, and an enemy is drawn the other way up,
 * front facing the players. What decides where a module may go:
 *
 *   1. every module is attached — it touches the cockpit, or a module that does;
 *   2. weapons sit beside or behind the cockpit, never in front of it;
 *   3. nothing sits in front of a shield (same column, further forward);
 *   4. whatever placement limits the card prints.
 *
 * How *many* modules a ship may carry is read off the cockpit according to
 * `config.shipSizeRule` — on top of what the draft already limits.
 */

const reindex = (slots: ShipSlot[]): ShipSlot[] =>
  slots.map((slot, index) => (slot.index === index ? slot : { ...slot, index }));

const clampEnergy = (content: Content, partId: PartId, energy: number): number =>
  Math.max(0, Math.min(energy, Math.max(0, partOf(content, partId)?.energyCapacity ?? 0)));

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** A fresh hull: the cockpit, alone at (0, 0), with `energy` on it. */
export function createShip(content: Content, wantedCockpitId: PartId, name: string, energy: number): Ship {
  // Content is editable at runtime, so a loadout can name a cockpit the deck
  // no longer has. Anchor on any cockpit rather than build around nothing.
  const cockpitId = partOf(content, wantedCockpitId)?.role === 'COCKPIT'
    ? wantedCockpitId
    : (firstCockpitIn(content) ?? wantedCockpitId);
  return {
    id: `ship-${slug(name)}`,
    name,
    cockpitId,
    slots: [{ index: 0, partId: cockpitId, energy: clampEnergy(content, cockpitId, energy), destroyed: false, x: 0, y: 0 }],
    destroyed: false,
    flags: { negateNext: 0, retaliate: 0 },
  };
}

/** Modules only — the cockpit left out. */
export const modulesOf = (ship: Ship): ShipSlot[] =>
  ship.slots.filter((s) => s.partId !== ship.cockpitId);

export const moduleCount = (ship: Ship): number => modulesOf(ship).filter((s) => !s.destroyed).length;

// ---------------------------------------------------------------- editing

/** Attach a module on an empty cell. Legality is the caller's to check first. */
export function placeModule(content: Content, ship: Ship, partId: PartId, cell: Cell, energy: number): Ship {
  if (slotAt(ship, cell)) return ship;
  const slot: ShipSlot = {
    index: ship.slots.length,
    partId,
    energy: clampEnergy(content, partId, energy),
    destroyed: false,
    x: cell.x,
    y: cell.y,
  };
  return { ...ship, slots: [...ship.slots, slot] };
}

/** Take a module off the ship. The cockpit never comes off. */
export function removeModule(ship: Ship, index: SlotIndex): { ship: Ship; partId: PartId | null; energy: number } {
  const target = ship.slots[index];
  if (!target || index === cockpitIndex(ship)) return { ship, partId: null, energy: 0 };
  const slots = ship.slots.filter((_, i) => i !== index);
  return { ship: { ...ship, slots: reindex(slots) }, partId: target.partId, energy: target.energy };
}

/**
 * Move a module to another cell. Onto an empty cell it simply goes there;
 * onto another module the two swap places. The cockpit stays put.
 */
export function moveModule(ship: Ship, from: SlotIndex, cell: Cell): Ship {
  const moving = ship.slots[from];
  if (!moving || from === cockpitIndex(ship)) return ship;
  if (moving.x === cell.x && moving.y === cell.y) return ship;
  const there = slotAt(ship, cell);
  if (there && there.index === cockpitIndex(ship)) return ship;
  const slots = ship.slots.map((s) => {
    if (s.index === from) return { ...s, x: cell.x, y: cell.y };
    if (there && s.index === there.index) return { ...s, x: moving.x, y: moving.y };
    return s;
  });
  return { ...ship, slots };
}

/**
 * Re-anchor a ship on a different cockpit, modules and all: the new one takes
 * the old one's cell, and comes in with `energy` — a refit, not a charged part.
 */
export function swapCockpit(content: Content, ship: Ship, cockpitId: PartId, energy: number): Ship {
  if (cockpitId === ship.cockpitId) return ship;
  const at = cockpitIndex(ship);
  const slots = ship.slots.map((s) =>
    s.index === at ? { ...s, partId: cockpitId, energy: clampEnergy(content, cockpitId, energy), destroyed: false } : s,
  );
  return { ...ship, cockpitId, slots };
}

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

// ------------------------------------------------------------------- size

/**
 * How full the ship is, in the units the size rule counts: modules under the
 * slot limit, power cost under a budget. Under the draft rule only the draft
 * limits a ship, so this is just its module count.
 */
export function sizeUsed(content: Content, ship: Ship, rule: ShipSizeRule): number {
  const modules = modulesOf(ship).filter((s) => !s.destroyed);
  if (rule !== 'budget') return modules.length;
  return modules.reduce((sum, s) => {
    const part = partOf(content, s.partId);
    return sum + (part ? powerCostOf(part) : 0);
  }, 0);
}

/** The cockpit's limit under the size rule: its slots, its rating, or none at all. */
export function sizeLimit(content: Content, ship: Ship, rule: ShipSizeRule): number {
  if (rule === 'draft') return Infinity;
  const cockpit = partOf(content, ship.cockpitId);
  return Math.max(0, (rule === 'slots' ? cockpit?.slots : cockpit?.powerRating) ?? 0);
}

/** What one more of this module would add under the size rule. */
export const sizeCostOf = (part: PartCard | undefined, rule: ShipSizeRule): number =>
  !part ? 0 : rule === 'budget' ? powerCostOf(part) : 1;

/** Would this module still fit under the cockpit's limit? */
export const hasRoomFor = (content: Content, ship: Ship, partId: PartId, rule: ShipSizeRule): boolean =>
  sizeUsed(content, ship, rule) + sizeCostOf(partOf(content, partId), rule) <=
  sizeLimit(content, ship, rule);

/** The ship is over its limit — a cockpit swap can do that. */
export const overSize = (content: Content, ship: Ship, rule: ShipSizeRule): boolean =>
  sizeUsed(content, ship, rule) > sizeLimit(content, ship, rule);

// ----------------------------------------------------------------- energy

/** Add ⚡ to a slot, capped at the module's max. Reports what actually landed. */
export function chargeSlot(
  content: Content,
  ship: Ship,
  index: SlotIndex,
  amount: number,
): { ship: Ship; added: number } {
  const target = ship.slots[index];
  if (!target || target.destroyed || amount <= 0) return { ship, added: 0 };
  const added = Math.min(roomIn(content, target), amount);
  if (added <= 0) return { ship, added: 0 };
  return { ship: withSlot(ship, index, { energy: target.energy + added }), added };
}

/** Set a slot's ⚡ outright — drains, EMPs, spending an attack. */
export const setEnergy = (ship: Ship, index: SlotIndex, energy: number): Ship => {
  const target = ship.slots[index];
  return target ? withSlot(ship, index, { energy: Math.max(0, energy) }) : ship;
};

function withSlot(ship: Ship, index: SlotIndex, patch: Partial<ShipSlot>): Ship {
  const slots = ship.slots.slice();
  slots[index] = { ...slots[index]!, ...patch };
  return { ...ship, slots };
}

// ------------------------------------------------------------------- hits

export interface HitReport {
  ship: Ship;
  /** ⚡ the hit took off the module. */
  lost: number;
  /** The module was already at 0 — this hit destroyed it. */
  destroyed: boolean;
  /** The destroyed module carried the 1st-down icon. */
  firstDown: boolean;
  negated: boolean;
  notes: string[];
  /** ⚡ a shock absorber paid to soften the hit, by slot. */
  softened: { slot: SlotIndex; amount: number }[];
}

/**
 * Land one hit on one module.
 *
 * Energy is HP: a hit takes ⚡ off the module equal to its strength, never less
 * than 1, and never spills into the module behind. A module already at 0 is
 * destroyed by the next hit, whatever its strength. Destroying the cockpit
 * destroys the ship.
 */
export function hitSlot(content: Content, ship: Ship, index: SlotIndex, strength: number): HitReport {
  const notes: string[] = [];
  const target = ship.slots[index];
  const part = partOf(content, target?.partId);
  const none: HitReport = { ship, lost: 0, destroyed: false, firstDown: false, negated: false, notes, softened: [] };
  if (!target || target.destroyed || !part) return none;

  if (ship.flags.negateNext > 0) {
    notes.push('hit negated');
    return {
      ...none,
      ship: { ...ship, flags: { ...ship.flags, negateNext: ship.flags.negateNext - 1 } },
      negated: true,
    };
  }

  if (target.energy <= 0) {
    const cockpit = index === cockpitIndex(ship);
    notes.push(`${part.name} destroyed`);
    return {
      ...none,
      ship: { ...withSlot(ship, index, { destroyed: true }), destroyed: ship.destroyed || cockpit },
      destroyed: true,
      firstDown: !!part.firstDown,
    };
  }

  // A shock absorber softens the hit — down to 1, never past it — and pays
  // for it with a point of its own charge.
  let next = ship;
  let loss = Math.max(1, strength);
  const softened: HitReport['softened'] = [];
  for (const slot of next.slots) {
    if (loss <= 1) break;
    if (slot.destroyed || slot.energy <= 0) continue;
    const reducer = partOf(content, slot.partId);
    if (!reducer?.damageReduction) continue;
    const cut = Math.min(reducer.damageReduction, loss - 1);
    loss -= cut;
    next = withSlot(next, slot.index, { energy: slot.energy - 1 });
    softened.push({ slot: slot.index, amount: 1 });
    notes.push(`${reducer.name} softens it by ${cut}`);
  }

  const current = next.slots[index]!;
  const lost = Math.min(current.energy, loss);
  next = withSlot(next, index, { energy: current.energy - lost });
  if (current.energy - lost <= 0) notes.push(`${part.name} is offline — one more hit destroys it`);
  return { ...none, ship: next, lost, softened };
}

/**
 * After a fight: destroyed modules are gone. They come off the grid (the
 * cockpit stays — a destroyed ship is still a destroyed ship) and back to the
 * caller to discard. What's left keeps its cells.
 */
export function compactShip(ship: Ship): { ship: Ship; removed: PartId[] } {
  const removed = ship.slots
    .filter((s) => s.destroyed && s.partId !== ship.cockpitId)
    .map((s) => s.partId);
  if (removed.length === 0) return { ship, removed };
  const slots = ship.slots.filter((s) => !s.destroyed || s.partId === ship.cockpitId);
  return { ship: { ...ship, slots: reindex(slots) }, removed };
}

/** Bring a destroyed cockpit back online with `energy` — revives, takeovers, rebuilds. */
export function restoreCockpit(content: Content, ship: Ship, energy: number): Ship {
  const index = cockpitIndex(ship);
  const cockpit = ship.slots[index];
  if (!cockpit) return ship;
  const max = maxEnergyOf(content, cockpit);
  return {
    ...withSlot(ship, index, {
      destroyed: false,
      energy: cockpit.destroyed ? Math.min(max, energy) : Math.max(cockpit.energy, Math.min(max, energy)),
    }),
    destroyed: false,
  };
}

// ---------------------------------------------------------------- building

/**
 * The order the arranger lays a ship out in: guns first so they claim the
 * cockpit's sides, then the shields that cover them, then what feeds them.
 */
const ARRANGE_ORDER: Record<ModuleRole, number> = { WPN: 0, SHD: 1, GEN: 2, RDS: 3, OTH: 4, COCKPIT: 5 };

/**
 * Lay a set of modules out legally, one at a time, each where `bestCell` puts
 * it. Anything with no legal cell — or no room, when a size rule is passed —
 * comes back rejected.
 */
export function arrangeShip(
  content: Content,
  ship: Ship,
  partIds: PartId[],
  energy: number,
  rule?: ShipSizeRule,
): { ship: Ship; rejected: PartId[] } {
  const ordered = partIds
    .map((id, i) => ({ id, i, rank: ARRANGE_ORDER[partOf(content, id)?.role ?? 'OTH'] }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);

  let next = ship;
  const rejected: PartId[] = [];
  for (const { id } of ordered) {
    if (!partOf(content, id)) continue;
    if (rule && !hasRoomFor(content, next, id, rule)) {
      rejected.push(id);
      continue;
    }
    const at = bestCell(content, next, id);
    if (!at) {
      rejected.push(id);
      continue;
    }
    next = placeModule(content, next, id, at, energy);
  }
  return { ship: next, rejected };
}

/**
 * Spawn a regular enemy, by the rules' recipe: one card off the cockpit deck,
 * mission depth + players modules off the parts deck, laid out by the layout
 * rules, every module on `startEnergy`.
 *
 * A module the layout rules won't take is shuffled back and another drawn in
 * its place, so the recipe's count is what arrives.
 */
export function spawnEnemy(
  content: Content,
  decks: { parts: Deck; cockpits: Deck },
  config: GameConfig,
  depth: number,
  players: number,
  rng: Rng,
  instanceId: EnemyId = `enemy-${rng.int(1000, 9999)}`,
): { enemy: EnemyInstance; parts: Deck; cockpits: Deck } {
  let cockpits = decks.cockpits;
  const pulled = draw(cockpits, 1, rng);
  cockpits = pulled.deck;
  // An empty cockpit deck still has to field a ship: one comes out of the box.
  const cockpitId = pulled.drawn[0] ?? firstCockpitIn(content) ?? '';
  const name = partOf(content, cockpitId)?.name ?? 'Hostile';

  const wanted = enemyModuleCount(config, depth, players);
  const rule = config.enemySizeCapped ? config.shipSizeRule : undefined;

  // Draw the whole recipe first and lay it out the way the arranger would —
  // guns before the shields that cover them — so an enemy is built like a
  // player's ship is.
  const first = draw(decks.parts, wanted, rng);
  let parts = first.deck;
  const arranged = arrangeShip(content, createShip(content, cockpitId, name, config.startEnergy), first.drawn, config.startEnergy, rule);
  let ship = arranged.ship;
  const setAside = arranged.rejected;

  // Whatever wouldn't fit is replaced, one draw at a time.
  for (let attempt = 0; moduleCount(ship) < wanted && attempt < wanted * 4 + 8; attempt++) {
    if (rule && sizeUsed(content, ship, rule) >= sizeLimit(content, ship, rule)) break; // capped and full
    const step = draw(parts, 1, rng);
    parts = step.deck;
    const id = step.drawn[0];
    if (!id) break; // parts deck and discard both dry
    const at = rule && !hasRoomFor(content, ship, id, rule) ? null : bestCell(content, ship, id);
    if (!at) {
      setAside.push(id);
      continue;
    }
    ship = placeModule(content, ship, id, at, config.startEnergy);
  }

  return {
    enemy: {
      instanceId,
      name,
      ship: { ...ship, id: `ship-${instanceId}` },
      isBoss: false,
      depth,
    },
    parts: returnToDeck(parts, setAside, rng),
    cockpits,
  };
}

/** The boss, off its sheet: fixed parts, laid out by the same rules. */
export function spawnBoss(
  content: Content,
  sheet: BossSheet,
  config: GameConfig,
  depth: number,
): EnemyInstance {
  const energy = sheet.startEnergy ?? config.startEnergy;
  const cockpitId =
    sheet.fixedPartIds.find((id) => partOf(content, id)?.role === 'COCKPIT') ??
    firstCockpitIn(content) ??
    '';
  const modules = sheet.fixedPartIds.filter((id) => id !== cockpitId && partOf(content, id));
  const hull = createShip(content, cockpitId, sheet.name, energy);
  const { ship } = arrangeShip(content, hull, modules, energy);
  return {
    instanceId: `${sheet.id}-boss`,
    name: sheet.name,
    ship: { ...ship, id: `ship-${sheet.id}` },
    isBoss: true,
    depth,
  };
}

function firstCockpitIn(content: Content): PartId | null {
  return Object.values(content.parts).find((p) => p.role === 'COCKPIT')?.id ?? null;
}
