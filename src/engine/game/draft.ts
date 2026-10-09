import type { GameConfig } from '../types/config';
import type { CardId, PlayerId, SlotIndex } from '../types/ids';
import type { PartCard } from '../types/card';
import type { PlayerState } from '../types/player';
import type { Cell, Ship } from '../types/ship';
import type { GameState, SetupState } from '../types/game';
import type { Content } from '../content';
import { partOf } from '../content';
import type { Rng } from '../rng';
import * as deck from '../deck';
import * as loot from '../loot';
import { autoDraftPick } from '../ai';
import { attackOf, powerCostOf } from '../cards';
import {
  arrangeShip,
  bestCell,
  canMoveTo,
  canPlaceAt,
  createShip,
  editAllowed,
  hasRoomFor,
  maxEnergyOf,
  modulesOf,
  moveModule as moveOnGrid,
  placeModule,
  removeModule,
  roomIn,
  sizeLimit,
} from '../ship';
import { log, logAll, playerIn, seatLabel, withPlayer } from './shared';

/**
 * The draft — the rules' Player Setup, paid for in energy tokens.
 *
 *   1. Every seat starts with `draftTokens` energy tokens.
 *   2. Cockpit round: seats + 1 cockpits face up, one each in seat order. Free.
 *   3. `draftRounds` module rounds: seats-still-drafting + 1 modules face up.
 *      On its turn a seat buys one with tokens (cost 1–3, rarer being dearer)
 *      or passes. The cards nobody took go back to their deck.
 *   4. Pick order reverses every round.
 *   5. Lay the ships out by the layout rules, and put the tokens nobody spent
 *      on the modules as their starting ⚡ — anywhere, up to each module's max.
 *
 * Every token is a choice between a better ship and a charged one.
 */

const seatIds = (state: GameState): PlayerId[] => state.party.players.map((p) => p.id);

/** Round 0 runs in seat order, round 1 reversed, and so on. */
function snakeOrder(state: GameState, round: number, done: PlayerId[]): PlayerId[] {
  const seats = seatIds(state).filter((id) => !done.includes(id));
  return round % 2 === 0 ? seats : seats.reverse();
}

/** The seat on the clock, or null between rounds and once the draft is over. */
export function nextDrafter(state: GameState): PlayerId | null {
  const setup = state.setup;
  if (state.phase !== 'setup' || !setup || setup.complete) return null;
  return setup.order.find((id) => !setup.picked.includes(id) && !setup.done.includes(id)) ?? null;
}

/** Every card a seat has drafted, wherever it's ended up — the cockpit aside. */
export function draftedModules(content: Content, player: PlayerState): PartCard[] {
  return [...modulesOf(player.ship).map((s) => s.partId), ...player.carriedParts]
    .map((id) => partOf(content, id))
    .filter((p): p is PartCard => !!p && p.role !== 'COCKPIT');
}

/** May this seat take this card off the table right now? A reason, or null. */
export function pickError(
  content: Content,
  config: GameConfig,
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
): string | null {
  const setup = state.setup;
  const player = playerIn(state, playerId);
  const part = partOf(content, cardId);
  if (!setup || !player || !part) return 'not on the table';
  if (!setup.table.includes(cardId)) return 'not on the table';
  if (setup.round === 0) return part.role === 'COCKPIT' ? null : 'the cockpit round only deals cockpits';
  if (part.role === 'COCKPIT') return 'module rounds only deal modules';
  if (powerCostOf(part) > player.tokens) return `costs ${powerCostOf(part)} tokens — ${player.tokens} left`;
  if (config.shipSizeRule === 'slots' && draftedModules(content, player).length >= sizeLimit(content, player.ship, 'slots')) {
    return 'every slot on the cockpit is taken';
  }
  return null;
}

/** Can this seat never draft again: out of tokens, or a full ship? */
function seatFull(content: Content, config: GameConfig, player: PlayerState): boolean {
  if (player.tokens <= 0) return true;
  const limit = sizeLimit(content, player.ship, config.shipSizeRule);
  const drafted = draftedModules(content, player);
  switch (config.shipSizeRule) {
    case 'draft':
      return false;
    case 'slots':
      return drafted.length >= limit;
    case 'budget':
      return drafted.reduce((sum, p) => sum + powerCostOf(p), 0) >= limit;
  }
}

const emptySetup = (): SetupState => ({
  round: 0,
  table: [],
  order: [],
  picked: [],
  passed: [],
  done: [],
  complete: false,
  lastPicked: null,
  lastPickedBy: null,
});

/** Hand every seat its tokens and deal the cockpit round. */
export function openDraft(content: Content, config: GameConfig, state: GameState, rng: Rng): GameState {
  const tokens = Math.max(0, config.draftTokens);
  const funded: GameState = {
    ...state,
    setup: emptySetup(),
    party: { ...state.party, players: state.party.players.map((p) => ({ ...p, tokens })) },
  };
  const next = log(funded, `Draft: every seat starts with ${tokens} energy tokens — what isn’t spent becomes starting ⚡.`, 'system');
  return dealRound(content, config, next, 0, rng);
}

function dealRound(
  content: Content,
  config: GameConfig,
  state: GameState,
  round: number,
  rng: Rng,
): GameState {
  const setup = state.setup!;
  if (round > Math.max(0, config.draftRounds)) return completeDraft(content, config, state);
  const order = snakeOrder(state, round, setup.done);
  if (order.length === 0) return completeDraft(content, config, state);

  const from = round === 0 ? 'cockpits' : 'parts';
  const pull = deck.draw(state.decks[from], order.length + 1, rng);
  let next: GameState = {
    ...state,
    decks: { ...state.decks, [from]: pull.deck },
    setup: { ...setup, round, table: pull.drawn, order, picked: [], passed: [] },
  };
  if (pull.drawn.length === 0) {
    next = log(next, `The ${from} deck is dry — the draft ends here.`, 'system');
    return completeDraft(content, config, next);
  }
  next = log(
    next,
    `${round === 0 ? 'Cockpit round' : `Module round ${round}/${config.draftRounds}`}: ${pull.drawn.length} card(s) face up — ` +
      `pick order ${order.map((id) => seatLabel(state, id)).join(' → ')}.`,
    'system',
  );
  return settle(content, config, next, rng);
}

/**
 * Close the round when every seat in it has had its turn: the cards nobody
 * took go back to their deck, seats that can't draft again drop out, and the
 * next round deals — reversed.
 */
function advance(content: Content, config: GameConfig, state: GameState, rng: Rng): GameState {
  if (nextDrafter(state)) return settle(content, config, state, rng);
  const setup = state.setup!;
  const from = setup.round === 0 ? 'cockpits' : 'parts';
  let next: GameState = {
    ...state,
    decks: { ...state.decks, [from]: deck.returnToDeck(state.decks[from], setup.table, rng) },
    setup: { ...setup, table: [] },
  };
  if (setup.table.length > 0) {
    next = log(next, `${setup.table.length} card(s) left on the table go back into the ${from} deck.`, 'system');
  }
  const full = setup.round === 0
    ? []
    : next.party.players.filter((p) => !setup.done.includes(p.id) && seatFull(content, config, p)).map((p) => p.id);
  for (const id of full) next = log(next, `${seatLabel(next, id)} is done drafting.`, 'system');
  next = { ...next, setup: { ...next.setup!, done: [...setup.done, ...full] } };
  return dealRound(content, config, next, setup.round + 1, rng);
}

/**
 * A seat on the clock with nothing on the table it can take passes the round
 * on its own — there's no choice to wait for.
 */
function settle(content: Content, config: GameConfig, state: GameState, rng: Rng): GameState {
  const who = nextDrafter(state);
  if (!who) return state.setup && !state.setup.complete ? advance(content, config, state, rng) : state;
  const any = state.setup!.table.some((id) => !pickError(content, config, state, who, id));
  if (any) return state;
  return pass(content, config, state, rng, who, 'nothing on the table it can take');
}

/** The seat sits this round out. Its tokens keep — they're starting ⚡ later. */
function pass(
  content: Content,
  config: GameConfig,
  state: GameState,
  rng: Rng,
  who: PlayerId,
  why: string,
): GameState {
  const setup = state.setup!;
  const next = log(
    { ...state, setup: { ...setup, picked: [...setup.picked, who], passed: [...setup.passed, who] } },
    `${seatLabel(state, who)} passes — ${why}.`,
    'system',
  );
  return advance(content, config, next, rng);
}

/**
 * Take a card off the table for the seat on the clock. A cockpit becomes the
 * seat's ship; a module is paid for in tokens and goes to the hold — or
 * straight onto the grid at `cell`, when it's dropped there.
 */
export function draftCard(
  content: Content,
  config: GameConfig,
  state: GameState,
  cardId: CardId,
  rng: Rng,
  cell?: Cell,
): GameState {
  const setup = state.setup;
  const who = nextDrafter(state);
  if (!setup || !who) return state;
  if (pickError(content, config, state, who, cardId)) return state;

  const table = setup.table.slice();
  table.splice(table.indexOf(cardId), 1);
  const part = partOf(content, cardId)!;
  const player = playerIn(state, who)!;

  let next: GameState = {
    ...state,
    setup: { ...setup, table, picked: [...setup.picked, who], lastPicked: cardId, lastPickedBy: who },
  };

  if (setup.round === 0) {
    const ship = { ...createShip(content, cardId, player.ship.name, config.draftStartEnergy), id: player.shipId };
    next = withPlayer(next, who, (p) => ({ ...p, ship }));
    next = log(next, `${seatLabel(next, who)} takes ${part.name}${limitText(config, part)}.`, 'loot');
  } else {
    const cost = powerCostOf(part);
    next = withPlayer(next, who, (p) => ({ ...p, carriedParts: [...p.carriedParts, cardId], tokens: p.tokens - cost }));
    next = log(
      next,
      `${seatLabel(next, who)} drafts ${part.name} for ${cost} token(s), ${player.tokens - cost} left — ${table.length} left on the table.`,
      'loot',
    );
    if (cell) next = assemblePart(content, config, next, who, cardId, cell);
  }
  return advance(content, config, next, rng);
}

/** What the cockpit's limit means under the size rule in play. */
function limitText(config: GameConfig, cockpit: PartCard): string {
  switch (config.shipSizeRule) {
    case 'draft':
      return '';
    case 'slots':
      return ` — ${cockpit.slots ?? 0} module slots`;
    case 'budget':
      return ` — a ${cockpit.powerRating ?? 0}-point upkeep budget`;
  }
}

/** The seat on the clock passes this module round. */
export function passDraft(content: Content, config: GameConfig, state: GameState, rng: Rng): GameState {
  const who = nextDrafter(state);
  if (!who || !state.setup || state.setup.round === 0) return state;
  return pass(content, config, state, rng, who, `keeps its ${playerIn(state, who)?.tokens ?? 0} token(s)`);
}

/** Pick for the seat on the clock — the "draft the rest" button. */
export function autoDraft(content: Content, config: GameConfig, state: GameState, rng: Rng): GameState {
  const who = nextDrafter(state);
  const setup = state.setup;
  const player = playerIn(state, who);
  if (!who || !setup || !player) return state;
  const table = setup.table.map((id) => partOf(content, id)).filter((p): p is PartCard => !!p);
  const pick = autoDraftPick(
    table,
    draftedModules(content, player),
    (p) => !pickError(content, config, state, who, p.id),
    (p) => (config.shipSizeRule === 'slots' ? (p.slots ?? 0) : config.shipSizeRule === 'budget' ? (p.powerRating ?? 0) : p.energyCapacity),
  );
  if (!pick) return passDraft(content, config, state, rng);
  return draftCard(content, config, state, pick.id, rng);
}

/**
 * The draft is over: whatever each seat still holds is laid out where the
 * layout rules allow, so the table only has to adjust, not build from
 * nothing. Anything with no legal cell or no room stays in the hold. What's
 * left is putting the leftover tokens on the ship.
 */
function completeDraft(content: Content, config: GameConfig, state: GameState): GameState {
  let next: GameState = { ...state, setup: { ...state.setup!, complete: true, table: [], order: [], picked: [], passed: [] } };
  for (const player of next.party.players) {
    if (player.carriedParts.length === 0) continue;
    const { ship, rejected } = arrangeShip(
      content,
      player.ship,
      player.carriedParts,
      config.draftStartEnergy,
      config.shipSizeRule,
    );
    next = withPlayer(next, player.id, (p) => ({ ...p, ship, carriedParts: rejected }));
  }
  const lines = next.party.players.map((p) => `${p.label} has ${p.tokens} token(s) to put on the ship as starting ⚡.`);
  next = log(next, 'Draft over — every ship is laid out. Rearrange them and place your energy, then start the mission.', 'system');
  return logAll(next, lines, 'system');
}

// ------------------------------------------------------------- arranging

/** Fit a drafted part from the hold onto a cell — or, with none given, wherever it fits best. */
export function assemblePart(
  content: Content,
  config: GameConfig,
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  cell: Cell | null,
): GameState {
  const player = playerIn(state, playerId);
  if (state.phase !== 'setup' || !player) return state;
  const held = player.carriedParts.indexOf(cardId);
  const part = partOf(content, cardId);
  if (held < 0 || !part || part.role === 'COCKPIT') return state;
  if (!hasRoomFor(content, player.ship, cardId, config.shipSizeRule)) return state;
  const at = cell ?? bestCell(content, player.ship, cardId);
  if (!at || !canPlaceAt(content, player.ship, cardId, at)) return state;

  const hold = player.carriedParts.slice();
  hold.splice(held, 1);
  const next = withPlayer(state, playerId, (p) => ({
    ...p,
    ship: placeModule(content, p.ship, cardId, at, config.draftStartEnergy),
    carriedParts: hold,
  }));
  return log(next, `${seatLabel(next, playerId)} fits ${part.name}.`, 'loot');
}

/** ⚡ every drafted module carries before any token goes on it. */
const baseEnergy = (content: Content, config: GameConfig, ship: Ship, slot: SlotIndex): number =>
  Math.min(Math.max(0, config.draftStartEnergy), maxEnergyOf(content, ship.slots[slot]));

/**
 * Take a module back off the grid into the hold while setting up. Any tokens
 * on it go back to the pool. Refused when other modules hang off it.
 */
export function returnPart(
  content: Content,
  config: GameConfig,
  state: GameState,
  playerId: PlayerId,
  slot: SlotIndex,
): GameState {
  const player = playerIn(state, playerId);
  if (state.phase !== 'setup' || !player) return state;
  const refund = Math.max(0, (player.ship.slots[slot]?.energy ?? 0) - baseEnergy(content, config, player.ship, slot));
  const { ship, partId } = removeModule(player.ship, slot);
  if (!partId || !editAllowed(content, player.ship, ship)) return state;
  const next = withPlayer(state, playerId, (p) => ({
    ...p,
    ship,
    carriedParts: [...p.carriedParts, partId],
    tokens: p.tokens + refund,
  }));
  return log(next, `${seatLabel(next, playerId)} pulls ${partOf(content, partId)?.name ?? partId} back into the hold.`, 'loot');
}

/** Move a module to another cell — swapping with whatever is there — at setup or a rearrangement point. */
export function moveModule(
  content: Content,
  state: GameState,
  playerId: PlayerId,
  from: SlotIndex,
  cell: Cell,
): GameState {
  const player = playerIn(state, playerId);
  if (!player || (state.phase !== 'setup' && state.phase !== 'rearrange')) return state;
  if (!canMoveTo(content, player.ship, from, cell)) return state;
  const moved = partOf(content, player.ship.slots[from]?.partId)?.name ?? 'module';
  const next = withPlayer(state, playerId, (p) => ({ ...p, ship: moveOnGrid(p.ship, from, cell) }));
  return log(next, `${seatLabel(next, playerId)} moves ${moved}.`, 'loot');
}

/** Why a token can't go on (or come off) this module right now, or null. */
export function energyError(
  content: Content,
  config: GameConfig,
  state: GameState,
  playerId: PlayerId,
  slot: SlotIndex,
  delta: 1 | -1,
): string | null {
  const player = playerIn(state, playerId);
  if (state.phase !== 'setup' || !state.setup?.complete) return 'energy goes on once the draft is over';
  const at = player?.ship.slots[slot];
  if (!player || !at) return 'no module there';
  if (delta > 0) {
    if (player.tokens <= 0) return 'no tokens left';
    if (roomIn(content, at) <= 0) return `${partOf(content, at.partId)?.name ?? 'It'} is full`;
    return null;
  }
  if (at.energy <= baseEnergy(content, config, player.ship, slot)) return 'no token of yours on it';
  return null;
}

/** Put one leftover token on a module as starting ⚡ — or take one back off. */
export function placeEnergy(
  content: Content,
  config: GameConfig,
  state: GameState,
  playerId: PlayerId,
  slot: SlotIndex,
  delta: 1 | -1,
): GameState {
  if (energyError(content, config, state, playerId, slot, delta)) return state;
  return withPlayer(state, playerId, (p) => {
    const slots = p.ship.slots.slice();
    slots[slot] = { ...slots[slot]!, energy: slots[slot]!.energy + delta };
    return { ...p, tokens: p.tokens - delta, ship: { ...p.ship, slots } };
  });
}

/**
 * Spread a seat's leftover tokens over its ship, one at a time round the
 * modules that use ⚡ most — guns (hardest-hitting first), the cockpit,
 * shields, generators, then the rest — until the tokens or the room run out.
 */
export function autoEnergy(content: Content, config: GameConfig, state: GameState, playerId: PlayerId): GameState {
  const player = playerIn(state, playerId);
  if (!player || state.phase !== 'setup' || !state.setup?.complete) return state;
  const rank = (role: string) => ({ WPN: 0, COCKPIT: 1, SHD: 2, GEN: 3, RDS: 4, OTH: 5 })[role] ?? 6;
  const order = player.ship.slots
    .map((s) => ({ slot: s.index, part: partOf(content, s.partId) }))
    .filter((m): m is { slot: SlotIndex; part: PartCard } => !!m.part)
    .sort((a, b) => rank(a.part.role) - rank(b.part.role) || attackOf(b.part) - attackOf(a.part))
    .map((m) => m.slot);
  let next = state;
  let placed = 0;
  for (let lap = 0; lap < 64; lap++) {
    let any = false;
    for (const slot of order) {
      const after = placeEnergy(content, config, next, playerId, slot, 1);
      if (after === next) continue;
      next = after;
      placed += 1;
      any = true;
    }
    if (!any) break;
  }
  return placed > 0 ? log(next, `${seatLabel(next, playerId)} spreads ${placed} token(s) over the ship.`, 'loot') : state;
}

/**
 * Close setup and put the party on the board. The cockpit round has to be
 * done — a seat with no cockpit has no ship. Anything still in a hold goes to
 * the scrap deck up to its cap; the rest back into the parts deck. Tokens
 * nobody placed are gone.
 */
export function startMission(content: Content, config: GameConfig, state: GameState, rng: Rng): GameState {
  const setup = state.setup;
  if (state.phase !== 'setup' || !setup) return state;
  if (!setup.complete && setup.round === 0) return state;

  const from = setup.round === 0 ? 'cockpits' : 'parts';
  let decks = { ...state.decks, [from]: deck.returnToDeck(state.decks[from], setup.table, rng) };
  const returned: CardId[] = [];
  const lines: string[] = [];
  const players = state.party.players.map((player) => {
    const room = loot.scrapRoom(content, player, config);
    const kept = player.carriedParts.slice(0, room);
    returned.push(...player.carriedParts.slice(room));
    if (kept.length > 0) lines.push(`${player.label} carries ${kept.length} spare part(s) in the scrap deck.`);
    if (player.tokens > 0) lines.push(`${player.label} leaves ${player.tokens} token(s) unplaced — they’re gone.`);
    return { ...player, scrapDeck: [...player.scrapDeck, ...kept], carriedParts: [], tokens: 0 };
  });
  decks = { ...decks, parts: deck.returnToDeck(decks.parts, returned, rng) };

  let next: GameState = {
    ...state,
    phase: 'map',
    setup: null,
    party: { ...state.party, players },
    decks,
    awaitingMove: players[0] ? [players[0].id] : [],
  };
  next = log(
    next,
    `Ships launched — ${players
      .map((p) => `${p.label} ${modulesOf(p.ship).length} module(s) on ${partOf(content, p.ship.cockpitId)?.name ?? 'a cockpit'}`)
      .join(', ')}. Mission starts.`,
    'system',
  );
  next = logAll(next, lines, 'system');
  if (setup.table.length > 0 || returned.length > 0) {
    next = log(next, `${setup.table.length + returned.length} card(s) shuffled back into their decks.`, 'system');
  }
  return next;
}
