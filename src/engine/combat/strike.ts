import type { Battle, SideRef } from '../types/combat';
import type { Card, CardEffect } from '../types/card';
import type { Ship } from '../types/ship';
import type { PlayerId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Rng } from '../rng';
import { effectParam } from '../cards';
import { chargeSlot, cockpitIndex, defaultTargetSlot, hitSlot, rollDice, setEnergy } from '../ship';
import type { HitReport } from '../ship';
import { shipOf, sideName, opposingShip, emit, withShip, emitDice } from './sides';

// ---------------------------------------------------------------- resolution

/** A module as the log names it — "cockpit (…)" for the cockpit. */
export function moduleName(content: Content, ship: Ship, slot: SlotIndex): string {
  const name = partOf(content, ship.slots[slot]?.partId)?.name ?? 'module';
  return slot === cockpitIndex(ship) ? `cockpit (${name})` : name;
}

/** One line for a hit: what it took off which module. */
function describeHit(content: Content, before: Ship, report: HitReport, slot: SlotIndex): string {
  const part = partOf(content, before.slots[slot]?.partId);
  const name = moduleName(content, before, slot);
  if (report.negated) return `${name}: negated`;
  if (report.destroyed) return `${name} destroyed${report.firstDown ? ' — 1ST DOWN' : ''}`;
  const now = report.ship.slots[slot]?.energy ?? 0;
  return `${name} −${report.lost}⚡ (${now}/${part?.energyCapacity ?? 0})`;
}

/** Record what a hit did, for the table. */
function emitHit(battle: Battle, side: SideRef, slot: SlotIndex, report: HitReport, name: string): Battle {
  let next = battle;
  for (const soft of report.softened) {
    next = emit(next, { kind: 'drain', target: { side, slot: soft.slot }, amount: soft.amount });
  }
  return emit(next, {
    kind: 'hit',
    target: { side, slot },
    name,
    lost: report.lost,
    destroyed: report.destroyed,
    firstDown: report.firstDown,
    negated: report.negated,
  });
}

/**
 * Land a hit of `strength` on one module of the far ship, and take any
 * retaliation back. Returns whether a 1st-down module went down.
 */
export function strike(
  content: Content,
  battle: Battle,
  attacker: SideRef,
  target: SideRef,
  slot: SlotIndex,
  strength: number,
): { battle: Battle; firstDown: boolean; line: string; notes: string[] } {
  const ship = shipOf(battle, target);
  if (!ship) return { battle, firstDown: false, line: 'no target', notes: [] };
  const retaliate = ship.flags.retaliate;
  const report = hitSlot(content, ship, slot, strength);
  let next = emitHit(withShip(battle, target, report.ship), target, slot, report, moduleName(content, ship, slot));
  const notes = report.notes.filter((n) => !n.endsWith('destroyed'));

  // Mines: the next enemy to land a hit takes one straight back, on whatever
  // stands in front of its own cockpit.
  if (retaliate > 0 && !report.negated) {
    const victim = shipOf(next, attacker);
    const after = shipOf(next, target)!;
    next = withShip(next, target, { ...after, flags: { ...after.flags, retaliate: 0 } });
    if (victim) {
      const at = defaultTargetSlot(content, victim);
      const back = hitSlot(content, victim, at, retaliate);
      next = emitHit(withShip(next, attacker, back.ship), attacker, at, back, moduleName(content, victim, at));
      notes.push(`retaliation: ${retaliate}⚔ back — ${describeHit(content, victim, back, at)}`);
    }
  }

  return { battle: next, firstDown: report.firstDown, line: describeHit(content, ship, report, slot), notes };
}

/** What one active ability does, off a module or a card in hand. */
export function resolveAbility(
  content: Content,
  battle: Battle,
  effect: CardEffect,
  ctx: {
    side: SideRef;
    name: string;
    card: Card;
    targetSlot: SlotIndex | undefined;
    target: PlayerId | undefined;
    manualDamage: number;
    rng: Rng;
  },
): { battle: Battle; firstDown: boolean; lines: string[]; attacked: boolean } {
  const lines: string[] = [];
  let next = battle;
  let firstDown = false;
  let attacked = false;
  const far = opposingShip(next, ctx.side, ctx.target);
  const aim = far ? (ctx.targetSlot ?? defaultTargetSlot(content, far.ship)) : -1;

  const own = shipOf(next, ctx.side);
  const flags = (patch: Partial<Ship['flags']>) => {
    const ship = shipOf(next, ctx.side);
    if (ship) next = withShip(next, ctx.side, { ...ship, flags: { ...ship.flags, ...patch } });
  };

  switch (effect.type) {
    case 'damage':
    case 'damage-module': {
      if (!far) break;
      const roll = rollDice(effect.dice, ctx.rng);
      const strength = Math.max(0, effectParam(effect, 'power') + roll.bonus);
      if (effect.dice) next = emitDice(next, ctx.side, `${ctx.card.name} — its own dice`, effect.dice, roll, `${strength}⚔`);
      const hit = strike(content, next, ctx.side, far.side, aim, strength);
      next = hit.battle;
      firstDown ||= hit.firstDown;
      attacked = true;
      lines.push(`${ctx.name} plays ${ctx.card.name}: a ${strength}⚔ hit — ${hit.line}.`, ...hit.notes.map((n) => `  ${n}`));
      break;
    }

    case 'emp': {
      if (!far) break;
      const target = moduleName(content, far.ship, aim);
      const had = far.ship.slots[aim]?.energy ?? 0;
      next = withShip(next, far.side, setEnergy(far.ship, aim, 0));
      next = emit(next, { kind: 'drain', target: { side: far.side, slot: aim }, amount: had });
      attacked = true;
      lines.push(`${ctx.name} fires ${ctx.card.name}: ${sideName(next, far.side)}’s ${target} drained to 0⚡ — not destroyed.`);
      break;
    }

    case 'restore-shield': {
      if (!own) break;
      const cockpit = cockpitIndex(own);
      const charged = chargeSlot(content, own, cockpit, effectParam(effect, 'amount'));
      next = withShip(next, ctx.side, charged.ship);
      if (charged.added > 0) next = emit(next, { kind: 'charge', target: { side: ctx.side, slot: cockpit }, amount: charged.added });
      lines.push(`${ctx.name} recharges the cockpit with ${ctx.card.name}: +${charged.added}⚡.`);
      break;
    }

    case 'negate-next-attack':
      flags({ negateNext: (own?.flags.negateNext ?? 0) + 1 });
      lines.push(`${ctx.name} primes ${ctx.card.name} — the next hit on the ship is negated.`);
      break;

    case 'retaliate': {
      const amount = effectParam(effect, 'amount');
      flags({ retaliate: (own?.flags.retaliate ?? 0) + amount });
      lines.push(`${ctx.name} arms ${ctx.card.name} — the next enemy to hit takes ${amount}⚔ back.`);
      break;
    }

    case 'manual': {
      if (ctx.manualDamage > 0 && far) {
        const hit = strike(content, next, ctx.side, far.side, aim, ctx.manualDamage);
        next = hit.battle;
        firstDown ||= hit.firstDown;
        attacked = true;
        lines.push(`${ctx.name} resolves ${ctx.card.name} by hand: a ${ctx.manualDamage}⚔ hit — ${hit.line}.`);
        break;
      }
      lines.push(`${ctx.name} uses ${ctx.card.name} — resolve its text at the table.`);
      break;
    }

    default:
      break;
  }
  return { battle: next, firstDown, lines, attacked };
}
