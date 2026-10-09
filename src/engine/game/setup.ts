import type { GameConfig } from '../types/config';
import type { CardId } from '../types/ids';
import type { PartyState, PlayerState } from '../types/player';
import type { GameState, Loadout } from '../types/game';
import { isCockpit, isEvent, isItem, isModule } from '../types/card';
import type { Content } from '../content';
import type { Rng } from '../rng';
import * as deck from '../deck';
import * as board from '../board';
import { arrangeShip, createShip, restoreCockpit } from '../ship';
import { livingPlayers, log } from './shared';
import { openDraft } from './draft';

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
