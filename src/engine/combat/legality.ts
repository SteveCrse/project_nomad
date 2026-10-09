import type { Battle, DownAction, SideRef } from '../types/combat';
import type { Card, CardEffect, PartCard } from '../types/card';
import type { GameConfig } from '../types/config';
import type { PlayerId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import { abilityEffects, activeEffects, attackOf, costOf, spendRange } from '../cards';
import { isDamageEffect } from '../effects';
import { canTarget, defaultTargetSlot, isProducer, rerouteError, roomIn } from '../ship';
import { sameSide, playerOf, shipOf, opposingShip } from './sides';

// ---------------------------------------------------------------- legality

export const damageEffects = (card: Card): CardEffect[] =>
  activeEffects(card).filter((e) => isDamageEffect(e.type));

/** Does a set of effects need an enemy module picked? */
const aimsAtEnemy = (effects: CardEffect[], manualDamage = 0): boolean =>
  effects.some(
    (e) => isDamageEffect(e.type) || e.type === 'emp' || (e.type === 'manual' && manualDamage > 0),
  );

/** Why an action can't be taken, or null when it can. */
export function actionError(
  content: Content,
  battle: Battle,
  config: GameConfig,
  side: SideRef,
  action: DownAction,
): string | null {
  const combat = battle.combat;
  if (combat.outcome) return 'combat is over';
  if (!sameSide(combat.turn, side)) return 'not this side’s turn';
  if (combat.turnOver) return 'the turn is over — end it';
  if (combat.down >= config.downCount) return 'no downs left this turn';

  const ship = shipOf(battle, side);
  if (!ship || ship.destroyed) return 'no ship';
  const player = side.kind === 'player' ? playerOf(battle, side.id) : undefined;

  /** The module in a slot of the acting ship, checked still standing. */
  const own = (slot: SlotIndex): { part: PartCard; error: string | null } | null => {
    const at = ship.slots[slot];
    const part = partOf(content, at?.partId);
    if (!at || !part) return null;
    if (at.destroyed) return { part, error: `${part.name} is destroyed` };
    return { part, error: null };
  };

  /** Is `targetSlot` a module this action can reach on the far side? */
  const aimError = (targetSlot: SlotIndex | undefined, precision: boolean, target?: PlayerId) => {
    const far = opposingShip(battle, side, target);
    if (!far) return 'nobody left to aim at';
    const at = targetSlot ?? defaultTargetSlot(content, far.ship);
    if (!far.ship.slots[at] || far.ship.slots[at]!.destroyed) return 'that module is already gone';
    if (!canTarget(content, far.ship, at, precision)) return 'a shield stands in front of it';
    return null;
  };

  switch (action.type) {
    case 'pass':
      return null;

    case 'attack': {
      const module = own(action.slot);
      if (!module) return 'empty slot';
      if (attackOf(module.part) <= 0) return `${module.part.name} has no attack`;
      if (module.error) return module.error;
      const { min, max } = spendRange(module.part, ship.slots[action.slot]!.energy);
      if (max < min) return `needs ${min}⚡ to fire`;
      const spend = action.spend ?? max;
      if (!Number.isInteger(spend) || spend < min) return `spend at least ${min}⚡`;
      if (spend > max) return `can spend at most ${max}⚡`;
      return aimError(action.targetSlot, !!module.part.targetsModule, action.target);
    }

    case 'generate': {
      const module = own(action.slot);
      if (!module) return 'empty slot';
      if (!isProducer(module.part)) return `${module.part.name} doesn’t generate`;
      // Producing ⚡ spends none, so a producer can generate even with no ⚡ on it.
      if (module.error) return module.error;
      if (roomIn(content, ship.slots[action.slot]) <= 0) return `${module.part.name} is full`;
      return null;
    }

    case 'reroute':
      return rerouteError(content, ship, action.moves);

    case 'use-module': {
      const module = own(action.slot);
      if (!module) return 'empty slot';
      const abilities = abilityEffects(module.part);
      if (abilities.length === 0) return `${module.part.name} has no ability to use`;
      if (module.error) return module.error;
      const cost = costOf(abilities);
      if (cost > ship.slots[action.slot]!.energy) return `needs ${cost}⚡`;
      if (aimsAtEnemy(abilities, action.manualDamage)) {
        return aimError(action.targetSlot, false, action.target);
      }
      return null;
    }

    case 'play-card': {
      if (!player) return 'enemies hold no cards';
      if (!player.hand.includes(action.cardId)) return 'not in hand';
      const card = content.cards[action.cardId];
      if (!card || card.kind !== 'item') return 'not an item';
      const effects = activeEffects(card);
      if (effects.length === 0) return `${card.name} has nothing to play`;
      if (aimsAtEnemy(effects, action.manualDamage)) {
        return aimError(action.targetSlot, effects.some((e) => e.type === 'damage-module'));
      }
      return null;
    }

    case 'revive': {
      if (config.downedPlayer !== 'revive') return 'reviving is switched off';
      if (side.kind !== 'player') return 'only a teammate can revive';
      const target = playerOf(battle, action.playerId);
      if (!target || !combat.participants.includes(target.id)) return 'not in this fight';
      if (!target.destroyed) return `${target.label} is still flying`;
      return null;
    }
  }
}
