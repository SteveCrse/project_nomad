import type { GameConfig } from '../types/config';
import type { CardId, PlayerId } from '../types/ids';
import type { GameState } from '../types/game';
import type { Content } from '../content';
import { cardOf, partOf } from '../content';
import type { Rng } from '../rng';
import * as deck from '../deck';
import * as board from '../board';
import * as loot from '../loot';
import type { LootChoice } from '../loot';
import { compactShip, defaultTargetSlot, hitSlot } from '../ship';
import { livingPlayers, log, logAll, playerIn, pushEvents, withPlayer } from './shared';
import { continueRun, startFight } from './flow';

// ---------------------------------------------------------------- loot

/** A regular kill: take the ship over, strip a module (if switched on), or leave it. */
export function resolveLoot(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  playerId: PlayerId | null,
  choice: LootChoice,
): GameState {
  if (state.prompt?.kind !== 'loot') return state;
  if (choice.option === 'take-module' && !config.lootOneModule) return state;
  const prompt = state.prompt;
  // Leaving the wreck is the party's call and needs no seat — the fight may
  // have been won by a ship that went down with it.
  const player = playerIn(state, playerId) ?? playerIn(state, prompt.claimants[0]) ?? state.party.players[0];
  if (!player) return state;
  if (choice.option !== 'leave' && !prompt.claimants.includes(player.id)) return state;

  const result = loot.resolveLootChoice(content, player, prompt.wreck, choice, config);
  let next = choice.option === 'leave' ? state : withPlayer(state, player.id, () => result.player);
  next = {
    ...next,
    decks: {
      ...next.decks,
      parts: deck.returnToDeck(next.decks.parts, result.toParts, rng),
      cockpits: deck.returnToDeck(next.decks.cockpits, result.toCockpits, rng),
    },
    prompt: null,
    combat: null,
  };
  next = logAll(next, result.log, 'loot');
  return continueRun(content, next, config, rng);
}

// ---------------------------------------------------------------- prompts

/** Take the Item cards a Loot step handed out into hands, up to hand size. */
export function claimReward(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  playerId: PlayerId,
): GameState {
  if (state.prompt?.kind !== 'reward') return state;
  const player = playerIn(state, playerId);
  if (!player) return state;

  const room = Math.max(0, config.handSize - player.hand.length);
  const taken = state.prompt.cardIds.slice(0, room);
  const spilled = state.prompt.cardIds.slice(room);

  let next: GameState = withPlayer(state, playerId, (p) => ({ ...p, hand: [...p.hand, ...taken] }));
  next = { ...next, decks: { ...next.decks, items: deck.discard(next.decks.items, spilled) }, prompt: null };
  next = log(
    next,
    `${player.label} takes ${taken.map((id) => cardOf(content, id)?.name ?? id).join(', ') || 'nothing'}` +
      (spilled.length ? ` — ${spilled.length} card(s) over hand size, discarded.` : '.'),
    'loot',
  );
  return continueRun(content, next, config, rng);
}

/** Resolve the face-up Event card. */
export function resolveEvent(content: Content, state: GameState, config: GameConfig, rng: Rng): GameState {
  if (state.prompt?.kind !== 'event') return state;
  const { cardId, nodeId } = state.prompt;
  const card = cardOf(content, cardId);
  let next: GameState = {
    ...state,
    prompt: null,
    decks: { ...state.decks, events: deck.discard(state.decks.events, [cardId]) },
  };
  if (!card || card.kind !== 'event') return continueRun(content, next, config, rng);

  if (card.placesMarker) {
    const marker = card.marker ?? card.name;
    next = { ...next, mission: board.addMarker(next.mission, nodeId, marker) };
    next = log(next, `${marker} marker placed on ${nodeId}.`, 'info');
  }

  if (card.damage) {
    // A hazard is a hit like any other: it lands on the front shield, else the
    // cockpit, and takes ⚡ off whatever it lands on.
    const here = board.playersAt(next.mission, nodeId);
    const lines: string[] = [];
    const scrapped: CardId[] = [];
    for (const id of here) {
      const player = playerIn(next, id);
      if (!player || player.destroyed) continue;
      const at = defaultTargetSlot(content, player.ship);
      const hit = hitSlot(content, player.ship, at, card.damage);
      next = pushEvents(next, [
        {
          kind: 'hit',
          target: { side: { kind: 'player', id }, slot: at },
          name: `${player.label}’s ${partOf(content, player.ship.slots[at]?.partId)?.name ?? 'module'}`,
          lost: hit.lost,
          destroyed: hit.destroyed,
          firstDown: hit.firstDown,
          negated: hit.negated,
        },
      ]);
      const { ship, removed } = compactShip(hit.ship);
      scrapped.push(...removed);
      next = withPlayer(next, id, (p) => ({ ...p, ship, destroyed: ship.destroyed }));
      const name = partOf(content, player.ship.slots[at]?.partId)?.name ?? 'module';
      lines.push(
        `${player.label}: ${hit.destroyed ? `${name} destroyed` : `${name} −${hit.lost}⚡`}` +
          (ship.destroyed ? ' — the ship is lost' : ''),
      );
    }
    next = { ...next, decks: { ...next.decks, parts: deck.discard(next.decks.parts, scrapped) } };
    next = log(next, `${card.name}: a ${card.damage}⚔ hit on every ship here.`, 'damage');
    next = logAll(next, lines, 'damage');
    if (livingPlayers(next).length === 0) {
      return { ...log(next, 'Every cockpit is destroyed. The team loses.', 'system'), phase: 'defeat' };
    }
  }

  if (card.grantsLoot) {
    const pull = deck.draw(next.decks.items, card.grantsLoot, rng);
    next = { ...next, decks: { ...next.decks, items: pull.deck } };
    if (pull.drawn.length > 0) {
      next = log(next, `${card.name} pays out: ${pull.drawn.map((id) => cardOf(content, id)?.name ?? id).join(', ')}.`, 'loot');
      return { ...next, phase: 'reward', prompt: { kind: 'reward', cardIds: pull.drawn, nodeId } };
    }
  }

  if (card.spawnsCombat) {
    const node = board.nodeById(next.mission, nodeId);
    if (node) {
      const here = board.playersAt(next.mission, nodeId).filter((id) => !playerIn(next, id)?.destroyed);
      return startFight(content, next, config, rng, { ...node, type: 'combat' }, here);
    }
  }

  return continueRun(content, next, config, rng);
}

/** Leave a checkpoint/rearrange screen and get back on the board. */
export function closePrompt(content: Content, state: GameState, config: GameConfig, rng: Rng): GameState {
  if (state.prompt?.kind === 'rearrange' && state.prompt.reason === 'mission-end') {
    return { ...state, phase: 'victory', prompt: null };
  }
  return continueRun(content, { ...state, prompt: null }, config, rng);
}
