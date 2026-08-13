import type { AdjacencyBonus, Ship, ShipSlot } from '../types/ship';
import type { EnemyInstance, EnemyStatBlock } from '../types/enemy';
import type { GameConfig } from '../types/config';
import { effectiveThreshold, partsForSpawn } from '../types/config';
import type { EnemyId, PartId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Deck } from '../deck';
import { discard, draw } from '../deck';
import type { Rng } from '../rng';
import { cardCost } from '../cards';
import { capacityOf, isActive, liveModules } from './module';

export * from './module';

/**
 * Ship assembly, both for players (builder / rearrangement points) and for
 * enemies (drawn from the Parts deck until the next Cockpit turns up).
 */

const emptySlot = (index: SlotIndex): ShipSlot => ({
  index,
  partId: null,
  energy: 0,
  usedThisDownSet: false,
  disabled: false,
});

/**
 * A fresh hull: the cockpit, with an empty position on every side of it.
 *
 * The grid isn't a fixed rectangle handed out by the cockpit — it's whatever
 * shape the ship has grown into, always carrying one ring of empty positions
 * around the parts already fitted (see `normalizeGrid`). What the cockpit sets
 * is *how many modules* may hang off it, and it doesn't count itself.
 *
 * The cockpit rolls out with its shield pool full: it is the ship's last line
 * and the only durability it has, so starting it dry would mean the first
 * unanswered hit is fatal.
 */
export function createShip(content: Content, wantedCockpitId: PartId, name: string): Ship {
  // Content is editable at runtime, so a loadout can name a cockpit the deck
  // no longer has. Anchor on any cockpit rather than build a hull around a
  // card that isn't there — a ship with no cockpit has no shield and no gun.
  const cockpitId = partOf(content, wantedCockpitId)
    ? wantedCockpitId
    : (firstCockpitIn(content) ?? wantedCockpitId);
  const cockpit = partOf(content, cockpitId);

  // 3×3 with the cockpit in the middle: the anchor plus its ring of open
  // sides. Every later placement re-pads the grid the same way.
  const slots = Array.from({ length: 9 }, (_, i) => emptySlot(i));
  slots[4] = { ...slots[4]!, partId: cockpitId, energy: cockpit?.energyCapacity ?? 0 };

  return {
    id: `ship-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    cockpitId,
    gridCols: 3,
    slots,
    destroyed: false,
    flags: { negateNext: 0, retaliate: 0 },
  };
}

/** First free non-cockpit slot, or -1. */
export function firstFreeSlot(ship: Ship): SlotIndex {
  return ship.slots.findIndex((s) => s.partId === null);
}

/** Rows the grid currently spans. */
export const gridRows = (ship: Ship): number =>
  Math.ceil(ship.slots.length / Math.max(1, ship.gridCols));

/** Orthogonal neighbours, given the raw grid shape. */
function neighboursIn(cols: number, length: number, index: SlotIndex): SlotIndex[] {
  const width = Math.max(1, cols);
  const out: SlotIndex[] = [];
  const col = index % width;
  if (col > 0) out.push(index - 1);
  if (col < width - 1) out.push(index + 1);
  out.push(index - width, index + width);
  return out.filter((n) => n >= 0 && n < length);
}

/**
 * Orthogonal neighbours of a slot.
 *
 * The grid is `gridCols` wide, so this is plain index arithmetic — and it is
 * the one piece of geometry every adjacency rule reads: where a part may be
 * attached, where ⚡ may be rerouted, and which chains pay a bonus.
 */
export function neighbourSlots(ship: Ship, index: SlotIndex): SlotIndex[] {
  return neighboursIn(ship.gridCols, ship.slots.length, index);
}

/**
 * Re-pad the grid: the bounding box of everything fitted, plus one ring of
 * empty positions all the way round.
 *
 * That ring *is* the rule the builder shows — an open side on every side of
 * every module, and nothing further out — so the shape of a ship is whatever
 * its parts have been laid out into rather than a rectangle it was handed.
 * Indices move when the box grows, which is why this only ever runs while a
 * ship is being laid out, never mid-fight.
 */
export function normalizeGrid(ship: Ship): Ship {
  const cols = Math.max(1, ship.gridCols);
  const filled = ship.slots.filter((s) => s.partId);
  if (filled.length === 0) return ship;

  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  for (const slot of filled) {
    const row = Math.floor(slot.index / cols);
    const col = slot.index % cols;
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
  }

  const nextCols = maxCol - minCol + 3;
  const nextRows = maxRow - minRow + 3;
  const slots = Array.from({ length: nextCols * nextRows }, (_, i) => emptySlot(i));
  for (const slot of filled) {
    const row = Math.floor(slot.index / cols) - minRow + 1;
    const col = (slot.index % cols) - minCol + 1;
    const index = row * nextCols + col;
    slots[index] = { ...slot, index };
  }

  return { ...ship, gridCols: nextCols, slots };
}

/**
 * The hull with its ring of open positions stripped off — the ship as it looks
 * in a fight, where nothing can be attached and the ring is only clutter.
 * Slots keep their real indices, so anything clicked still points at the ship.
 */
export function hullGrid(ship: Ship): { cols: number; slots: ShipSlot[] } {
  const cols = ship.gridCols;
  const rows = gridRows(ship);
  if (cols <= 2 || rows <= 2) return { cols, slots: ship.slots };

  const slots: ShipSlot[] = [];
  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const slot = ship.slots[row * cols + col];
      if (slot) slots.push(slot);
    }
  }
  return { cols: cols - 2, slots };
}

/** Is a set of occupied positions one connected hull? */
function connected(cols: number, length: number, occupied: SlotIndex[]): boolean {
  const set = new Set(occupied);
  const first = occupied[0];
  if (first === undefined) return true;

  const seen = new Set<SlotIndex>([first]);
  const queue: SlotIndex[] = [first];
  while (queue.length > 0) {
    const at = queue.pop()!;
    for (const n of neighboursIn(cols, length, at)) {
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size === set.size;
}

/** Positions currently holding a part. */
const occupiedSlots = (ship: Ship): SlotIndex[] =>
  ship.slots.filter((s) => s.partId).map((s) => s.index);

/** Does the hull hold together as one piece? */
export const isConnected = (ship: Ship): boolean =>
  connected(ship.gridCols, ship.slots.length, occupiedSlots(ship));

export const areAdjacent = (ship: Ship, a: SlotIndex, b: SlotIndex): boolean =>
  a !== b && neighbourSlots(ship, a).includes(b);

/**
 * May a part be attached here?
 *
 * A ship grows outward from what's already fitted: a new part has to touch
 * something. That's what turns the adjacency payoffs (GEN→RDS→WPN, and
 * rerouting in general) into a placement decision rather than a lucky
 * accident. `ignore` drops one slot from the count — a module being dragged
 * out of a position can't be what holds itself on.
 *
 * Purely geometric: whether the ship has *room* for another module is the
 * cockpit's business, and `hasFreeCapacity` answers that separately.
 */
export function canAttachAt(ship: Ship, index: SlotIndex, ignore?: SlotIndex): boolean {
  const target = ship.slots[index];
  if (!target || target.partId) return false;
  return neighbourSlots(ship, index).some((n) => n !== ignore && !!ship.slots[n]?.partId);
}

/**
 * Where a part goes when nobody chose a position — enemy hulls, authored
 * loadouts, and the builder's "attach it somewhere" button.
 *
 * Reading order alone would grow every automatic ship into a single long
 * column, because the first open position is always the one above the top-left
 * part. Picking the position that keeps the hull squarest gives a ship a shape
 * worth rearranging, and leaves the deliberate layouts to the player.
 */
export function bestAttachSlot(ship: Ship): SlotIndex {
  const cols = Math.max(1, ship.gridCols);
  const filled = ship.slots.filter((s) => s.partId).map((s) => s.index);
  let best = -1;
  let bestScore = Infinity;

  for (const slot of ship.slots) {
    if (slot.partId || !canAttachAt(ship, slot.index)) continue;
    const rows = [...filled, slot.index].map((i) => Math.floor(i / cols));
    const columns = [...filled, slot.index].map((i) => i % cols);
    const height = Math.max(...rows) - Math.min(...rows) + 1;
    const width = Math.max(...columns) - Math.min(...columns) + 1;
    // Squarest first, then smallest overall; reading order breaks the rest.
    const score = Math.max(width, height) * 100 + width * height;
    if (score < bestScore) {
      bestScore = score;
      best = slot.index;
    }
  }
  return best;
}

/**
 * How many modules this hull may carry.
 *
 * The cockpit prints the number, and it does **not** count itself against it:
 * a 6-slot cockpit flies with six modules hung off it. Capacity is the only
 * limit on the grid — the shape is the player's.
 */
export const moduleCapacity = (content: Content, ship: Ship): number =>
  Math.max(0, partOf(content, ship.cockpitId)?.slots ?? 0);

/** Modules currently fitted, cockpit excluded. */
export const moduleCount = (ship: Ship): number =>
  ship.slots.filter((s) => s.partId && s.partId !== ship.cockpitId).length;

/** Room for one more module? */
export const hasFreeCapacity = (content: Content, ship: Ship): boolean =>
  moduleCount(ship) < moduleCapacity(content, ship);

/**
 * May the part in `from` be laid down on `to`?
 *
 * Landing on an occupied position is a straight swap, so the hull keeps its
 * footprint and is always legal — the cockpit included, since it's a part on
 * the grid like any other and nothing says it has to sit at the helm. Landing
 * on an empty one has to touch the rest of the hull *and* leave every module
 * still hanging together: a ship is one piece, not two drifting halves.
 */
export function canMoveTo(ship: Ship, from: SlotIndex, to: SlotIndex): boolean {
  const source = ship.slots[from];
  const target = ship.slots[to];
  if (!source?.partId || !target || from === to) return false;
  if (target.partId) return true;
  if (!canAttachAt(ship, to, from)) return false;
  const after = occupiedSlots(ship).map((i) => (i === from ? to : i));
  return connected(ship.gridCols, ship.slots.length, after);
}

/** Swap two positions, or move a part into an empty one. */
export function swapSlots(ship: Ship, a: SlotIndex, b: SlotIndex): Ship {
  const from = ship.slots[a];
  const to = ship.slots[b];
  if (!from || !to || a === b) return ship;

  const slots = ship.slots.slice();
  slots[a] = { ...to, index: a };
  slots[b] = { ...from, index: b };
  return normalizeGrid({ ...ship, slots });
}

/**
 * Put a part in a position, as-is. The grid is left exactly as it was, so the
 * caller's slot indices still mean what they meant — `fitPart` is the one that
 * re-pads afterwards.
 */
export function equipPart(ship: Ship, slot: SlotIndex, partId: PartId): Ship {
  const target = ship.slots[slot];
  if (!target || target.partId === ship.cockpitId) return ship;
  const slots = ship.slots.slice();
  slots[slot] = { ...target, partId, energy: 0, disabled: false, usedThisDownSet: false };
  return { ...ship, slots };
}

/**
 * Fit a part, charge its pool, and re-pad the grid around it — the whole of
 * "this module is now on the ship", in the order that keeps `slot` valid until
 * the last step.
 */
export function fitPart(
  content: Content,
  ship: Ship,
  slot: SlotIndex,
  partId: PartId,
  energy = 0,
): Ship {
  const fitted = equipPart(ship, slot, partId);
  if (fitted === ship) return ship;
  return normalizeGrid(energy > 0 ? chargeSlot(content, fitted, slot, energy).ship : fitted);
}

/**
 * Re-anchor a ship on a different cockpit.
 *
 * Capacity is the cockpit's, so the grid is rebuilt rather than patched:
 * modules are re-slotted in their old order and anything that no longer fits
 * comes back to the caller to put somewhere. The new cockpit arrives with its
 * own shield pool full, the same as any freshly fitted part — swapping
 * cockpits mid-run is a real refit, and it costs the ship its layout.
 */
export function swapCockpit(
  content: Content,
  ship: Ship,
  cockpitId: PartId,
): { ship: Ship; displaced: PartId[] } {
  if (cockpitId === ship.cockpitId) return { ship, displaced: [] };

  const modules = ship.slots
    .map((s) => s.partId)
    .filter((id): id is PartId => !!id && id !== ship.cockpitId);

  let next: Ship = {
    ...createShip(content, cockpitId, ship.name),
    id: ship.id,
    destroyed: ship.destroyed,
  };

  const displaced: PartId[] = [];
  for (const id of modules) {
    const free = bestAttachSlot(next);
    if (free < 0 || !hasFreeCapacity(content, next)) {
      displaced.push(id);
      continue;
    }
    next = fitPart(content, next, free, id);
  }
  return { ship: next, displaced };
}

/**
 * May this module be pulled off?
 *
 * The cockpit never can — it's the ship. Anything else can, as long as what's
 * left still hangs together: taking a module out of the middle of a chain
 * would leave whatever hung off it adrift.
 */
export function canDetach(ship: Ship, slot: SlotIndex): boolean {
  const target = ship.slots[slot];
  if (!target?.partId || target.partId === ship.cockpitId) return false;
  return connected(
    ship.gridCols,
    ship.slots.length,
    occupiedSlots(ship).filter((i) => i !== slot),
  );
}

export function detachPart(ship: Ship, slot: SlotIndex): { ship: Ship; partId: PartId | null } {
  const target = ship.slots[slot];
  if (!target?.partId || !canDetach(ship, slot)) return { ship, partId: null };
  const slots = ship.slots.slice();
  slots[slot] = emptySlot(slot);
  return { ship: normalizeGrid({ ...ship, slots }), partId: target.partId };
}

export function cockpitSlotIndex(ship: Ship): SlotIndex {
  return ship.slots.findIndex((s) => s.partId === ship.cockpitId);
}

/**
 * Move energy between two module pools.
 *
 * Charge only travels between neighbours: energy crosses a grid by being
 * handed along it, which is what makes where a generator sits matter.
 */
export function rerouteEnergy(
  content: Content,
  ship: Ship,
  from: SlotIndex,
  to: SlotIndex,
  amount: number,
  config: GameConfig,
): Ship {
  const src = ship.slots[from];
  const dst = ship.slots[to];
  if (!src || !dst || amount <= 0) return ship;
  if (!areAdjacent(ship, from, to)) return ship;

  const tax = Math.max(0, config.energyCostReroute);
  const moved = Math.min(
    amount,
    Math.max(0, src.energy - tax),
    Math.max(0, capacityOf(content, dst) - dst.energy),
  );
  if (moved <= 0) return ship;

  const slots = ship.slots.slice();
  slots[from] = { ...src, energy: src.energy - moved - tax };
  slots[to] = { ...dst, energy: dst.energy + moved };
  return { ...ship, slots };
}

/** Add energy to a pool, capped, returning what didn't fit. */
export function chargeSlot(
  content: Content,
  ship: Ship,
  slot: SlotIndex,
  amount: number,
): { ship: Ship; overflow: number } {
  const target = ship.slots[slot];
  if (!target || amount <= 0) return { ship, overflow: amount };
  const room = Math.max(0, capacityOf(content, target) - target.energy);
  const added = Math.min(room, amount);
  if (added <= 0) return { ship, overflow: amount };
  const slots = ship.slots.slice();
  slots[slot] = { ...target, energy: target.energy + added };
  return { ship: { ...ship, slots }, overflow: amount - added };
}

/**
 * Find GEN → RDS → WPN chains and any other adjacency payoffs.
 * Orthogonal neighbours only, walked left-to-right / top-to-bottom.
 */
export function findAdjacencyBonuses(content: Content, ship: Ship): AdjacencyBonus[] {
  const roleAt = (i: SlotIndex): string | null => {
    const slot = ship.slots[i];
    if (!slot || slot.disabled) return null;
    return partOf(content, slot.partId)?.role ?? null;
  };
  const neighbours = (i: SlotIndex): SlotIndex[] => neighbourSlots(ship, i);

  const bonuses: AdjacencyBonus[] = [];
  for (let gen = 0; gen < ship.slots.length; gen++) {
    if (roleAt(gen) !== 'GEN') continue;
    for (const rds of neighbours(gen)) {
      if (roleAt(rds) !== 'RDS') continue;
      for (const wpn of neighbours(rds)) {
        if (wpn === gen || roleAt(wpn) !== 'WPN') continue;
        const names = [gen, rds, wpn]
          .map((i) => partOf(content, ship.slots[i]?.partId)?.name ?? '?')
          .join(' → ');
        bonuses.push({
          slotIndices: [gen, rds, wpn],
          description: `${names} forms an unbroken GEN→RDS→WPN chain. Rerouted ⚡ reaches the weapon at no cost in downs.`,
        });
      }
    }
  }
  return bonuses;
}

/** Clear per-set flags — called when a side opens a fresh set of downs. */
export function resetDownSetFlags(slots: ShipSlot[]): ShipSlot[] {
  return slots.map((s) => (s.usedThisDownSet ? { ...s, usedThisDownSet: false } : s));
}

/**
 * Start-of-turn upkeep: the reactor baseline is distributed across the grid,
 * generators fill their own pools, and Infested-style modules bleed the ship.
 * Overflow is returned so the caller can decide whether a redistributor
 * catches it.
 *
 * The baseline (`config.energyPerTurn`) is the dial that decides how many
 * downs a side can actually spend on its modules. Without it a ship's whole
 * economy is its generator modules, and printed weapon costs outrun them
 * badly enough that fights stall — see the note in the README.
 *
 * Weapons sit outside that distribution unless `weaponsDrawFromReactor` says
 * otherwise: a gun is loaded by rerouting charge into it, so where the
 * generators sit on the grid is the decision that arms the ship.
 *
 * The **cockpit sits outside it too**. Its shield refills by spending a down
 * on its own generator, or by rerouting from a neighbour — if upkeep topped it
 * up for free, the down that buys the basic generator would never be worth
 * taking.
 */
export function runUpkeep(
  content: Content,
  ship: Ship,
  baseline = 0,
  weaponsDrawFromReactor = false,
): { ship: Ship; generated: number; overflow: number; drained: number } {
  let next = ship;
  let generated = 0;
  let overflow = 0;

  // Reactor output goes where it does the most good: the hungriest actives
  // first, then shields, then anything else with room.
  let pool = Math.max(0, baseline);
  if (pool > 0) {
    const priority = liveModules(content, next)
      .filter((m) => weaponsDrawFromReactor || m.part.role !== 'WPN')
      .map((m) => ({
        ...m,
        rank:
          isActive(m.part) ? 0 : m.part.role === 'SHD' ? 1 : 2,
        want: cardCost(m.part) || 1,
      }))
      .sort((a, b) => a.rank - b.rank || b.want - a.want);

    for (const m of priority) {
      if (pool <= 0) break;
      const current = next.slots[m.slot.index];
      if (!current) continue;
      const room = (m.part.energyCapacity ?? 0) - current.energy;
      if (room <= 0) continue;
      const put = Math.min(room, pool);
      const charged = chargeSlot(content, next, m.slot.index, put);
      next = charged.ship;
      pool -= put - charged.overflow;
      generated += put - charged.overflow;
    }
    overflow += pool;
  }

  for (const { slot, part } of liveModules(content, next)) {
    if (!part.generates) continue;
    const result = chargeSlot(content, next, slot.index, part.generates);
    next = result.ship;
    generated += part.generates - result.overflow;
    overflow += result.overflow;
  }

  const drainPerTurn = liveModules(content, next).reduce(
    (sum, m) => sum + (m.part.drainPerTurn ?? 0),
    0,
  );
  let drained = 0;
  if (drainPerTurn > 0) {
    const slots = next.slots.map((s) => {
      if (s.energy <= 0) return s;
      const taken = Math.min(s.energy, drainPerTurn);
      drained += taken;
      return { ...s, energy: s.energy - taken };
    });
    next = { ...next, slots };
  }

  return { ship: next, generated, overflow, drained };
}

/**
 * Spawn an enemy ship.
 *
 * Rules: draw parts onto the current cockpit until another Cockpit turns up —
 * that one starts the *next* ship, so it delimits this one. Multiplayer adds
 * `partsPerExtraPlayer` more draws past that cockpit, per player beyond the
 * first. `partsBase` acts as a floor so a cockpit drawn immediately doesn't
 * produce an empty hull.
 */
export function spawnEnemyShip(
  content: Content,
  statBlock: EnemyStatBlock,
  partsDeck: Deck,
  config: GameConfig,
  rng: Rng,
  instanceId: EnemyId = `${statBlock.id}-${rng.int(1000, 9999)}`,
): { enemy: EnemyInstance; partsDeck: Deck } {
  const floor = Math.max(0, statBlock.partsBase || config.enemyPartsBase);
  const target = partsForSpawn(config, floor);
  let deck = partsDeck;
  const modules: PartId[] = [];
  const spares: PartId[] = [];
  let cockpitId: PartId | null = null;

  if (statBlock.fixedPartIds?.length) {
    // Scripted ships (bosses) don't touch the Parts deck.
    for (const id of statBlock.fixedPartIds) {
      const part = partOf(content, id);
      if (!part) continue;
      if (part.role === 'COCKPIT' && !cockpitId) cockpitId = id;
      else modules.push(id);
    }
  } else {
    let delimited = false;
    // Extra draws past the delimiting cockpit, one per player beyond the first.
    let extra = config.partsPerExtraPlayer * Math.max(0, config.playerCount - 1);
    let guard = 200;

    while (guard-- > 0) {
      const step = draw(deck, 1, rng);
      deck = step.deck;
      const id = step.drawn[0];
      if (!id) break;
      const part = partOf(content, id);
      if (!part) continue;

      if (part.role === 'COCKPIT') {
        if (!cockpitId) {
          cockpitId = id;
          continue;
        }
        if (modules.length >= target) {
          // The delimiter: this cockpit anchors the next ship, so it goes back.
          spares.push(id);
          delimited = true;
          if (extra <= 0) break;
          continue;
        }
        spares.push(id);
        continue;
      }

      modules.push(id);
      if (delimited) {
        extra -= 1;
        if (extra <= 0) break;
      }
    }
  }

  const anchor = cockpitId ?? firstCockpitIn(content) ?? modules[0] ?? '';
  let ship = createShip(content, anchor, statBlock.name);

  for (const id of modules) {
    // Enemy hulls grow out from the cockpit like a player's does, so their
    // grids can chain too — an enemy is just a ship.
    const free = bestAttachSlot(ship);
    if (free < 0 || !hasFreeCapacity(content, ship)) {
      spares.push(id); // cockpit's slots are spoken for — back in the deck
      continue;
    }
    // Enemy ships arrive with their pools charged; an empty enemy can't act.
    ship = fitPart(content, ship, free, id, partOf(content, id)?.energyCapacity ?? 0);
  }

  const enemy: EnemyInstance = {
    instanceId,
    statBlockId: statBlock.id,
    name: statBlock.name,
    ship,
    convThreshold: effectiveThreshold(config, statBlock.id, statBlock.convThreshold),
    damageThisDownSet: 0,
    downsUsed: 0,
    downCount: statBlock.downCount ?? config.downCount,
    isBoss: !!statBlock.isBoss,
    drawnPartIds: statBlock.fixedPartIds?.length ? [] : [anchor, ...modules],
  };

  return { enemy, partsDeck: discard(deck, spares) };
}

function firstCockpitIn(content: Content): PartId | null {
  const found = Object.values(content.parts).find((p) => p.role === 'COCKPIT');
  return found?.id ?? null;
}
