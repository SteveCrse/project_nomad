import type { Ship } from '../types/ship';
import type { BossSheet, EnemyInstance } from '../types/enemy';
import type { GameConfig, ShipSizeRule } from '../types/config';
import { enemyModuleCount } from '../types/config';
import type { ModuleRole } from '../types/card';
import type { EnemyId, PartId } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Deck } from '../deck';
import { draw, returnToDeck } from '../deck';
import type { Rng } from '../rng';
import { createShip, moduleCount, placeModule, firstCockpitIn } from './build';
import { bestCell } from './layout';
import { sizeUsed, sizeLimit, hasRoomFor } from './size';

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
