import type { PlayerState } from '../types/player';
import type { EnemyInstance } from '../types/enemy';
import type { GameConfig } from '../types/config';
import type { CardId, PartId, SlotIndex } from '../types/ids';
import type { Cell } from '../types/ship';
import type { Content } from '../content';
import { partOf } from '../content';
import {
  bestCell,
  canPlaceAt,
  cockpitIndex,
  editAllowed,
  hasRoomFor,
  overSize,
  placeModule,
  removeModule,
  restoreCockpit,
  scrapCapBonus,
  swapCockpit,
} from '../ship';

/**
 * Loot and the scrap deck.
 *
 * Only what survives can be salvaged — destroyed modules are already gone by
 * the time a wreck is looted. After a regular kill one seat may abandon its
 * ship and take the wreck over, keeping one module from the old ship in its
 * scrap deck. The boss is taken in pieces. The scrap deck is capped (4, plus
 * whatever fitted modules add), and it's what a ship is rebuilt from at the
 * end of a mission.
 */

export type LootChoice =
  | { option: 'take-ship'; keepFromOldShip: SlotIndex | null }
  /** From the rules' ideas list, behind `lootOneModule`. */
  | { option: 'take-module'; takeSlot: SlotIndex }
  | { option: 'leave' };

export interface LootResult {
  player: PlayerState;
  /** Modules going back to be shuffled into the parts deck. */
  toParts: PartId[];
  /** Cockpits going back to the cockpit deck. */
  toCockpits: PartId[];
  log: string[];
}

export const scrapUsed = (player: PlayerState): number => player.scrapDeck.length;

/** The scrap cap: config, plus whatever modules on the ship raise it. */
export function scrapCapacity(content: Content, player: PlayerState, config: GameConfig): number {
  return config.scrapCap + scrapCapBonus(content, player.ship);
}

export const scrapRoom = (content: Content, player: PlayerState, config: GameConfig): number =>
  Math.max(0, scrapCapacity(content, player, config) - scrapUsed(player));

/** Every card still on a wreck — its surviving modules and its cockpit. */
export function wreckPieces(wreck: EnemyInstance): PartId[] {
  return wreck.ship.slots.filter((s) => !s.destroyed || s.partId === wreck.ship.cockpitId).map((s) => s.partId);
}

/** Split a set of cards into the deck each goes back to. */
function sortReturns(content: Content, ids: PartId[]): { toParts: PartId[]; toCockpits: PartId[] } {
  const toParts: PartId[] = [];
  const toCockpits: PartId[] = [];
  for (const id of ids) (partOf(content, id)?.role === 'COCKPIT' ? toCockpits : toParts).push(id);
  return { toParts, toCockpits };
}

export function resolveLootChoice(
  content: Content,
  player: PlayerState,
  wreck: EnemyInstance,
  choice: LootChoice,
  config: GameConfig,
): LootResult {
  const pieces = wreckPieces(wreck);

  if (choice.option === 'leave') {
    return {
      player,
      ...sortReturns(content, pieces),
      log: [`The party leaves the wreck of ${wreck.name} behind.`],
    };
  }

  if (choice.option === 'take-module') {
    const slot = wreck.ship.slots[choice.takeSlot];
    if (!slot || slot.destroyed || slot.partId === wreck.ship.cockpitId) {
      return { player, toParts: [], toCockpits: [], log: ['Nothing to take there.'] };
    }
    if (scrapRoom(content, player, config) <= 0) {
      return { player, toParts: [], toCockpits: [], log: [`${player.label}’s scrap deck is full.`] };
    }
    const rest = pieces.slice();
    rest.splice(rest.indexOf(slot.partId), 1);
    return {
      player: { ...player, scrapDeck: [...player.scrapDeck, slot.partId] },
      ...sortReturns(content, rest),
      log: [`${player.label} strips ${partOf(content, slot.partId)?.name ?? slot.partId} into the scrap deck.`],
    };
  }

  // Take the ship over: abandon your own, keep one module from it.
  const old = player.ship;
  const keepSlot = choice.keepFromOldShip;
  const keptSlot = keepSlot !== null ? old.slots[keepSlot] : undefined;
  const kept =
    keptSlot && !keptSlot.destroyed && keptSlot.partId !== old.cockpitId && scrapRoom(content, player, config) > 0
      ? keptSlot.partId
      : null;
  const abandoned = old.slots
    .filter((s) => !s.destroyed || s.partId === old.cockpitId)
    .map((s) => s.partId);
  if (kept) abandoned.splice(abandoned.indexOf(kept), 1);

  // The kill destroyed its cockpit; taking the ship over brings it back online
  // on start energy. Surviving modules keep whatever charge they had.
  const hull = restoreCockpit(content, wreck.ship, config.startEnergy);
  const ship = {
    ...hull,
    id: player.shipId,
    name: wreck.name.toUpperCase(),
    flags: { negateNext: 0, retaliate: 0 },
  };

  return {
    player: {
      ...player,
      ship,
      destroyed: false,
      scrapDeck: kept ? [...player.scrapDeck, kept] : player.scrapDeck,
    },
    ...sortReturns(content, abandoned),
    log: [
      `${player.label} abandons ${old.name} and takes over ${wreck.name}` +
        (kept ? `, keeping ${partOf(content, kept)?.name ?? kept} in the scrap deck.` : '.'),
      `${abandoned.length} card(s) from the old ship shuffled back into their decks.`,
    ],
  };
}

/** The boss in pieces: one part off the wreck into a seat's scrap deck. */
export function salvagePiece(
  content: Content,
  player: PlayerState,
  cardId: CardId,
  config: GameConfig,
): { player: PlayerState; log: string[] } | { error: string } {
  if (scrapRoom(content, player, config) <= 0) return { error: `${player.label}’s scrap deck is full` };
  return {
    player: { ...player, scrapDeck: [...player.scrapDeck, cardId] },
    log: [`${player.label} takes ${partOf(content, cardId)?.name ?? cardId} off the boss.`],
  };
}

// ------------------------------------------------------------ rebuilding

/**
 * Fit a module from the scrap deck onto a cell of the grid (null: wherever it
 * fits best). Layout rules and the size limit both apply.
 */
export function fitFromScrap(
  content: Content,
  player: PlayerState,
  cardId: CardId,
  cell: Cell | null,
  config: GameConfig,
): { player: PlayerState; log: string[] } | { error: string } {
  const at = player.scrapDeck.indexOf(cardId);
  const part = partOf(content, cardId);
  if (at < 0 || !part) return { error: 'not in the scrap deck' };
  if (part.role === 'COCKPIT') return installScrapCockpit(content, player, cardId, config);
  if (!hasRoomFor(content, player.ship, cardId, config.shipSizeRule)) {
    return { error: 'the cockpit has no room for it' };
  }
  const legal = cell ? (canPlaceAt(content, player.ship, cardId, cell) ? cell : null) : bestCell(content, player.ship, cardId);
  if (!legal) return { error: cell ? 'it may not sit there' : 'nowhere on the ship it may sit' };

  const scrapDeck = player.scrapDeck.slice();
  scrapDeck.splice(at, 1);
  return {
    player: {
      ...player,
      ship: placeModule(content, player.ship, cardId, legal, config.startEnergy),
      scrapDeck,
    },
    log: [`${player.label} fits ${part.name} from the scrap deck.`],
  };
}

/** Pull a module off the ship into the scrap deck — cap permitting. */
export function stowToScrap(
  content: Content,
  player: PlayerState,
  slot: SlotIndex,
  config: GameConfig,
): { player: PlayerState; log: string[] } | { error: string } {
  if (slot === cockpitIndex(player.ship)) return { error: 'the cockpit stays — install another one instead' };
  if (scrapRoom(content, player, config) <= 0) return { error: 'the scrap deck is full' };
  const { ship, partId } = removeModule(player.ship, slot);
  if (!partId) return { error: 'nothing there' };
  if (!editAllowed(content, player.ship, ship)) return { error: 'other modules hang off it — move them first' };
  return {
    player: { ...player, ship, scrapDeck: [...player.scrapDeck, partId] },
    log: [`${player.label} stows ${partOf(content, partId)?.name ?? partId} in the scrap deck.`],
  };
}

/**
 * Rebuild around a cockpit from the scrap deck. The old one takes its place
 * in the scrap deck — a swap, so the cap doesn't bite — and anything the new
 * cockpit has no room for, or whose placement now breaks, is refused rather
 * than silently dropped.
 */
export function installScrapCockpit(
  content: Content,
  player: PlayerState,
  cardId: CardId,
  config: GameConfig,
): { player: PlayerState; log: string[] } | { error: string } {
  const at = player.scrapDeck.indexOf(cardId);
  if (at < 0 || partOf(content, cardId)?.role !== 'COCKPIT') return { error: 'not a cockpit in the scrap deck' };
  const ship = swapCockpit(content, player.ship, cardId, config.startEnergy);
  if (overSize(content, ship, config.shipSizeRule)) {
    return { error: 'the modules on the ship don’t fit that cockpit — stow some first' };
  }
  if (!editAllowed(content, player.ship, ship)) return { error: 'the layout breaks a placement rule with that cockpit' };
  const scrapDeck = player.scrapDeck.slice();
  scrapDeck.splice(at, 1, player.ship.cockpitId);
  return {
    player: { ...player, ship, scrapDeck, destroyed: false },
    log: [`${player.label} rebuilds around ${partOf(content, cardId)?.name ?? cardId}.`],
  };
}
