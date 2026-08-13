import type { Battle, DownAction, EnergyTransfer, SideRef } from '../types/combat';
import type { GameConfig } from '../types/config';
import type { PartCard } from '../types/card';
import type { Ship } from '../types/ship';
import type { Content } from '../content';
import type { Rng } from '../rng';
import {
  actionError,
  defaultTarget,
  downsFor,
  shipOf,
} from '../combat';
import { areAdjacent, capacityOf, diceCountOf, effectOf, isAbsorber, liveModules } from '../ship';

/**
 * Enemy decision-making — enough for one side of the table to play itself so
 * a round can be playtested solo.
 *
 * Deliberately greedy and legible: shoot with the biggest legal gun, and when
 * nothing can shoot, spend the down on defence or a top-up. A playtester
 * needs to be able to explain every enemy down after the fact.
 */
export function chooseEnemyAction(
  content: Content,
  battle: Battle,
  config: GameConfig,
  side: SideRef,
  rng: Rng,
): DownAction {
  const ship = shipOf(battle, side);
  const downs = downsFor(battle.combat, side);
  if (!ship || !downs) return { type: 'pass' };

  const target = defaultTarget(battle, side);
  const legal = (action: DownAction): boolean =>
    actionError(content, battle, config, side, action) === null;

  // 1. Attack with the highest expected damage that is actually legal.
  const guns = liveModules(content, ship)
    .filter((m) => effectOf(m.part).kind === 'damage')
    .map((m) => {
      const dice = diceCountOf(m.part, maxAffordableDice(m.slot.energy, m.part.energyCost ?? 1));
      const action: DownAction = {
        type: 'activate-module',
        slot: m.slot.index,
        ...(target ? { target } : {}),
        ...(m.part.dice?.count === 'variable' ? { diceCount: dice } : {}),
      };
      const expected = expectedDamage(m.part, dice);
      return { action, expected };
    })
    .filter((g) => legal(g.action))
    .sort((a, b) => b.expected - a.expected);

  if (guns.length > 0 && guns[0]!.expected > 0) return guns[0]!.action;

  // 2. Nothing to shoot with — prime defensive tech (turrets, mines).
  const utility = liveModules(content, ship)
    .filter((m) => {
      const kind = effectOf(m.part).kind;
      return kind === 'negate-next-attack' || kind === 'retaliate' || kind === 'gain-energy';
    })
    .map((m): DownAction => ({ type: 'activate-module', slot: m.slot.index }))
    .filter(legal);
  if (utility.length > 0) return rng.pick(utility);

  // 3. Pour spare charge into a shield that has room.
  const shield = liveModules(content, ship).find(
    (m) => isAbsorber(m.part) && capacityOf(content, m.slot) > m.slot.energy,
  );
  if (shield) {
    const action: DownAction = { type: 'charge-shield', slot: shield.slot.index, amount: 1 };
    if (legal(action)) return action;
  }

  // 4. Reload: one down hands charge along the grid into the dry guns.
  const transfers = planReroute(content, ship);
  if (transfers.length > 0) {
    const action: DownAction = { type: 'reroute-energy', transfers };
    if (legal(action)) return action;
  }

  return { type: 'pass' };
}

/**
 * Plan a reroute pass: for each gun that can't pay for a shot, pull from the
 * fullest charged neighbour that hasn't been drained yet.
 *
 * One hop only. A player can chain a generator through a redistributor into a
 * gun in a single down; the enemy doesn't bother, and that gap is deliberate —
 * the tool should lose to a sharp table, not out-optimise it.
 */
function planReroute(content: Content, ship: Ship): EnergyTransfer[] {
  const modules = liveModules(content, ship);
  const dryGuns = modules
    .filter((m) => effectOf(m.part).kind === 'damage' && m.slot.energy < (m.part.energyCost ?? 0))
    .sort((a, b) => (b.part.power ?? 0) - (a.part.power ?? 0));

  const drained = new Set<number>();
  const transfers: EnergyTransfer[] = [];

  for (const gun of dryGuns) {
    if (capacityOf(content, gun.slot) - gun.slot.energy <= 0) continue;
    const source = modules
      .filter((m) => m.slot.energy > 0 && !drained.has(m.slot.index))
      .filter((m) => m.part.role !== 'WPN')
      .filter((m) => areAdjacent(ship, m.slot.index, gun.slot.index))
      .sort((a, b) => b.slot.energy - a.slot.energy)[0];
    if (!source) continue;
    drained.add(source.slot.index);
    transfers.push({ from: source.slot.index, to: gun.slot.index, amount: source.slot.energy });
  }
  return transfers;
}

function maxAffordableDice(energy: number, perDie: number): number {
  if (perDie <= 0) return 1;
  return Math.max(1, Math.floor(energy / perDie));
}

/** Rough expected value, only ever compared against other modules' guesses. */
function expectedDamage(part: PartCard, diceCount: number): number {
  const base = part.power ?? 0;
  if (!part.dice) return base;
  const sides = Number(part.dice.die.slice(1));
  const { hitUnder, hitOver, perHit } = part.dice;
  if (hitUnder === undefined && hitOver === undefined) return base + diceCount * ((sides + 1) / 2);
  const chance =
    (hitUnder !== undefined ? hitUnder / sides : 0) +
    (hitOver !== undefined ? (sides - hitOver + 1) / sides : 0);
  return base + diceCount * chance * (perHit ?? 1);
}
