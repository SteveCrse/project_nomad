import type { PlayerState } from '../types/player';
import type { EnemyInstance } from '../types/enemy';
import type { GameConfig } from '../types/config';
import type { CardId, SlotIndex } from '../types/ids';
import type { Content } from '../content';
import { partOf } from '../content';
import {
  canAttachAt,
  chargeSlot,
  cockpitOf,
  equipPart,
  firstAttachableSlot,
  scrapCapBonus,
} from '../ship';

/**
 * Loot phase. On destroying an enemy ship the party picks one:
 *   A — take the whole ship, keeping 1 module from the old one in the Scrap Deck.
 *   B — keep your ship, take a single module into the Scrap Deck.
 * The Scrap Deck is a capped reserve spent at a rearrangement point.
 *
 * The doc's open assumption stands: one pool, not two. Both the module kept
 * when abandoning a ship and the module hoarded under option B land in
 * `player.scrapDeck`.
 */

export type LootChoice =
  | { option: 'take-ship'; keepFromOldShip: SlotIndex }
  | { option: 'take-module'; takeSlot: SlotIndex }
  | { option: 'decline' };

export interface LootResult {
  player: PlayerState;
  /** Parts that go back into the Parts deck to be shuffled in. */
  returnedToPartsDeck: CardId[];
  log: string[];
}

export function resolveLootChoice(
  content: Content,
  player: PlayerState,
  enemy: EnemyInstance,
  choice: LootChoice,
  config: GameConfig,
): LootResult {
  const enemyParts = enemy.ship.slots
    .map((s) => s.partId)
    .filter((id): id is CardId => !!id && id !== enemy.ship.cockpitId);

  if (choice.option === 'decline') {
    return {
      player,
      returnedToPartsDeck: [enemy.ship.cockpitId, ...enemyParts],
      log: [`${player.label} leaves the wreck of ${enemy.name} alone.`],
    };
  }

  if (choice.option === 'take-module') {
    const slot = enemy.ship.slots[choice.takeSlot];
    const partId = slot?.partId;
    if (!partId) {
      return { player, returnedToPartsDeck: [], log: ['No module in that slot.'] };
    }
    if (scrapUsed(player) >= scrapCapacity(content, player, config)) {
      return { player, returnedToPartsDeck: [], log: ['Scrap Deck is full.'] };
    }
    const remaining = enemyParts.slice();
    remaining.splice(remaining.indexOf(partId), 1);
    const rest = [enemy.ship.cockpitId, ...remaining];
    return {
      player: { ...player, scrapDeck: [...player.scrapDeck, partId] },
      returnedToPartsDeck: rest,
      log: [
        `${player.label} strips ${partOf(content, partId)?.name ?? partId} into the Scrap Deck — inactive until a rearrangement point.`,
      ],
    };
  }

  // Option A: pilot the enemy ship, keep exactly one module from the old one.
  const oldSlot = player.ship.slots[choice.keepFromOldShip];
  const kept = oldSlot?.partId && oldSlot.partId !== player.ship.cockpitId ? oldSlot.partId : null;
  const lost = player.ship.slots
    .map((s) => s.partId)
    .filter((id): id is CardId => !!id && id !== kept);

  const capacity = scrapCapacity(content, player, config);
  const scrapDeck = kept && player.scrapDeck.length < capacity
    ? [...player.scrapDeck, kept]
    : player.scrapDeck;

  // The enemy ship is taken as it stands, module charge and all — except the
  // cockpit, which was necessarily shot dry to wreck the ship in the first
  // place. Taking a hull over means patching that basic shield back up; a ship
  // handed over with 0⚡ on the cockpit would die to the next stray hit.
  const cockpit = cockpitOf(content, enemy.ship);
  const patched = cockpit
    ? chargeSlot(content, enemy.ship, cockpit.slot.index, cockpit.part.energyCapacity ?? 0).ship
    : enemy.ship;

  const takenShip = {
    ...patched,
    id: player.shipId,
    name: enemy.ship.name.toUpperCase(),
    destroyed: false,
    flags: { negateNext: 0, retaliate: 0 },
  };

  return {
    player: { ...player, ship: takenShip, scrapDeck, destroyed: false },
    returnedToPartsDeck: lost,
    log: [
      `${player.label} abandons ${player.ship.name} and takes ${enemy.name} whole` +
        (kept ? `, keeping ${partOf(content, kept)?.name ?? kept} in the Scrap Deck.` : '.'),
      `${lost.length} part(s) shuffled back into the Parts deck.`,
    ],
  };
}

export const scrapUsed = (player: PlayerState): number => player.scrapDeck.length;

/** Is there room in the scrap deck, accounting for modules that raise the cap? */
export function scrapCapacity(content: Content, player: PlayerState, config: GameConfig): number {
  return config.scrapCap + scrapCapBonus(content, player.ship);
}

/** At a rearrangement point: slot hoarded modules into the ship. */
export function rearrange(
  content: Content,
  player: PlayerState,
  assignments: { cardId: CardId; slot: SlotIndex }[],
  _config: GameConfig,
): { player: PlayerState; log: string[] } {
  let ship = player.ship;
  const scrapDeck = player.scrapDeck.slice();
  const log: string[] = [];

  for (const { cardId, slot } of assignments) {
    const index = scrapDeck.indexOf(cardId);
    if (index < 0) continue;
    const target = slot >= 0 ? slot : firstAttachableSlot(ship);
    if (target < 0 || target >= ship.slots.length) continue;
    if (target === ship.slots.findIndex((s) => s.partId === ship.cockpitId)) continue;

    // Swapping out an occupied slot puts the old module back into the scrap.
    const occupant = ship.slots[target]?.partId ?? null;
    // An empty position still has to touch the ship.
    if (!occupant && !canAttachAt(ship, target)) continue;
    ship = equipPart(ship, target, cardId);
    // Modules come online with an empty pool; generators prime themselves.
    const part = partOf(content, cardId);
    if (part?.generates) ship = chargeSlot(content, ship, target, part.generates).ship;

    scrapDeck.splice(index, 1);
    if (occupant) scrapDeck.push(occupant);
    log.push(
      `${player.label} slots ${part?.name ?? cardId}` +
        (occupant ? `, pulling ${partOf(content, occupant)?.name ?? occupant} into the Scrap Deck.` : '.'),
    );
  }

  return { player: { ...player, ship, scrapDeck }, log };
}

/** Buy a higher own-threshold, paying in attack power (rules question #2). */
export function buyThresholdUpgrade(
  player: PlayerState,
  config: GameConfig,
): { player: PlayerState; log: string[] } {
  if (!config.allowThresholdUpgrades) {
    return { player, log: ['Threshold upgrades are switched off in config.'] };
  }
  return {
    player: {
      ...player,
      thresholdBonus: player.thresholdBonus + config.thresholdUpgradeStep,
      powerPenalty: player.powerPenalty + config.thresholdUpgradePowerCost,
    },
    log: [
      `${player.label} hardens the ship: +${config.thresholdUpgradeStep} own threshold, ` +
        `-${config.thresholdUpgradePowerCost}⚔ per attack.`,
    ],
  };
}
