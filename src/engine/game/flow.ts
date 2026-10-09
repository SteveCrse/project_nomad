import type { BoardNode } from '../types/board';
import type { DownAction } from '../types/combat';
import type { GameConfig } from '../types/config';
import type { EnemyInstance } from '../types/enemy';
import type { CardId, NodeId, PlayerId } from '../types/ids';
import type { GameState } from '../types/game';
import type { Content } from '../content';
import { cardOf, partOf } from '../content';
import type { Rng } from '../rng';
import * as deck from '../deck';
import * as board from '../board';
import * as combat from '../combat';
import * as loot from '../loot';
import { planEnemyAction } from '../ai';
import { compactShip, modulesOf, spawnBoss, spawnEnemy } from '../ship';
import { absorbCombat, battleOf, combatMark, livingPlayers, log, playerIn, seatLabel } from './shared';
import { readyForNextMove, markResolved, currentCombatNode, crossCheckpoint } from './nodes';
import { salvageTurn } from './salvage';

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

// ---------------------------------------------------------------- combat

export function startFight(
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
