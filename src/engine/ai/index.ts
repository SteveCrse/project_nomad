import type { Battle, DownAction, EnergyTransfer, SideRef } from '../types/combat';
import type { GameConfig } from '../types/config';
import type { DiceSpec, PartCard } from '../types/card';
import type { Ship } from '../types/ship';
import type { Content } from '../content';
import type { Rng } from '../rng';
import {
  actionError,
  defaultTarget,
  downsFor,
  shipOf,
} from '../combat';
import {
  areAdjacent,
  capacityOf,
  cockpitCapacity,
  cockpitCharge,
  cockpitPower,
  isAbsorber,
  liveModules,
} from '../ship';
import { activeEffects, attackOf, cardCost, costPerDie, effectParam } from '../cards';
import { isDamageEffect } from '../effects';

/** Does this module put ⚔️ on something when it fires? */
const shoots = (part: PartCard): boolean =>
  activeEffects(part).some((e) => isDamageEffect(e.type));

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

  const target = defaultTarget(content, battle, side);
  const legal = (action: DownAction): boolean =>
    actionError(content, battle, config, side, action) === null;

  // 1. Attack with the highest expected damage that is actually legal. The
  //    cockpit's basic shot is in the running like anything else — it costs no
  //    ⚡, so it wins by default once the guns run dry.
  const guns = liveModules(content, ship)
    .filter((m) => shoots(m.part))
    .map((m) => {
      // Dice are bought per effect now, so what the pool can afford is read off
      // the card's total per-die price rather than one printed cost.
      const perDie = costPerDie(m.part);
      const dice = perDie > 0 ? maxAffordableDice(m.slot.energy, perDie) : 1;
      const action: DownAction = {
        type: 'activate-module',
        slot: m.slot.index,
        ...(target ? { target } : {}),
        ...(perDie > 0 ? { diceCount: dice } : {}),
      };
      const expected = expectedDamage(m.part, dice);
      return { action, expected };
    });

  const shots = [
    ...guns,
    {
      action: { type: 'cockpit-attack', ...(target ? { target } : {}) } as DownAction,
      expected: cockpitPower(content, ship),
    },
  ]
    .filter((g) => legal(g.action))
    .sort((a, b) => b.expected - a.expected);

  if (shots.length > 0 && shots[0]!.expected > 0) return shots[0]!.action;

  // 2. Nothing to shoot with — prime defensive tech (turrets, mines).
  const utility = liveModules(content, ship)
    .filter((m) =>
      activeEffects(m.part).some(
        (e) =>
          e.type === 'negate-next-attack' ||
          e.type === 'retaliate' ||
          e.type === 'gain-energy' ||
          e.type === 'restore-shield',
      ),
    )
    .map((m): DownAction => ({ type: 'activate-module', slot: m.slot.index }))
    .filter(legal);
  if (utility.length > 0) return rng.pick(utility);

  // 3. Patch the cockpit shield — the last thing standing between this ship
  //    and a wreck, and the generator that fills it costs nothing but a down.
  if (cockpitCharge(content, ship) < cockpitCapacity(content, ship)) {
    const action: DownAction = { type: 'cockpit-generate' };
    if (legal(action)) return action;
  }

  // 4. Pour spare charge into a shield module that has room.
  const shield = liveModules(content, ship).find(
    (m) => isAbsorber(m.part) && capacityOf(content, m.slot) > m.slot.energy,
  );
  if (shield) {
    const action: DownAction = { type: 'charge-shield', slot: shield.slot.index, amount: 1 };
    if (legal(action)) return action;
  }

  // 5. Reload: one down hands charge along the grid into the dry guns.
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
    .filter((m) => shoots(m.part) && m.slot.energy < cardCost(m.part))
    .sort((a, b) => attackOf(b.part) - attackOf(a.part));

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
  return activeEffects(part)
    .filter((e) => isDamageEffect(e.type))
    .reduce((sum, e) => sum + effectParam(e, 'power') + expectedRoll(e.dice, diceCount), 0);
}

/** What an effect's dice are worth on average, on top of its printed number. */
function expectedRoll(dice: DiceSpec | undefined, requested: number): number {
  if (!dice) return 0;
  const count = dice.count === 'variable' ? Math.max(1, requested) : dice.count;
  const sides = Number(dice.die.slice(1));
  const { hitUnder, hitOver, perHit } = dice;
  if (hitUnder === undefined && hitOver === undefined) return count * ((sides + 1) / 2);
  const chance =
    (hitUnder !== undefined ? hitUnder / sides : 0) +
    (hitOver !== undefined ? (sides - hitOver + 1) / sides : 0);
  return count * chance * (perHit ?? 1);
}
