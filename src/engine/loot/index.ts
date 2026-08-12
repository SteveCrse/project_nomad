import type { PlayerState } from '../types/player';
import type { EnemyInstance } from '../types/enemy';
import type { GameConfig } from '../types/config';
import type { CardId, SlotIndex } from '../types/ids';

/**
 * Loot phase. On destroying an enemy ship the party picks one:
 *   A — take the whole ship, keeping 1 module from the old one in the Scrap Deck.
 *   B — keep your ship, take a single module into the Scrap Deck.
 * The Scrap Deck is a capped reserve spent at a rearrangement point.
 */

export type LootChoice =
  | { option: 'take-ship'; keepFromOldShip: SlotIndex }
  | { option: 'take-module'; takeSlot: SlotIndex };

export function resolveLootChoice(
  _player: PlayerState,
  _enemy: EnemyInstance,
  _choice: LootChoice,
  _config: GameConfig,
): { player: PlayerState; returnedToPartsDeck: CardId[] } {
  throw new Error('engine/loot: resolveLootChoice not implemented');
}

/** Is there room in the scrap deck, accounting for modules that raise the cap? */
export function scrapCapacity(_player: PlayerState, _config: GameConfig): number {
  throw new Error('engine/loot: scrapCapacity not implemented');
}

/** At a rearrangement point: slot hoarded modules into the ship. */
export function rearrange(
  _player: PlayerState,
  _assignments: { cardId: CardId; slot: SlotIndex }[],
  _config: GameConfig,
): PlayerState {
  throw new Error('engine/loot: rearrange not implemented');
}
