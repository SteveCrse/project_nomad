import type { Battle, DownAction, RerouteMove } from '../types/combat';
import type { ActionCard, PartCard } from '../types/card';
import type { GameConfig } from '../types/config';
import type { Ship } from '../types/ship';
import type { Content } from '../content';
import { attackOf, costOf, expectedDamage, outputOf, powerCostOf } from '../cards';
import { isDamageEffect } from '../effects';
import { actionError, aggroTarget, enemySide, playerOf } from '../combat';
import type { Fitted } from '../ship';
import {
  addRerouteLeg,
  cockpitIndex,
  connected,
  defaultTargetSlot,
  isOnline,
  isProducer,
  liveSlots,
  roomIn,
  runReroute,
} from '../ship';

/**
 * The enemy's choices.
 *
 * An action card names *what* the enemy does with a down — attack, generate
 * or reroute. Which module fires, where the energy comes from
 * and how much moves are made here, the same way every time, so a playtester
 * can read the enemy's next four downs off the face-up cards and predict them.
 *
 * Deliberately plain: the tool should lose to a sharp table, not out-think it.
 */
export function planEnemyAction(
  content: Content,
  battle: Battle,
  config: GameConfig,
  card: ActionCard,
): { action: DownAction } | { reason: string } {
  const ship = battle.combat.enemy.ship;
  const legal = (action: DownAction) =>
    actionError(content, battle, config, enemySide(battle.combat), action) === null;
  const target = aggroTarget(battle);
  const victim = playerOf(battle, target)?.ship;

  switch (card.action) {
    case 'attack': {
      if (!target || !victim) return { reason: 'nobody left to attack' };
      // The module most likely to hurt: attack × energy ÷ 6, the rules'
      // balancing line, read as a choice.
      const guns = liveSlots(content, ship)
        .filter((m) => isOnline(m.slot) && attackOf(m.part) > 0)
        .filter((m) => costOf(attackEffects(m.part)) <= m.slot.energy)
        .sort(
          (a, b) =>
            expectedDamage(attackOf(b.part), b.slot.energy) -
              expectedDamage(attackOf(a.part), a.slot.energy) ||
            attackOf(b.part) - attackOf(a.part),
        );
      if (guns.length === 0) return { reason: 'no energy to attack' };
      for (const gun of guns) {
        // The enemy always goes for the cockpit: a precision weapon has
        // nothing in its way, anything else hits what stands in front of it.
        const aim = gun.part.targetsModule ? cockpitIndex(victim) : defaultTargetSlot(content, victim);
        const action: DownAction = { type: 'attack', slot: gun.slot.index, target, targetSlot: aim };
        if (legal(action)) return { action };
      }
      return { reason: 'no gun can reach' };
    }

    case 'generate': {
      const producers = liveSlots(content, ship)
        .filter((m) => isProducer(m.part) && isOnline(m.slot) && roomIn(content, m.slot) > 0)
        .sort((a, b) => gain(content, b) - gain(content, a) || generatorFirst(a, b));
      const pick = producers[0];
      if (!pick) return { reason: 'every producer is offline or full' };
      return { action: { type: 'generate', slot: pick.slot.index } };
    }

    case 'reroute': {
      const moves = feedMoves(content, ship);
      if (moves.length === 0) return { reason: 'no spare ⚡ next to a weapon or shield with room' };
      return { action: { type: 'reroute', moves } };
    }
  }
}

/** The damage effects only — what an attack pays for. */
const attackEffects = (part: PartCard) =>
  (part.effects ?? []).filter((e) => isDamageEffect(e.type));

const gain = (content: Content, m: Fitted): number =>
  Math.min(outputOf(m.part), roomIn(content, m.slot));

const generatorFirst = (a: Fitted, b: Fitted): number =>
  Number(a.part.role === 'COCKPIT') - Number(b.part.role === 'COCKPIT');

/**
 * The enemy's reroute: charge out of generators — the cockpit only when no
 * generator can spare any — into the weapons they touch, hardest-hitting
 * first, then into the shields they touch. A source always keeps 1⚡: draining
 * it to 0 would knock it offline and leave it one hit from destroyed. Every
 * leg is checked against the reroute rules as it's added, so the plan is one
 * the engine will play.
 */
function feedMoves(content: Content, ship: Ship): RerouteMove[] {
  const live = liveSlots(content, ship);
  const targets = [
    ...live
      .filter((m) => m.part.role === 'WPN' && attackOf(m.part) > 0)
      .sort((a, b) => attackOf(b.part) - attackOf(a.part) || a.slot.energy - b.slot.energy),
    ...live.filter((m) => m.part.role === 'SHD'),
  ];
  const sources = live
    .filter((m) => m.part.role === 'GEN' || m.part.role === 'COCKPIT')
    .sort((a, b) => generatorFirst(a, b) || b.slot.energy - a.slot.energy);

  let moves: RerouteMove[] = [];
  for (const to of targets) {
    for (const from of sources) {
      if (!connected(ship, from.slot.index, to.slot.index)) continue;
      const run = runReroute(content, ship, moves);
      const now = run.ship.slots;
      const spare = Math.min(run.sendable[from.slot.index] ?? 0, (now[from.slot.index]?.energy ?? 0) - 1);
      const room = roomIn(content, now[to.slot.index]);
      const amount = Math.min(spare, room);
      if (amount < 1) continue;
      moves = addRerouteLeg(moves, { from: from.slot.index, to: to.slot.index, amount });
    }
  }
  return moves;
}

// ------------------------------------------------------------------ draft

/**
 * What a seat would take off the draft table when nobody is choosing for it —
 * the tool's "draft the rest" button. A cockpit with the most room; then the
 * first missing piece of a working ship (a weapon, a generator, a shield),
 * cheapest first; and once it has those, it passes — every token it doesn't
 * spend goes on the ship as starting ⚡.
 */
export function autoDraftPick(
  table: PartCard[],
  owned: PartCard[],
  affordable: (part: PartCard) => boolean,
  room: (part: PartCard) => number,
): PartCard | null {
  const options = table.filter(affordable);
  if (options.length === 0) return null;
  if (options.every((p) => p.role === 'COCKPIT')) {
    return options.slice().sort((a, b) => room(b) - room(a) || b.rarity - a.rarity)[0] ?? null;
  }
  const has = (role: PartCard['role']) => owned.some((p) => p.role === role);
  for (const role of ['WPN', 'GEN', 'SHD'] as const) {
    if (has(role)) continue;
    const pick = options
      .filter((p) => p.role === role)
      .sort(
        (a, b) =>
          // A "weapon" with no attack (Mines) doesn't make a ship that can shoot.
          Number(attackOf(b) > 0) - Number(attackOf(a) > 0) ||
          powerCostOf(a) - powerCostOf(b) ||
          b.rarity - a.rarity ||
          attackOf(b) + outputOf(b) - (attackOf(a) + outputOf(a)),
      )[0];
    if (pick) return pick;
  }
  return null;
}
