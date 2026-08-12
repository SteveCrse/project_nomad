import type { AdjacencyBonus, Ship, ShipSlot } from '../types/ship';
import type { EnemyInstance, EnemyStatBlock } from '../types/enemy';
import type { GameConfig } from '../types/config';
import { effectiveThreshold, partsForSpawn, scaledEnemyHp } from '../types/config';
import type { EnemyId, PartId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Deck } from '../deck';
import { discard, draw } from '../deck';
import type { Rng } from '../rng';
import { capacityOf, liveModules } from './module';

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

/** An empty grid sized by the cockpit's slot count. */
export function createShip(
  content: Content,
  cockpitId: PartId,
  name: string,
  config: GameConfig,
  hp = config.hullHp,
): Ship {
  const cockpit = partOf(content, cockpitId);
  const capacity = Math.max(1, cockpit?.slots ?? config.gridCols * config.gridRows);
  const slots = Array.from({ length: capacity }, (_, i) => emptySlot(i));

  // The cockpit occupies a slot like anything else. Middle of the top row so
  // modules can chain either side of it.
  const cols = Math.min(config.gridCols, capacity);
  const anchor = Math.min(capacity - 1, Math.floor(cols / 2));
  slots[anchor] = { ...slots[anchor]!, partId: cockpitId };

  return {
    id: `ship-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    cockpitId,
    gridCols: cols,
    slots,
    hp,
    hpMax: hp,
    flags: { negateNext: 0, retaliate: 0 },
  };
}

/** First free non-cockpit slot, or -1. */
export function firstFreeSlot(ship: Ship): SlotIndex {
  return ship.slots.findIndex((s) => s.partId === null);
}

export function equipPart(ship: Ship, slot: SlotIndex, partId: PartId): Ship {
  const target = ship.slots[slot];
  if (!target || target.partId === ship.cockpitId) return ship;
  const slots = ship.slots.slice();
  slots[slot] = { ...target, partId, energy: 0, disabled: false, usedThisDownSet: false };
  return { ...ship, slots };
}

export function detachPart(ship: Ship, slot: SlotIndex): { ship: Ship; partId: PartId | null } {
  const target = ship.slots[slot];
  if (!target || target.partId === null || target.index === cockpitSlotIndex(ship)) {
    return { ship, partId: null };
  }
  const slots = ship.slots.slice();
  slots[slot] = emptySlot(slot);
  return { ship: { ...ship, slots }, partId: target.partId };
}

export function cockpitSlotIndex(ship: Ship): SlotIndex {
  return ship.slots.findIndex((s) => s.partId === ship.cockpitId);
}

/** Move energy between module pools; a Redistributor may make this free. */
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
  if (!src || !dst || from === to || amount <= 0) return ship;

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
  const cols = ship.gridCols;
  const roleAt = (i: SlotIndex): string | null => {
    const slot = ship.slots[i];
    if (!slot || slot.disabled) return null;
    return partOf(content, slot.partId)?.role ?? null;
  };
  const neighbours = (i: SlotIndex): SlotIndex[] => {
    const out: SlotIndex[] = [];
    const col = i % cols;
    if (col > 0) out.push(i - 1);
    if (col < cols - 1) out.push(i + 1);
    out.push(i - cols, i + cols);
    return out.filter((n) => n >= 0 && n < ship.slots.length);
  };

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
 */
export function runUpkeep(
  content: Content,
  ship: Ship,
  baseline = 0,
): { ship: Ship; generated: number; overflow: number; drained: number } {
  let next = ship;
  let generated = 0;
  let overflow = 0;

  // Reactor output goes where it does the most good: the hungriest actives
  // first, then shields, then anything else with room.
  let pool = Math.max(0, baseline);
  if (pool > 0) {
    const priority = liveModules(content, next)
      .map((m) => ({
        ...m,
        rank:
          m.part.partType === 'active-module' ? 0 : m.part.role === 'SHD' ? 1 : 2,
        want: m.part.energyCost ?? 1,
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
      if (part.partType === 'cockpit' && !cockpitId) cockpitId = id;
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

      if (part.partType === 'cockpit') {
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

  const anchor = cockpitId ?? firstCockpitIn(content) ?? modules[0] ?? 'cockpit-mk3';
  const hpMax = scaledEnemyHp(config, statBlock.hpPool);
  let ship = createShip(content, anchor, statBlock.name, config, hpMax);

  for (const id of modules) {
    const free = firstFreeSlot(ship);
    if (free < 0) {
      spares.push(id); // over capacity — back in the deck
      continue;
    }
    ship = equipPart(ship, free, id);
    // Enemy ships arrive with their pools charged; an empty enemy can't act.
    const cap = partOf(content, id)?.energyCapacity ?? 0;
    ship = chargeSlot(content, ship, free, cap).ship;
  }

  const enemy: EnemyInstance = {
    instanceId,
    statBlockId: statBlock.id,
    name: statBlock.name,
    ship,
    hp: hpMax,
    hpMax,
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
  const found = Object.values(content.parts).find((p) => p.partType === 'cockpit');
  return found?.id ?? null;
}
