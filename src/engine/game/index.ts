import type { BoardNode } from '../types/board';
import type { Battle, DownAction, SideRef } from '../types/combat';
import type { GameConfig } from '../types/config';
import type { EnemyInstance } from '../types/enemy';
import type { CardId, NodeId, PlayerId, SlotIndex } from '../types/ids';
import type { PartyState, PlayerState } from '../types/player';
import type { GameState, Loadout, LogEntry, LogTone } from '../types/game';
import { isEvent, isItem } from '../types/card';
import type { Content } from '../content';
import { cardOf, partOf } from '../content';
import type { Rng } from '../rng';
import * as deck from '../deck';
import * as board from '../board';
import * as combat from '../combat';
import * as loot from '../loot';
import type { LootChoice } from '../loot';
import { chooseEnemyAction } from '../ai';
import {
  canAttachAt,
  chargeSlot,
  createShip,
  detachPart,
  equipPart,
  firstAttachableSlot,
  spawnEnemyShip,
  swapCockpit,
  swapSlots,
} from '../ship';

/**
 * The run orchestrator: the piece that turns the subsystems into an actual
 * playable round.
 *
 * Everything is a pure `(state, …) → state` step so the Zustand store is a
 * thin shell and a headless sweep can drive the same functions in a loop.
 */

export type { Loadout };

// ---------------------------------------------------------------- logging

function log(state: GameState, text: string, tone: LogTone = 'info', actor?: string): GameState {
  const entry: LogEntry = {
    id: state.logCounter + 1,
    round: state.combat?.round ?? 0,
    text,
    tone,
    ...(actor ? { actor } : {}),
  };
  return { ...state, log: [...state.log, entry], logCounter: entry.id };
}

function logAll(state: GameState, lines: string[], tone: LogTone = 'info'): GameState {
  return lines.reduce((s, line) => log(s, line, tone), state);
}

/** Fold new combat-transcript lines into the run log so there's one stream. */
function absorbCombatLog(state: GameState, battle: Battle, from: number): GameState {
  const base: GameState = { ...state, party: battle.party, combat: battle.combat };
  return battle.combat.log
    .slice(from)
    .reduce<GameState>(
      (s, entry) => log(s, entry.message, entry.tone ?? 'info', sideLabel(battle, entry.side)),
      base,
    );
}

function sideLabel(battle: Battle, side: SideRef): string {
  return combat.sideName(battle, side);
}

const battleOf = (state: GameState): Battle | null =>
  state.combat ? { party: state.party, combat: state.combat } : null;

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
    parts: deck.buildDeck('parts', content.all.filter((c) => c.kind === 'part'), config.maxRarityNow, rng),
    items: deck.buildDeck('items', content.all.filter(isItem), config.maxRarityNow, rng),
    events: deck.buildDeck('events', content.all.filter(isEvent), config.maxRarityNow, rng),
  };

  // With draws configured the seats build their own ships off the deck; at 0
  // the authored loadouts roll out as-is, which is the quick way into a fight.
  const draws = Math.max(0, Math.floor(config.startingPartsDraws));
  const drafting = draws > 0;

  const players: PlayerState[] = seats.map((seat) =>
    buildPlayer(content, config, seat, drafting ? [] : seat.partIds),
  );

  const party: PartyState = { players, activePlayerIndex: 0 };
  const mission = board.generateMission(seed, sector, config, rng, Object.values(content.enemies));
  mission.positions = Object.fromEntries(players.map((p) => [p.id, mission.startNodeId]));

  const state: GameState = {
    seed,
    sector,
    phase: drafting ? 'setup' : 'map',
    mission,
    party,
    decks,
    combat: null,
    maxRarityNow: config.maxRarityNow,
    prompt: null,
    setup: drafting
      ? {
          drawsLeft: Object.fromEntries(players.map((p) => [p.id, draws])),
          anchored: [],
          lastDrawn: null,
          lastDrawnBy: null,
        }
      : null,
    log: [],
    logCounter: 0,
    split: false,
    // Moving together, one seat's choice moves everyone. Nobody moves until
    // the ships are built.
    awaitingMove: drafting || !players[0] ? [] : [players[0].id],
    seenEnemies: [],
  };

  const opened = log(
    state,
    `Sector ${sector} mission generated from seed ${seed}: ${mission.length} steps to the boss.`,
    'system',
  );

  return drafting
    ? log(
        opened,
        `Setup: ${players.length} seat(s) draft ${draws} part(s) each off the Parts deck, one card at a time.`,
        'system',
      )
    : opened;
}

function buildPlayer(
  content: Content,
  config: GameConfig,
  seat: Loadout,
  partIds: CardId[] = seat.partIds,
): PlayerState {
  let ship = createShip(content, seat.cockpitId, seat.shipName, config);
  for (const partId of partIds) {
    const free = firstAttachableSlot(ship);
    if (free < 0) break;
    ship = equipPart(ship, free, partId);
    // Ships roll out with their pools charged; an empty grid can't open a fight.
    const cap = partOf(content, partId)?.energyCapacity ?? 0;
    ship = chargeSlot(content, ship, free, cap).ship;
  }
  return {
    id: seat.id,
    label: seat.label,
    accent: seat.accent,
    shipId: ship.id,
    ship,
    ap: config.maxAp,
    apMax: config.maxAp,
    downsUsed: 0,
    damageThisDownSet: 0,
    energy: 0,
    thresholdBonus: 0,
    powerPenalty: 0,
    scrapDeck: [],
    hand: [],
    carriedParts: [],
    destroyed: false,
  };
}

// ---------------------------------------------------------------- the draft

/** Swap one seat out for an updated copy. */
function withPlayer(
  state: GameState,
  playerId: PlayerId,
  fn: (player: PlayerState) => PlayerState,
): GameState {
  return {
    ...state,
    party: {
      ...state.party,
      players: state.party.players.map((p) => (p.id === playerId ? fn(p) : p)),
    },
  };
}

/**
 * The seat on the clock.
 *
 * Draws go round the table rather than seat by seat, because the Parts deck is
 * shared: whoever still owes the most draws goes next, ties broken by seat
 * order. Null once every seat has spent its draws.
 */
export function nextDrafter(state: GameState): PlayerId | null {
  const setup = state.setup;
  if (!setup) return null;

  let onTheClock: PlayerId | null = null;
  let mostLeft = 0;
  for (const player of state.party.players) {
    const left = setup.drawsLeft[player.id] ?? 0;
    if (left > mostLeft) {
      onTheClock = player.id;
      mostLeft = left;
    }
  }
  return onTheClock;
}

/** Draws still owed by a seat. */
export const drawsLeftFor = (state: GameState, playerId: PlayerId): number =>
  state.setup?.drawsLeft[playerId] ?? 0;

/** Pull the next card off the Parts deck, one at a time, for one seat. */
export function drawStartingPart(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  playerId?: PlayerId,
): GameState {
  const setup = state.setup;
  if (state.phase !== 'setup' || !setup) return state;
  const who = playerId ?? nextDrafter(state);
  if (!who || (setup.drawsLeft[who] ?? 0) <= 0) return state;

  const pull = deck.draw(state.decks.parts, 1, rng);
  const cardId = pull.drawn[0];
  const spent = { ...setup.drawsLeft, [who]: (setup.drawsLeft[who] ?? 0) - 1 };
  let next: GameState = { ...state, decks: { ...state.decks, parts: pull.deck } };

  if (!cardId) {
    // Deck and discard both dry: zero the seat out so the draft can still end.
    return log(
      { ...next, setup: { ...setup, drawsLeft: { ...spent, [who]: 0 } } },
      'The Parts deck is dry — nothing left to draft.',
      'system',
    );
  }

  const part = partOf(content, cardId);
  next = withPlayer(next, who, (p) => ({ ...p, carriedParts: [...p.carriedParts, cardId] }));
  next = { ...next, setup: { ...setup, drawsLeft: spent, lastDrawn: cardId, lastDrawnBy: who } };
  next = log(next, `${seatLabel(next, who)} draws ${part?.name ?? cardId}.`, 'loot');

  // A cockpit is what sets slot capacity, so the first one a seat draws takes
  // the hull over immediately — assemble into the grid you're going to fly.
  if (part?.partType === 'cockpit' && !setup.anchored.includes(who)) {
    next = installCockpit(content, next, config, who, cardId);
  }
  return next;
}

/** Re-anchor a seat's ship on a drafted cockpit. */
export function installCockpit(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  cardId: CardId,
): GameState {
  const setup = state.setup;
  const player = state.party.players.find((p) => p.id === playerId);
  const part = partOf(content, cardId);
  if (!setup || !player || part?.partType !== 'cockpit') return state;

  const held = player.carriedParts.indexOf(cardId);
  if (held < 0) return state;

  const { ship, displaced } = swapCockpit(content, player.ship, cardId, config);
  const hold = player.carriedParts.slice();
  hold.splice(held, 1);
  hold.push(...displaced);
  // A cockpit the seat drafted goes back in the hold when it's replaced. The
  // hull it started the run with was never a card, so it just goes away.
  if (setup.anchored.includes(playerId)) hold.push(player.ship.cockpitId);

  let next = withPlayer(state, playerId, (p) => ({ ...p, ship, carriedParts: hold }));
  next = {
    ...next,
    setup: {
      ...setup,
      anchored: setup.anchored.includes(playerId)
        ? setup.anchored
        : [...setup.anchored, playerId],
    },
  };
  return log(
    next,
    `${seatLabel(next, playerId)} anchors on ${part.name} — ${ship.slots.length} slots.` +
      (displaced.length > 0 ? ` ${displaced.length} module(s) back into the hold.` : ''),
    'system',
  );
}

/** Fit a drafted part into the grid. A negative slot takes the first free one. */
export function assemblePart(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  cardId: CardId,
  slot: SlotIndex,
): GameState {
  const player = state.party.players.find((p) => p.id === playerId);
  if (state.phase !== 'setup' || !player) return state;

  const held = player.carriedParts.indexOf(cardId);
  const part = partOf(content, cardId);
  if (held < 0 || !part) return state;
  if (part.partType === 'cockpit') {
    return installCockpit(content, state, config, playerId, cardId);
  }

  const target = slot >= 0 ? slot : firstAttachableSlot(player.ship);
  if (target < 0 || target >= player.ship.slots.length) return state;
  const occupant = player.ship.slots[target]?.partId ?? null;
  if (occupant === player.ship.cockpitId) return state; // the anchor stays put
  // Empty positions have to touch the hull; occupied ones are a straight swap.
  if (!occupant && !canAttachAt(player.ship, target)) return state;

  const hold = player.carriedParts.slice();
  hold.splice(held, 1);
  if (occupant) hold.push(occupant);

  const next = withPlayer(state, playerId, (p) => ({
    ...p,
    ship: equipPart(p.ship, target, cardId),
    carriedParts: hold,
  }));
  return log(
    next,
    `${seatLabel(next, playerId)} fits ${part.name}` +
      (occupant
        ? `, pulling ${partOf(content, occupant)?.name ?? occupant} back into the hold.`
        : '.'),
    'loot',
  );
}

/**
 * Move a module to another position on its own grid, or swap two.
 *
 * Free rearrangement is the point: adjacency pays (GEN→RDS→WPN chains, and
 * every reroute), so a seat should be able to lay its grid out deliberately
 * rather than take whatever order the parts arrived in.
 */
export function moveModule(
  content: Content,
  state: GameState,
  playerId: PlayerId,
  from: SlotIndex,
  to: SlotIndex,
): GameState {
  const player = state.party.players.find((p) => p.id === playerId);
  if (!player || !canEditShip(state)) return state;

  const ship = player.ship;
  const source = ship.slots[from];
  const target = ship.slots[to];
  if (!source?.partId || !target || from === to) return state;
  if (source.partId === ship.cockpitId || target.partId === ship.cockpitId) return state;
  // Landing on an empty position still has to touch the hull — and the module
  // being moved doesn't get to anchor itself.
  if (!target.partId && !canAttachAt(ship, to, from)) return state;

  const moved = partOf(content, source.partId)?.name ?? source.partId;
  const displaced = partOf(content, target.partId)?.name;
  const next = withPlayer(state, playerId, (p) => ({ ...p, ship: swapSlots(p.ship, from, to) }));
  return log(
    next,
    `${seatLabel(next, playerId)} moves ${moved}` +
      (displaced ? `, swapping it with ${displaced}.` : ' across the grid.'),
    'loot',
  );
}

/** Phases where a seat may lay out its own grid. */
const canEditShip = (state: GameState): boolean =>
  state.phase === 'setup' ||
  state.phase === 'rearrange' ||
  state.phase === 'map' ||
  state.phase === 'victory';

/** Take a module back off the grid while assembling. */
export function returnPart(
  content: Content,
  state: GameState,
  playerId: PlayerId,
  slot: SlotIndex,
): GameState {
  const player = state.party.players.find((p) => p.id === playerId);
  if (state.phase !== 'setup' || !player) return state;

  const { ship, partId } = detachPart(player.ship, slot);
  if (!partId) return state;

  const next = withPlayer(state, playerId, (p) => ({
    ...p,
    ship,
    carriedParts: [...p.carriedParts, partId],
  }));
  return log(
    next,
    `${seatLabel(next, playerId)} pulls ${partOf(content, partId)?.name ?? partId} back into the hold.`,
    'loot',
  );
}

/**
 * Close the draft and put the party on the board.
 *
 * Pools go out charged, the same as a ship that rolls out of `newRun`.
 * Whatever didn't get fitted goes into the Scrap Deck up to its cap — that's
 * the pool a rearrangement point spends, so a spare stays reachable — and the
 * overflow is shuffled back into the Parts deck rather than hoarded.
 */
export function startMission(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
): GameState {
  if (state.phase !== 'setup') return state;

  const returned: CardId[] = [];
  const players = state.party.players.map((player) => {
    let ship = player.ship;
    for (const { index, partId } of player.ship.slots) {
      if (!partId || partId === ship.cockpitId) continue;
      ship = chargeSlot(content, ship, index, partOf(content, partId)?.energyCapacity ?? 0).ship;
    }
    // Read the cap off the assembled ship: a fitted Cargo Bay raises it.
    const room = Math.max(0, loot.scrapCapacity(content, { ...player, ship }, config) - player.scrapDeck.length);
    returned.push(...player.carriedParts.slice(room));
    return {
      ...player,
      ship,
      scrapDeck: [...player.scrapDeck, ...player.carriedParts.slice(0, room)],
      carriedParts: [],
    };
  });

  let next: GameState = {
    ...state,
    phase: 'map',
    setup: null,
    party: { ...state.party, players },
    decks: { ...state.decks, parts: deck.returnToDeck(state.decks.parts, returned, rng) },
    awaitingMove: players[0] ? [players[0].id] : [],
  };
  next = log(
    next,
    `Ships assembled — ${players
      .map((p) => `${p.label} ${moduleCount(p)} module(s)`)
      .join(', ')}. Mission starts.`,
    'system',
  );
  const hoarded = players.reduce((sum, p) => sum + p.scrapDeck.length, 0);
  if (hoarded > 0 || returned.length > 0) {
    next = log(
      next,
      `${hoarded} spare part(s) carried in the Scrap Deck` +
        (returned.length > 0
          ? `; ${returned.length} over the cap shuffled back into the Parts deck.`
          : '.'),
      'system',
    );
  }
  return next;
}

const moduleCount = (player: PlayerState): number =>
  player.ship.slots.filter((s) => s.partId && s.partId !== player.ship.cockpitId).length;

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
 * Move a seat (or the whole party when not split) onto a node, then resolve
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
  if (state.phase !== 'map') return state;
  const target = board.nodeById(state.mission, nodeId);
  if (!target) return state;

  let next = state;
  if (state.split) {
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
    for (const id of movers) mission = board.movePlayer(mission, id, nodeId);
    next = { ...next, mission, awaitingMove: [] };
  }

  if (next.awaitingMove.length > 0) return next; // still waiting on other seats
  return resolveNextNode(content, next, config, rng);
}

const livingPlayers = (state: GameState): PlayerState[] =>
  state.party.players.filter((p) => !p.destroyed);

/** Resolve the first occupied step that hasn't been triggered yet. */
export function resolveNextNode(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
): GameState {
  const occupied = board
    .occupiedNodes(state.mission)
    .map((id) => board.nodeById(state.mission, id))
    .filter((n): n is BoardNode => !!n && !n.resolved);

  const node = occupied[0];
  if (!node) return readyForNextMove(state);
  return enterNode(content, state, config, rng, node);
}

/** Hand control back to the map and ask every living seat for a move. */
function readyForNextMove(state: GameState): GameState {
  const alive = livingPlayers(state);
  if (alive.length === 0) return { ...state, phase: 'defeat' };

  const atBoss = alive.every((p) => state.mission.positions[p.id] === state.mission.bossNodeId);
  const bossNode = board.nodeById(state.mission, state.mission.bossNodeId);
  if (atBoss && bossNode?.resolved) return { ...state, phase: 'victory', prompt: null };

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
  const here = board.playersAt(state.mission, node.id);
  let next = log(
    state,
    `${here.map((id) => seatLabel(state, id)).join(' + ') || 'The party'} enters ${node.id} — ${node.type.toUpperCase()}.`,
    'system',
  );

  switch (node.type) {
    case 'start':
    case 'empty':
      next = log(next, 'Empty space. Nothing here but the hum of the drive.', 'info');
      return readyForNextMove(markResolved(next, node.id));

    case 'combat':
    case 'boss':
      return startFight(content, next, config, rng, node, here);

    case 'loot': {
      const pull = deck.draw(next.decks.items, Math.max(0, config.lootPerNode), rng);
      next = { ...next, decks: { ...next.decks, items: pull.deck } };
      next = markResolved(next, node.id);
      if (pull.drawn.length === 0) {
        next = log(next, 'The Items deck is dry — nothing to salvage.', 'loot');
        return readyForNextMove(next);
      }
      return {
        ...log(next, `Loot: ${pull.drawn.map((id) => cardOf(content, id)?.name ?? id).join(', ')}.`, 'loot'),
        phase: 'reward',
        prompt: { kind: 'reward', cardIds: pull.drawn, nodeId: node.id },
      };
    }

    case 'event': {
      const pull = deck.draw(next.decks.events, 1, rng);
      next = { ...next, decks: { ...next.decks, events: pull.deck } };
      const cardId = pull.drawn[0];
      next = markResolved(next, node.id);
      if (!cardId) {
        next = log(next, 'The Events deck is dry.', 'info');
        return readyForNextMove(next);
      }
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

const seatLabel = (state: GameState, id: PlayerId): string =>
  state.party.players.find((p) => p.id === id)?.label ?? id;

// ---------------------------------------------------------------- combat

function startFight(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  node: BoardNode,
  participants: PlayerId[],
): GameState {
  const statBlock =
    (node.enemyId ? content.enemies[node.enemyId] : undefined) ??
    Object.values(content.enemies).find((e) => !!e.isBoss === (node.type === 'boss'));
  if (!statBlock) return readyForNextMove(markResolved(state, node.id));

  const spawn = spawnEnemyShip(content, statBlock, state.decks.parts, config, rng);
  const enemy: EnemyInstance = spawn.enemy;

  let next: GameState = {
    ...state,
    decks: { ...state.decks, parts: spawn.partsDeck },
    seenEnemies: [...state.seenEnemies, statBlock.id],
  };
  next = log(
    next,
    `${enemy.name} spins up: ${enemy.hpMax} hull, threshold ${enemy.convThreshold}, ` +
      `${enemy.ship.slots.filter((s) => s.partId && s.partId !== enemy.ship.cockpitId).length} modules.`,
    'system',
  );

  const seats = participants.length > 0 ? participants : livingPlayers(next).map((p) => p.id);
  const battle = combat.startCombat(content, next.party, [enemy], seats, config);
  next = absorbCombatLog({ ...next, party: battle.party, combat: battle.combat }, battle, 0);
  return { ...next, phase: 'combat', prompt: null };
}

export const activeSide = (state: GameState): SideRef | undefined =>
  state.combat ? combat.currentSide(state.combat) : undefined;

export const isPlayerTurn = (state: GameState): boolean => activeSide(state)?.kind === 'player';

/** Spend one of the active side's downs. */
export function takeDown(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  action: DownAction,
): { state: GameState; error?: string } {
  const battle = battleOf(state);
  const side = activeSide(state);
  if (!battle || !side) return { state };

  const before = battle.combat.log.length;
  const { battle: after, result } = combat.resolveDown(content, battle, config, side, action, rng);
  if (result.illegal) return { state, error: result.illegal };

  let next = absorbCombatLog(state, after, before);

  // Downs exhausted with no conversion — the turn passes on its own.
  const downs = combat.downsFor(after.combat, side);
  if (downs && combat.setExhausted(downs)) next = endTurn(content, next, config).state;

  return { state: settleCombat(next) };
}

/** Close the current set: convert into a fresh one, or pass the turn. */
export function endTurn(
  content: Content,
  state: GameState,
  config: GameConfig,
): { state: GameState; converted: boolean } {
  const battle = battleOf(state);
  if (!battle) return { state, converted: false };
  const before = battle.combat.log.length;
  const { battle: after, converted } = combat.advanceTurn(content, battle, config);
  return { state: absorbCombatLog(state, after, before), converted };
}

/** Run one enemy down. The caller decides how fast to step through them. */
export function enemyStep(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
): GameState {
  const battle = battleOf(state);
  const side = activeSide(state);
  if (!battle || !side || side.kind !== 'enemy' || state.combat?.outcome) return state;

  const action = chooseEnemyAction(content, battle, config, side, rng);
  const before = battle.combat.log.length;
  const { battle: after, result } = combat.resolveDown(content, battle, config, side, action, rng);

  // A refused action would loop forever — burn the down instead.
  const resolved = result.illegal
    ? combat.resolveDown(content, battle, config, side, { type: 'pass' }, rng)
    : { battle: after, result };

  let next = absorbCombatLog(state, resolved.battle, before);
  const downs = combat.downsFor(resolved.battle.combat, side);
  if (downs && combat.setExhausted(downs)) next = endTurn(content, next, config).state;
  return settleCombat(next);
}

/** Victory/defeat bookkeeping once a fight has resolved. */
function settleCombat(state: GameState): GameState {
  const outcome = state.combat?.outcome;
  if (!outcome || !state.combat) return state;

  if (outcome === 'defeat') {
    return { ...log(state, 'The party is wiped. Mission over.', 'system'), phase: 'defeat', prompt: null };
  }

  const wrecks = state.combat.wrecks;
  const node = currentCombatNode(state);
  let next = log(state, 'All hostiles down. Loot phase.', 'system');
  if (node) next = markResolved(next, node.id);

  if (wrecks.length === 0) return readyForNextMove(next);
  return {
    ...next,
    phase: 'loot',
    prompt: {
      kind: 'loot',
      wreck: wrecks[0]!,
      // A destroyed seat doesn't get to pick over the wreck.
      claimants: claimantsIn(next, state.combat.participants),
      claimedBy: [],
    },
  };
}

const claimantsIn = (state: GameState, ids: PlayerId[]): PlayerId[] =>
  ids.filter((id) => !state.party.players.find((p) => p.id === id)?.destroyed);

function currentCombatNode(state: GameState): BoardNode | undefined {
  const occupied = board.occupiedNodes(state.mission);
  return state.mission.nodes.find(
    (n) => occupied.includes(n.id) && !n.resolved && (n.type === 'combat' || n.type === 'boss'),
  );
}

// ---------------------------------------------------------------- prompts

/** Loot phase A/B (or walk away), resolved by one seat on the party's behalf. */
export function resolveLoot(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  playerId: PlayerId,
  choice: LootChoice,
): GameState {
  if (state.prompt?.kind !== 'loot') return state;
  const player = state.party.players.find((p) => p.id === playerId);
  if (!player) return state;

  const result = loot.resolveLootChoice(content, player, state.prompt.wreck, choice, config);
  let next: GameState = {
    ...state,
    party: {
      ...state.party,
      players: state.party.players.map((p) => (p.id === playerId ? result.player : p)),
    },
    decks: {
      ...state.decks,
      parts: deck.returnToDeck(state.decks.parts, result.returnedToPartsDeck, rng),
    },
  };
  next = logAll(next, result.log, 'loot');

  const remaining = (next.combat?.wrecks ?? []).slice(1);
  next = { ...next, combat: next.combat ? { ...next.combat, wrecks: remaining } : null };

  if (remaining.length > 0) {
    return {
      ...next,
      prompt: {
        kind: 'loot',
        wreck: remaining[0]!,
        claimants: claimantsIn(next, next.combat?.participants ?? []),
        claimedBy: [],
      },
    };
  }

  const bossDown = state.prompt.wreck.isBoss;
  if (bossDown) {
    return {
      ...log(next, 'Boss down — mission complete. Strip the wreck and rebuild.', 'system'),
      phase: 'rearrange',
      combat: null,
      prompt: { kind: 'rearrange', reason: 'mission-end' },
    };
  }
  return readyForNextMove(next);
}

/** Take the Item cards a Loot step handed out into hands, up to hand size. */
export function claimReward(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
): GameState {
  if (state.prompt?.kind !== 'reward') return state;
  const player = state.party.players.find((p) => p.id === playerId);
  if (!player) return state;

  const room = Math.max(0, config.handSize - player.hand.length);
  const taken = state.prompt.cardIds.slice(0, room);
  const spilled = state.prompt.cardIds.slice(room);

  let next: GameState = {
    ...state,
    party: {
      ...state.party,
      players: state.party.players.map((p) =>
        p.id === playerId ? { ...p, hand: [...p.hand, ...taken] } : p,
      ),
    },
    decks: { ...state.decks, items: deck.discard(state.decks.items, spilled) },
  };
  next = log(
    next,
    `${player.label} takes ${taken.map((id) => cardOf(content, id)?.name ?? id).join(', ') || 'nothing'}` +
      (spilled.length ? ` — ${spilled.length} card(s) over hand size, discarded.` : '.'),
    'loot',
  );
  return readyForNextMove(next);
}

/** Resolve the face-up Event card. */
export function resolveEvent(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
): GameState {
  if (state.prompt?.kind !== 'event') return state;
  const { cardId, nodeId } = state.prompt;
  const card = cardOf(content, cardId);
  let next: GameState = {
    ...state,
    decks: { ...state.decks, events: deck.discard(state.decks.events, [cardId]) },
  };
  if (!card || card.kind !== 'event') return readyForNextMove(next);

  if (card.placesMarker) {
    const marker = card.marker ?? card.name;
    next = {
      ...next,
      mission: board.addMarker(next.mission, nodeId, marker),
    };
    next = log(next, `${marker} marker placed on ${nodeId}.`, 'info');
  }

  if (card.hullDamage) {
    const here = board.playersAt(next.mission, nodeId);
    next = {
      ...next,
      party: {
        ...next.party,
        players: next.party.players.map((p) =>
          here.includes(p.id)
            ? {
                ...p,
                ship: { ...p.ship, hp: Math.max(0, p.ship.hp - card.hullDamage!) },
                destroyed: p.ship.hp - card.hullDamage! <= 0,
              }
            : p,
        ),
      },
    };
    next = log(next, `${card.name} deals ${card.hullDamage} hull to everyone here.`, 'damage');
  }

  if (card.grantsLoot) {
    const pull = deck.draw(next.decks.items, card.grantsLoot, rng);
    next = { ...next, decks: { ...next.decks, items: pull.deck } };
    if (pull.drawn.length > 0) {
      next = log(next, `${card.name} pays out: ${pull.drawn.map((id) => cardOf(content, id)?.name ?? id).join(', ')}.`, 'loot');
      return {
        ...next,
        phase: 'reward',
        prompt: { kind: 'reward', cardIds: pull.drawn, nodeId },
      };
    }
  }

  if (card.spawnsCombat) {
    const node = board.nodeById(next.mission, nodeId);
    if (node) {
      return startFight(
        content,
        { ...next, prompt: null },
        config,
        rng,
        { ...node, type: 'combat' },
        board.playersAt(next.mission, nodeId),
      );
    }
  }

  return readyForNextMove(next);
}

/** Crossing a checkpoint: raise the ceiling, fold the new tiers into the decks. */
function crossCheckpoint(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
  node: BoardNode,
): GameState {
  const newMax = Math.min(5, node.raisesRarityTo ?? state.maxRarityNow + config.rarityPerCheckpoint);
  let next = markResolved(state, node.id);
  let unlockedTotal = 0;

  const decks = { ...next.decks };
  for (const id of ['parts', 'items', 'events'] as const) {
    const applied = deck.applyCheckpoint(decks[id], content.cards, newMax, rng);
    decks[id] = applied.deck;
    unlockedTotal += applied.unlocked.length;
  }

  next = { ...next, decks, maxRarityNow: newMax };
  next = log(
    next,
    `Checkpoint crossed — rarity ceiling now ${newMax}. ${unlockedTotal} card(s) join the decks.`,
    'system',
  );

  return {
    ...next,
    phase: 'rearrange',
    prompt: node.isRearrangePoint
      ? { kind: 'rearrange', reason: 'checkpoint' }
      : { kind: 'checkpoint', nodeId: node.id, newMaxRarity: newMax },
  };
}

/** Slot a hoarded module at a rearrangement point. */
export function applyRearrange(
  content: Content,
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  cardId: CardId,
  slot: number,
): GameState {
  const player = state.party.players.find((p) => p.id === playerId);
  if (!player) return state;
  const result = loot.rearrange(content, player, [{ cardId, slot }], config);
  const next: GameState = {
    ...state,
    party: {
      ...state.party,
      players: state.party.players.map((p) => (p.id === playerId ? result.player : p)),
    },
  };
  return logAll(next, result.log, 'loot');
}

/** Rules open question #2, made playable: buy threshold, pay in power. */
export function buyThreshold(
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
): GameState {
  const player = state.party.players.find((p) => p.id === playerId);
  if (!player) return state;
  const result = loot.buyThresholdUpgrade(player, config);
  const next: GameState = {
    ...state,
    party: {
      ...state.party,
      players: state.party.players.map((p) => (p.id === playerId ? result.player : p)),
    },
  };
  return logAll(next, result.log, 'system');
}

/** Leave a checkpoint/rearrange screen and get back on the board. */
export function closePrompt(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
): GameState {
  if (state.prompt?.kind === 'rearrange' && state.prompt.reason === 'mission-end') {
    return { ...state, phase: 'victory', prompt: null };
  }
  const cleared = { ...state, prompt: null };
  return resolveNextNode(content, cleared, config, rng);
}

/** Repair between missions is out of scope; this is the next-sector hook. */
export function nextMission(
  content: Content,
  state: GameState,
  config: GameConfig,
  rng: Rng,
): GameState {
  const mission = board.generateMission(state.seed + 1, state.sector + 1, config, rng, Object.values(content.enemies));
  mission.positions = Object.fromEntries(
    state.party.players.map((p) => [p.id, mission.startNodeId]),
  );
  const revived: PartyState = {
    ...state.party,
    players: state.party.players.map((p) => ({
      ...p,
      destroyed: false,
      ship: { ...p.ship, hp: p.ship.hpMax, flags: { negateNext: 0, retaliate: 0 } },
    })),
  };
  return log(
    {
      ...state,
      sector: state.sector + 1,
      mission,
      party: revived,
      phase: 'map',
      combat: null,
      prompt: null,
      awaitingMove: state.split
        ? revived.players.map((p) => p.id)
        : revived.players.slice(0, 1).map((p) => p.id),
      seenEnemies: [],
    },
    `Sector ${state.sector + 1}: new mission generated.`,
    'system',
  );
}
