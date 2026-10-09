import type { BoardNode } from '../types/board';
import type { DownAction, SideRef } from '../types/combat';
import type { GameConfig } from '../types/config';
import type { EnemyInstance } from '../types/enemy';
import type { CardId, NodeId, PlayerId, SlotIndex } from '../types/ids';
import type { Cell } from '../types/ship';
import type { PartyState, PlayerState } from '../types/player';
import type { GameState, Loadout } from '../types/game';
import { isCockpit, isEvent, isItem, isModule } from '../types/card';
import type { Content } from '../content';
import { cardOf, partOf } from '../content';
import type { Rng } from '../rng';
import * as deck from '../deck';
import * as board from '../board';
import * as combat from '../combat';
import * as loot from '../loot';
import type { LootChoice } from '../loot';
import { planEnemyAction } from '../ai';
import {
  arrangeShip,
  compactShip,
  createShip,
  defaultTargetSlot,
  hitSlot,
  modulesOf,
  restoreCockpit,
  spawnBoss,
  spawnEnemy,
} from '../ship';
import {
  absorbCombat,
  battleOf,
  combatMark,
  livingPlayers,
  log,
  logAll,
  playerIn,
  pushEvents,
  seatLabel,
  withPlayer,
} from './shared';
import { openDraft } from './draft';

export {
  assemblePart,
  autoDraft,
  autoEnergy,
  draftCard,
  draftedModules,
  energyError,
  moveModule,
  nextDrafter,
  passDraft,
  pickError,
  placeEnergy,
  returnPart,
  startMission,
} from './draft';

/**
 * The run orchestrator: the piece that turns the subsystems into an actual
 * playable round.
 *
 * Everything is a pure `(state, …) → state` step so the Zustand store is a
 * thin shell and a headless sweep can drive the same functions in a loop.
 */

export type { Loadout };

// ---------------------------------------------------------------- setup

export function newRun(
  content: Content,
  config: GameConfig,
  seed: number,
  loadouts: Loadout[],
  rng: Rng,
  sector = 1,
): GameState {
  const seats = loadouts.slice(0, Math.max(1, config.playerCount));

  const decks = {
    parts: deck.buildDeck('parts', content.all.filter(isModule), config.maxRarityNow, rng),
    cockpits: deck.buildDeck('cockpits', content.all.filter(isCockpit), config.maxRarityNow, rng),
    items: deck.buildDeck('items', content.all.filter(isItem), config.maxRarityNow, rng),
    events: deck.buildDeck('events', content.all.filter(isEvent), config.maxRarityNow, rng),
  };

  const players = seats.map((seat) => buildPlayer(content, config, seat, !config.draft));
  const party: PartyState = { players };
  const mission = board.generateMission(seed, sector, config, rng, Object.values(content.bosses));
  mission.positions = Object.fromEntries(players.map((p) => [p.id, mission.startNodeId]));

  const state: GameState = {
    seed,
    sector,
    phase: config.draft ? 'setup' : 'map',
    mission,
    party,
    decks,
    combat: null,
    maxRarityNow: config.maxRarityNow,
    prompt: null,
    setup: null,
    log: [],
    logCounter: 0,
    events: [],
    eventCounter: 0,
    split: false,
    // Moving together, one seat's choice moves everyone. Nobody moves until
    // the ships are built.
    awaitingMove: config.draft || !players[0] ? [] : [players[0].id],
  };

  const opened = log(
    state,
    `Sector ${sector} mission generated from seed ${seed}: ${mission.length} steps to the boss.`,
    'system',
  );
  return config.draft ? openDraft(content, config, opened, rng) : opened;
}

/**
 * A seat's starting ship. With the draft on it's only a placeholder hull
 * until the cockpit round hands the seat a real cockpit; with it off the
 * authored loadout is laid out by the layout rules.
 */
function buildPlayer(content: Content, config: GameConfig, seat: Loadout, fitLoadout: boolean): PlayerState {
  let ship = createShip(content, seat.cockpitId, seat.shipName, config.startEnergy);
  let scrap: CardId[] = [];
  if (fitLoadout) {
    const arranged = arrangeShip(content, ship, seat.partIds, config.startEnergy, config.shipSizeRule);
    ship = arranged.ship;
    scrap = arranged.rejected.slice(0, config.scrapCap);
  }
  return {
    id: seat.id,
    label: seat.label,
    accent: seat.accent,
    shipId: ship.id,
    ship,
    scrapDeck: scrap,
    hand: [],
    carriedParts: [],
    tokens: 0,
    destroyed: false,
  };
}

// ---------------------------------------------------------------- movement

export function setSplit(state: GameState, split: boolean): GameState {
  if (state.phase !== 'map') return state;
  const alive = livingPlayers(state);
  return log(
    { ...state, split, awaitingMove: split ? alive.map((p) => p.id) : alive.slice(0, 1).map((p) => p.id) },
    split
      ? 'Party splits up — each seat moves on its own. Higher risk, higher reward.'
      : 'Party regroups and moves together.',
    'system',
  );
}

/** Where this player may go next. */
export const moveOptions = (state: GameState, player: PlayerId): BoardNode[] =>
  board.optionsFor(state.mission, player);

/**
 * Move a seat (or the whole party when not split) onto a step, then resolve
 * whatever the party just walked into.
 */
export function moveTo(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  player: PlayerId,
  nodeId: NodeId,
): GameState {
  if (state.phase !== 'map' || state.prompt) return state;
  const target = board.nodeById(state.mission, nodeId);
  if (!target) return state;

  let next = state;
  if (state.split) {
    if (!next.awaitingMove.includes(player)) return state;
    if (!board.optionsFor(state.mission, player).some((n) => n.id === nodeId)) return state;
    next = {
      ...next,
      mission: board.movePlayer(next.mission, player, nodeId),
      awaitingMove: next.awaitingMove.filter((id) => id !== player),
    };
  } else {
    const movers = livingPlayers(next).map((p) => p.id);
    if (!board.optionsFor(state.mission, movers[0] ?? player).some((n) => n.id === nodeId)) {
      return state;
    }
    let mission = next.mission;
    // Downed seats ride along with the party so they're on the board when
    // they come back.
    for (const p of next.party.players) mission = board.movePlayer(mission, p.id, nodeId);
    next = { ...next, mission, awaitingMove: [] };
  }

  if (next.awaitingMove.length > 0) return next; // still waiting on other seats
  return continueRun(content, next, config, rng);
}

/**
 * Resolve the next occupied step that hasn't been triggered yet, or hand
 * control back to the map. Every step ends here, which is what lets a split
 * party's steps resolve one after another.
 */
export function continueRun(content: Content, state: GameState, config: GameConfig, rng: Rng): GameState {
  const occupied = board
    .occupiedNodes(state.mission)
    .filter((id) => board.playersAt(state.mission, id).some((p) => !playerIn(state, p)?.destroyed))
    .map((id) => board.nodeById(state.mission, id))
    .filter((n): n is BoardNode => !!n && !n.resolved);

  const node = occupied[0];
  if (!node) return readyForNextMove(state);
  return enterNode(content, state, config, rng, node);
}

/** Hand control back to the map and ask every living seat for a move. */
function readyForNextMove(state: GameState): GameState {
  const alive = livingPlayers(state);
  if (alive.length === 0) return { ...state, phase: 'defeat', prompt: null };
  return {
    ...state,
    phase: 'map',
    prompt: null,
    combat: null,
    awaitingMove: state.split ? alive.map((p) => p.id) : [alive[0]!.id],
  };
}

// ---------------------------------------------------------------- steps

function enterNode(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  node: BoardNode,
): GameState {
  const here = board.playersAt(state.mission, node.id).filter((id) => !playerIn(state, id)?.destroyed);
  let next = log(
    state,
    `${here.map((id) => seatLabel(state, id)).join(' + ') || 'The party'} enters ${node.id} — ${node.type.toUpperCase()} (depth ${node.column}).`,
    'system',
  );

  switch (node.type) {
    case 'start':
    case 'empty':
      next = log(next, 'Empty space. Nothing here but the hum of the drive.', 'info');
      return continueRun(content, markResolved(next, node.id), config, rng);

    case 'combat':
    case 'boss':
      return startFight(content, next, config, rng, node, here);

    case 'loot': {
      const pull = deck.draw(next.decks.items, Math.max(0, config.lootPerNode), rng);
      next = markResolved({ ...next, decks: { ...next.decks, items: pull.deck } }, node.id);
      if (pull.drawn.length === 0) {
        return continueRun(content, log(next, 'The Items deck is dry — nothing to salvage.', 'loot'), config, rng);
      }
      return {
        ...log(next, `Loot: ${pull.drawn.map((id) => cardOf(content, id)?.name ?? id).join(', ')}.`, 'loot'),
        phase: 'reward',
        prompt: { kind: 'reward', cardIds: pull.drawn, nodeId: node.id },
      };
    }

    case 'event': {
      const pull = deck.draw(next.decks.events, 1, rng);
      next = markResolved({ ...next, decks: { ...next.decks, events: pull.deck } }, node.id);
      const cardId = pull.drawn[0];
      if (!cardId) return continueRun(content, log(next, 'The Events deck is dry.', 'info'), config, rng);
      return {
        ...log(next, `Event drawn: ${cardOf(content, cardId)?.name ?? cardId}.`, 'info'),
        phase: 'event',
        prompt: { kind: 'event', cardId, nodeId: node.id },
      };
    }

    case 'checkpoint':
      return crossCheckpoint(content, next, config, rng, node);
  }
}

function markResolved(state: GameState, nodeId: NodeId): GameState {
  return { ...state, mission: board.markNodeResolved(state.mission, nodeId) };
}

// ---------------------------------------------------------------- combat

function startFight(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  node: BoardNode,
  participants: PlayerId[],
): GameState {
  const seats = participants.length > 0 ? participants : livingPlayers(state).map((p) => p.id);
  let next = state;
  let enemy: EnemyInstance;

  if (node.type === 'boss') {
    const sheet = (node.bossId ? content.bosses[node.bossId] : undefined) ?? Object.values(content.bosses)[0];
    if (!sheet) return continueRun(content, markResolved(log(state, 'No boss sheet — the step is empty.', 'system'), node.id), config, rng);
    enemy = spawnBoss(content, sheet, config, node.column);
  } else {
    const spawn = spawnEnemy(
      content,
      { parts: next.decks.parts, cockpits: next.decks.cockpits },
      config,
      node.column,
      seats.length,
      rng,
    );
    enemy = spawn.enemy;
    next = { ...next, decks: { ...next.decks, parts: spawn.parts, cockpits: spawn.cockpits } };
  }

  const line = modulesOf(enemy.ship).map((s) => partOf(content, s.partId)?.name ?? s.partId).join(' · ');
  next = log(
    next,
    `${enemy.name}${enemy.isBoss ? ' (boss)' : ''} spins up — ${modulesOf(enemy.ship).length} module(s): ${line || 'none'}.`,
    'system',
  );

  const battle = combat.startCombat(content, next.party, enemy, seats, config, rng);
  next = absorbCombat({ ...next, party: battle.party, combat: battle.combat }, battle, combatMark(null));
  return { ...next, phase: 'combat', prompt: null };
}

export const activeSide = (state: GameState): SideRef | undefined =>
  state.combat && !state.combat.outcome ? state.combat.turn : undefined;

export const isPlayerTurn = (state: GameState): boolean => activeSide(state)?.kind === 'player';

/** Spend one of the active seat's downs. */
export function takeDown(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  action: DownAction,
): { state: GameState; error?: string } {
  const battle = battleOf(state);
  if (!battle || battle.combat.turn.kind !== 'player') return { state };

  const before = combatMark(battle);
  const { battle: after, result } = combat.playerDown(content, battle, config, action, rng);
  if (result.illegal) return { state, error: result.illegal };

  let next = absorbCombat(state, after, before);
  // A played item is single use: it goes to the discard.
  if (action.type === 'play-card') {
    next = { ...next, decks: { ...next.decks, items: deck.discard(next.decks.items, [action.cardId]) } };
  }
  return { state: settleCombat(content, next, config, rng) };
}

/**
 * The seat ends its turn: to the next seat after a 1st down, to the enemy
 * otherwise. A turn never ends on its own.
 */
export function endTurn(content: Content, state: GameState): GameState {
  const battle = battleOf(state);
  if (!battle) return state;
  return absorbCombat(state, combat.endPlayerTurn(content, battle), combatMark(battle));
}

/** Run one enemy down. The caller decides how fast to step through them. */
export function enemyStep(content: Content, state: GameState, config: GameConfig, rng: Rng): GameState {
  const battle = battleOf(state);
  if (!battle || battle.combat.turn.kind !== 'enemy' || battle.combat.outcome) return state;
  const after = combat.enemyDown(content, battle, config, rng, planEnemyAction);
  return settleCombat(content, absorbCombat(state, after, combatMark(battle)), config, rng);
}

/**
 * Once a fight has an outcome: destroyed modules are gone — off every ship in
 * the fight and onto the parts discard — and the run moves on to the loot.
 */
function settleCombat(content: Content, state: GameState, config: GameConfig, rng: Rng): GameState {
  const fight = state.combat;
  const outcome = fight?.outcome;
  if (!fight || !outcome) return state;

  const scrapped: CardId[] = [];
  let next: GameState = {
    ...state,
    party: {
      ...state.party,
      players: state.party.players.map((p) => {
        if (!fight.participants.includes(p.id)) return p;
        const { ship, removed } = compactShip(p.ship);
        scrapped.push(...removed);
        return { ...p, ship };
      }),
    },
  };
  const wreck = compactShip(fight.enemy.ship);
  scrapped.push(...wreck.removed);
  const enemy: EnemyInstance = { ...fight.enemy, ship: wreck.ship };
  next = { ...next, decks: { ...next.decks, parts: deck.discard(next.decks.parts, scrapped) } };
  if (scrapped.length > 0) next = log(next, `${scrapped.length} destroyed module(s) are gone — to the parts discard.`, 'system');

  const node = currentCombatNode(next);
  if (node) next = markResolved(next, node.id);

  if (outcome === 'defeat') {
    next = { ...next, combat: null };
    if (livingPlayers(next).length === 0) {
      return { ...log(next, 'Every cockpit is destroyed. The team loses.', 'system'), phase: 'defeat', prompt: null };
    }
    // A split party can lose one fight and fly on: the enemy keeps its ship.
    next = log(next, `The fight is lost — ${fight.participants.map((id) => seatLabel(next, id)).join(' + ')} down.`, 'system');
    return continueRun(content, { ...next, prompt: null }, config, rng);
  }

  const claimants = fight.participants.filter((id) => !playerIn(next, id)?.destroyed);
  next = log(next, `${enemy.name} is down. ${enemy.isBoss ? 'Take the boss in pieces.' : 'Loot phase.'}`, 'system');
  if (enemy.isBoss) {
    const prompt = {
      kind: 'salvage' as const,
      wreck: enemy,
      pieces: loot.wreckPieces(enemy),
      claimants,
      turn: 0,
      passed: [],
    };
    return salvageTurn(content, { ...next, phase: 'loot' }, config, prompt, 0);
  }
  return { ...next, phase: 'loot', prompt: { kind: 'loot', wreck: enemy, claimants } };
}

function currentCombatNode(state: GameState): BoardNode | undefined {
  const occupied = board.occupiedNodes(state.mission);
  return state.mission.nodes.find(
    (n) => occupied.includes(n.id) && !n.resolved && (n.type === 'combat' || n.type === 'boss'),
  );
}

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

/** The boss in pieces: the seat on the clock takes one part, or passes. */
export function salvage(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  cardId: CardId | null,
): GameState {
  const prompt = state.prompt;
  if (prompt?.kind !== 'salvage') return state;
  const who = prompt.claimants[prompt.turn];
  if (who !== playerId) return state;
  const player = playerIn(state, who)!;

  let next = state;
  let pieces = prompt.pieces;
  let passed = prompt.passed;
  if (cardId === null) {
    passed = [...passed, who];
    next = log(next, `${player.label} passes on the wreck.`, 'loot');
  } else {
    if (!pieces.includes(cardId)) return state;
    const taken = loot.salvagePiece(content, player, cardId, config);
    if ('error' in taken) return state;
    next = logAll(withPlayer(next, who, () => taken.player), taken.log, 'loot');
    pieces = pieces.slice();
    pieces.splice(pieces.indexOf(cardId), 1);
  }
  return salvageTurn(content, next, config, { ...prompt, pieces, passed }, prompt.turn + 1);
}

/**
 * Put the next seat still taking on the clock, starting from `from` and going
 * round the table — a seat that passed, or whose scrap deck is full, is
 * skipped. When nobody can take any more, whatever is left drifts away and
 * the mission ends.
 */
function salvageTurn(
  content: Content,
  state: GameState,
  config: GameConfig,
  prompt: Extract<NonNullable<GameState['prompt']>, { kind: 'salvage' }>,
  from: number,
): GameState {
  const seats = prompt.claimants;
  const live = (id: PlayerId) => {
    const p = playerIn(state, id);
    return !!p && !prompt.passed.includes(id) && loot.scrapRoom(content, p, config) > 0;
  };
  let turn = -1;
  for (let step = 0; step < seats.length; step++) {
    const i = (from + step) % seats.length;
    if (live(seats[i]!)) {
      turn = i;
      break;
    }
  }
  if (prompt.pieces.length === 0 || turn < 0) {
    const next = prompt.pieces.length > 0
      ? log(state, `${prompt.pieces.length} piece(s) nobody took are left drifting.`, 'loot')
      : state;
    return missionEnd(content, { ...next, prompt: null, combat: null }, config);
  }
  return { ...state, prompt: { ...prompt, turn } };
}

/**
 * Boss down: the mission is over. Seats that went down rebuild — their
 * cockpit comes back on start energy — and everyone builds their next ship
 * from what they're flying plus the scrap deck.
 */
function missionEnd(content: Content, state: GameState, config: GameConfig): GameState {
  let next = state;
  for (const player of state.party.players) {
    if (!player.destroyed) continue;
    next = withPlayer(next, player.id, (p) => ({
      ...p,
      destroyed: false,
      ship: restoreCockpit(content, p.ship, config.startEnergy),
    }));
    next = log(next, `${player.label} rebuilds — the cockpit comes back online.`, 'system');
  }
  return {
    ...log(next, 'Mission complete. Build your next ship from what you fly and your scrap deck.', 'system'),
    phase: 'rearrange',
    prompt: { kind: 'rearrange', reason: 'mission-end' },
  };
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

/**
 * A rarity checkpoint: raise the ceiling, shuffle the newly unlocked stack
 * into every deck, and — if the config says so — take some commons out.
 */
function crossCheckpoint(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  node: BoardNode,
): GameState {
  const newMax = Math.min(
    5,
    Math.max(state.maxRarityNow, node.raisesRarityTo ?? state.maxRarityNow + config.rarityPerCheckpoint),
  );
  let next = markResolved(state, node.id);
  let unlockedTotal = 0;

  const decks = { ...next.decks };
  for (const id of ['parts', 'cockpits', 'items', 'events'] as const) {
    const applied = deck.applyCheckpoint(decks[id], content.cards, newMax, rng);
    decks[id] = applied.deck;
    unlockedTotal += applied.unlocked.length;
  }
  const culled = deck.removeCommons(decks.parts, content.cards, config.commonsRemovedPerCheckpoint);
  decks.parts = culled.deck;

  next = { ...next, decks, maxRarityNow: newMax };
  next = log(
    next,
    `Rarity checkpoint — ceiling now ${newMax}. ${unlockedTotal} card(s) shuffled in` +
      (culled.removed.length > 0 ? `, ${culled.removed.length} common(s) taken out of the parts deck.` : '.'),
    'system',
  );

  return node.isRearrangePoint
    ? { ...next, phase: 'rearrange', prompt: { kind: 'rearrange', reason: 'checkpoint' } }
    : { ...next, phase: 'map', prompt: { kind: 'checkpoint', nodeId: node.id, newMaxRarity: newMax } };
}

// ------------------------------------------------------------ rebuilding

type Rebuild = { player: PlayerState; log: string[] } | { error: string };

function applyRebuild(state: GameState, playerId: PlayerId, result: Rebuild): { state: GameState; error?: string } {
  if ('error' in result) return { state, error: result.error };
  return { state: logAll(withPlayer(state, playerId, () => result.player), result.log, 'loot') };
}

const rebuilding = (state: GameState) => state.phase === 'rearrange';

/** Rearrangement point: fit a module (or a cockpit) from the scrap deck — on a cell, or wherever it fits best. */
export function fitFromScrap(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  cardId: CardId,
  cell: Cell | null,
): { state: GameState; error?: string } {
  const player = playerIn(state, playerId);
  if (!player || !rebuilding(state)) return { state, error: 'not a rearrangement point' };
  return applyRebuild(state, playerId, loot.fitFromScrap(content, player, cardId, cell, config));
}

/** Rearrangement point: pull a module off the ship into the scrap deck. */
export function stowToScrap(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  slot: SlotIndex,
): { state: GameState; error?: string } {
  const player = playerIn(state, playerId);
  if (!player || !rebuilding(state)) return { state, error: 'not a rearrangement point' };
  return applyRebuild(state, playerId, loot.stowToScrap(content, player, slot, config));
}

/** Leave a checkpoint/rearrange screen and get back on the board. */
export function closePrompt(content: Content, state: GameState, config: GameConfig, rng: Rng): GameState {
  if (state.prompt?.kind === 'rearrange' && state.prompt.reason === 'mission-end') {
    return { ...state, phase: 'victory', prompt: null };
  }
  return continueRun(content, { ...state, prompt: null }, config, rng);
}

/** The next sector: a new mission, flown in the ships the party just built. */
export function nextMission(content: Content, state: GameState, config: GameConfig, rng: Rng): GameState {
  const mission = board.generateMission(
    state.seed + 1,
    state.sector + 1,
    config,
    rng,
    Object.values(content.bosses),
    state.maxRarityNow,
  );
  mission.positions = Object.fromEntries(state.party.players.map((p) => [p.id, mission.startNodeId]));
  const party: PartyState = {
    players: state.party.players.map((p) =>
      p.destroyed
        ? { ...p, destroyed: false, ship: restoreCockpit(content, p.ship, config.startEnergy) }
        : p,
    ),
  };
  return log(
    {
      ...state,
      sector: state.sector + 1,
      mission,
      party,
      phase: 'map',
      combat: null,
      prompt: null,
      split: false,
      awaitingMove: party.players.slice(0, 1).map((p) => p.id),
    },
    `Sector ${state.sector + 1}: new mission generated.`,
    'system',
  );
}
