import type { RerouteMove } from '../types/combat';
import type { Ship } from '../types/ship';
import type { SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import { maxEnergyOf, touching } from './module';

/**
 * Rerouting: one down moves ⚡ between connected modules.
 *
 * As much as the seat likes, out of as many modules as it likes, with two
 * limits. Every token moves one module at most per reroute — ⚡ that arrived
 * this reroute stays where it landed — and no module may ever go over its max,
 * not even for a moment, so the order the legs are played in matters.
 */

export interface RerouteRun {
  /** The ship with every leg played up to the first one that's refused. */
  ship: Ship;
  /** Why the plan can't be played, or null when it can. */
  error: string | null;
  /** ⚡ each slot started the reroute with that it can still send. */
  sendable: number[];
}

const nameOf = (content: Content, ship: Ship, slot: SlotIndex): string =>
  partOf(content, ship.slots[slot]?.partId)?.name ?? 'module';

/** Play a reroute's legs in order, stopping at the first one that breaks a rule. */
export function runReroute(content: Content, ship: Ship, moves: RerouteMove[]): RerouteRun {
  const sendable = ship.slots.map((s) => (s.destroyed ? 0 : s.energy));
  let cur = ship;
  const refuse = (error: string): RerouteRun => ({ ship: cur, error, sendable });

  for (const move of moves) {
    const from = cur.slots[move.from];
    const to = cur.slots[move.to];
    if (!from || !to) return refuse('pick two modules');
    if (move.from === move.to) return refuse('pick two different modules');
    if (from.destroyed || to.destroyed) return refuse('a destroyed module can’t hold ⚡');
    const a = nameOf(content, cur, move.from);
    const b = nameOf(content, cur, move.to);
    if (!touching(from, to)) return refuse(`${a} and ${b} aren’t connected — ⚡ only moves between modules that touch`);
    if (!Number.isInteger(move.amount) || move.amount < 1) return refuse('move at least 1⚡');
    const left = sendable[move.from] ?? 0;
    if (move.amount > left) {
      return refuse(
        left <= 0
          ? `${a} has no ⚡ of its own left to move — ⚡ moves one module per reroute`
          : `only ${left}⚡ on ${a} can move this reroute`,
      );
    }
    const max = maxEnergyOf(content, to);
    if (to.energy + move.amount > max) return refuse(`${b} would overload — ${to.energy + move.amount}/${max}⚡`);

    const slots = cur.slots.slice();
    slots[move.from] = { ...from, energy: from.energy - move.amount };
    slots[move.to] = { ...to, energy: to.energy + move.amount };
    cur = { ...cur, slots };
    sendable[move.from] = left - move.amount;
  }
  return { ship: cur, error: moves.length === 0 ? 'nothing to move' : null, sendable };
}

/** Why a reroute can't be played, or null when it can. */
export const rerouteError = (content: Content, ship: Ship, moves: RerouteMove[]): string | null =>
  runReroute(content, ship, moves).error;

/**
 * Add one leg to a plan, folding it into the last leg when that one runs the
 * same way — so dragging three tokens across reads as one move of 3.
 */
export function addRerouteLeg(moves: RerouteMove[], leg: RerouteMove): RerouteMove[] {
  const last = moves[moves.length - 1];
  if (last && last.from === leg.from && last.to === leg.to) {
    return [...moves.slice(0, -1), { ...last, amount: last.amount + leg.amount }];
  }
  return [...moves, leg];
}
