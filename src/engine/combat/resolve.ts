import type { Battle, CombatState, DownAction, DownResult, SideRef, SlotRef } from '../types/combat';
import type { GameConfig } from '../types/config';
import type { SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Rng } from '../rng';
import { HIT_DIE, abilityEffects, activeEffects, attackOf, costOf, effectParam, outputOf } from '../cards';
import { chargeSlot, cockpitIndex, defaultTargetSlot, hasFreeReroute, restoreCockpit, rollDice, runReroute, setEnergy } from '../ship';
import { playerSide, enemySide, playerOf, shipOf, sideName, opposingShip, logged, emit, withShip, withPlayer, emitDice } from './sides';
import { damageEffects, actionError } from './legality';
import { moduleName, strike, resolveAbility } from './strike';

/**
 * Resolve a single down for either side. The turn bookkeeping — counting the
 * down, ending the turn — is the caller's (`playerDown`, `enemyDown`): this
 * only applies the action and reports what it did.
 */
export function resolveDown(
  content: Content,
  battle: Battle,
  config: GameConfig,
  side: SideRef,
  action: DownAction,
  rng: Rng,
): { battle: Battle; result: DownResult } {
  const illegal = actionError(content, battle, config, side, action);
  if (illegal) {
    return { battle, result: { action, spent: false, firstDown: false, illegal, log: [illegal] } };
  }

  let next = battle;
  const lines: string[] = [];
  let firstDown = false;
  let free = false;
  let attacked = false;
  const name = sideName(battle, side);
  const ship = shipOf(battle, side)!;
  const at = (slot: SlotIndex): SlotRef => ({ side, slot });

  switch (action.type) {
    case 'pass':
      lines.push(`${name} holds the down.`);
      break;

    /**
     * The attack roll. A d6 against the energy on the module firing: at or
     * under it hits. 1⚡ lands 1 time in 6, 3⚡ half the time, 6⚡ always.
     */
    case 'attack': {
      const slot = ship.slots[action.slot]!;
      const part = partOf(content, slot.partId)!;
      const effects = damageEffects(part);
      const cost = costOf(effects);
      let shooter = cost > 0 ? setEnergy(ship, action.slot, slot.energy - cost) : ship;
      const placed = shooter.slots[action.slot]!.energy;
      const roll = rng.roll('d6');
      const hits = roll <= placed;
      if (config.attackSpendsEnergy) shooter = setEnergy(shooter, action.slot, 0);
      next = withShip(next, side, shooter);
      const spentNow = slot.energy - shooter.slots[action.slot]!.energy;
      if (spentNow > 0) next = emit(next, { kind: 'drain', target: at(action.slot), amount: spentNow });
      attacked = true;

      const far = opposingShip(next, side, action.target)!;
      const precise = !!part.targetsModule;
      const aim = action.targetSlot ?? (side.kind === 'enemy' && precise
        ? cockpitIndex(far.ship)
        : defaultTargetSlot(content, far.ship));
      const aimed = moduleName(content, far.ship, aim);
      const odds = `${Math.min(placed, HIT_DIE)}/${HIT_DIE}`;
      const spent = config.attackSpendsEnergy && placed > 0 ? ` · ${placed}⚡ spent` : '';
      next = emit(next, {
        kind: 'roll',
        side,
        label: `${part.name} → ${sideName(next, far.side)}’s ${aimed}`,
        die: 'd6',
        dice: [roll],
        rule: `≤ ${placed}`,
        success: hits,
        outcome: hits ? 'HIT' : 'No hit',
        from: at(action.slot),
        to: { side: far.side, slot: aim },
      });

      if (!hits) {
        lines.push(
          `${name} fires ${part.name} at ${sideName(next, far.side)}’s ${aimed} — rolled ${roll} vs ${placed}⚡ (${odds}): miss${spent}.`,
        );
        break;
      }
      // Dice on the card add to the payload; the attack roll already decided
      // whether it lands.
      let bonus = 0;
      for (const effect of effects) {
        if (!effect.dice) continue;
        const extra = rollDice(effect.dice, rng);
        bonus += extra.bonus;
        next = emitDice(next, side, `${part.name} — its own dice`, effect.dice, extra, `+${extra.bonus}⚔`);
      }
      const strength = attackOf(part) + bonus;
      const hit = strike(content, next, side, far.side, aim, strength);
      next = hit.battle;
      firstDown = hit.firstDown;
      lines.push(
        `${name} fires ${part.name} at ${sideName(next, far.side)}’s ${aimed} — rolled ${roll} vs ${placed}⚡ (${odds}): ` +
          `HIT for ${strength}⚔ — ${hit.line}${spent}.`,
        ...hit.notes.map((n) => `  ${n}`),
      );
      break;
    }

    /** A generate action: the producer's output lands on the producer. */
    case 'generate': {
      const part = partOf(content, ship.slots[action.slot]!.partId)!;
      const effect = activeEffects(part).find((e) => e.type === 'generate');
      const roll = rollDice(effect?.dice, rng);
      const won = !roll.hitRule || roll.hits > 0;
      const rolled = roll.dice.length > 0 ? ` [${roll.dice.join(',')}]` : '';
      const loss = effect ? effectParam(effect, 'loseOnMiss') : 0;
      const amount = outputOf(part) + (roll.hitRule ? 0 : roll.bonus);
      if (effect?.dice) {
        next = emitDice(next, side, `${part.name} — generate`, effect.dice, roll, won ? `+${amount}⚡` : `the gamble misses — −${loss}⚡`);
      }
      if (won) {
        const charged = chargeSlot(content, ship, action.slot, amount);
        next = withShip(next, side, charged.ship);
        next = emit(next, { kind: 'charge', target: at(action.slot), amount: charged.added });
        lines.push(
          `${name} runs ${part.name}${rolled}: +${charged.added}⚡ ` +
            `(${charged.ship.slots[action.slot]!.energy}/${part.energyCapacity}).`,
        );
      } else {
        const had = ship.slots[action.slot]!.energy;
        const left = Math.max(0, had - loss);
        next = withShip(next, side, setEnergy(ship, action.slot, left));
        if (had - left > 0) next = emit(next, { kind: 'drain', target: at(action.slot), amount: had - left });
        lines.push(`${name} runs ${part.name}${rolled}: the gamble misses — −${loss}⚡.`);
      }
      break;
    }

    /** One down moves charge between connected modules, every token one step. */
    case 'reroute': {
      const run = runReroute(content, ship, action.moves);
      next = withShip(next, side, run.ship);
      next = emit(next, { kind: 'reroute', side, moves: action.moves });
      free = hasFreeReroute(content, ship);
      const legs = action.moves.map((m) => {
        const dest = partOf(content, ship.slots[m.to]?.partId);
        return `${m.amount}⚡ ${moduleName(content, ship, m.from)} → ${moduleName(content, ship, m.to)}${dest?.role === 'SHD' ? ' (charging it)' : ''}`;
      });
      lines.push(`${name} reroutes ${legs.join(', ')}${free ? ' — free, a redistributor handles it' : ''}.`);
      break;
    }

    /** Use another module: everything active it prints except attack and generate. */
    case 'use-module': {
      const slot = ship.slots[action.slot]!;
      const part = partOf(content, slot.partId)!;
      const abilities = abilityEffects(part);
      const cost = costOf(abilities);
      if (cost > 0) {
        next = withShip(next, side, setEnergy(ship, action.slot, slot.energy - cost));
        next = emit(next, { kind: 'drain', target: at(action.slot), amount: cost });
      }
      for (const effect of abilities) {
        const out = resolveAbility(content, next, effect, {
          side,
          name,
          card: part,
          targetSlot: action.targetSlot,
          target: action.target,
          manualDamage: action.manualDamage ?? 0,
          rng,
        });
        next = out.battle;
        firstDown ||= out.firstDown;
        attacked ||= out.attacked;
        lines.push(...out.lines);
      }
      break;
    }

    /** An item off the hand: single use, and its attacks land without a roll. */
    case 'play-card': {
      const player = playerOf(next, side.id)!;
      const card = content.cards[action.cardId]!;
      const hand = player.hand.slice();
      hand.splice(hand.indexOf(action.cardId), 1);
      next = withPlayer(next, player.id, { hand });
      for (const effect of activeEffects(card)) {
        const out = resolveAbility(content, next, effect, {
          side,
          name,
          card,
          targetSlot: action.targetSlot,
          target: undefined,
          manualDamage: action.manualDamage ?? 0,
          rng,
        });
        next = out.battle;
        firstDown ||= out.firstDown;
        attacked ||= out.attacked;
        lines.push(...out.lines);
      }
      if (lines.length === 0) lines.push(`${name} plays ${card.name}.`);
      break;
    }

    /** Downed-player rule `revive`: the cockpit comes back with 1⚡. */
    case 'revive': {
      const target = playerOf(next, action.playerId)!;
      const ship = restoreCockpit(content, target.ship, 1);
      next = withPlayer(next, target.id, { ship, destroyed: false });
      next = emit(next, { kind: 'charge', target: { side: playerSide(target.id), slot: cockpitIndex(ship) }, amount: 1 });
      lines.push(`${name} spends a down reviving ${target.label} — cockpit back online with 1⚡.`);
      break;
    }
  }

  // The aggressor is whoever attacked last, hit or miss.
  let combat = next.combat;
  if (attacked && side.kind === 'player') combat = { ...combat, aggressor: side.id };
  if (firstDown) combat = { ...combat, firstDowns: combat.firstDowns + 1 };
  for (const line of lines) combat = logged(combat, side, line, firstDown ? 'convert' : attacked ? 'damage' : 'info');
  next = settle(next, combat);

  return {
    battle: next,
    result: { action, spent: !free, firstDown, log: lines },
  };
}

/** Decide whether the fight is over. */
function settle(battle: Battle, combat: CombatState): Battle {
  const next = { ...battle, combat };
  if (combat.outcome) return next;
  if (combat.enemy.ship.destroyed) {
    const won = { ...next, combat: logged({ ...combat, outcome: 'victory' as const }, enemySide(combat), `${combat.enemy.name} is destroyed.`, 'system') };
    return emit(won, { kind: 'outcome', outcome: 'victory', label: `${combat.enemy.name} destroyed` });
  }
  const alive = combat.participants.some((id) => !battle.party.players.find((p) => p.id === id)?.destroyed);
  if (!alive) return emit({ ...next, combat: { ...combat, outcome: 'defeat' } }, { kind: 'outcome', outcome: 'defeat', label: 'The fight is lost' });
  return next;
}
