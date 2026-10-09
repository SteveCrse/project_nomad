import type { Ship } from '../types/ship';
import type { ShipSizeRule } from '../types/config';
import type { PartCard } from '../types/card';
import type { PartId } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import { powerCostOf } from '../cards';
import { modulesOf } from './build';

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
