import type { Battle, CombatState, DownAction, DownResult, SideRef } from '../types/combat';
import type { EnemyInstance } from '../types/enemy';
import type { Ship } from '../types/ship';
import type { GameConfig } from '../types/config';
import type { PlayerId } from '../types/ids';
import type { Content } from '../content';
import type { Rng } from '../rng';
import { ACTION_LABEL } from '../cards';
import { buildActionDecks } from '../deck';
import { isOnline, liveSlots } from '../ship';
import { playerSide, enemySide, playerOf, livingParticipants, shipOf, sideName, logged, emit, withShip } from './sides';
import { resolveDown } from './resolve';

// ---------------------------------------------------------------- turn flow

/**
 * Start of a side's turn. Nothing refills — unused energy simply carries
 * over — but a card that bleeds the ship (Infested Railgun) bleeds it now.
 */
function upkeep(content: Content, battle: Battle, side: SideRef): Battle {
  const ship = shipOf(battle, side);
  if (!ship) return battle;
  const drain = liveSlots(content, ship)
    .filter((m) => isOnline(m.slot))
    .reduce((sum, m) => sum + (m.part.drainPerTurn ?? 0), 0);
  if (drain <= 0) return battle;
  let drained = 0;
  let next = battle;
  const slots = ship.slots.map((s) => {
    if (s.destroyed || s.energy <= 0) return s;
    const taken = Math.min(s.energy, drain);
    drained += taken;
    next = emit(next, { kind: 'drain', target: { side, slot: s.index }, amount: taken });
    return { ...s, energy: s.energy - taken };
  });
  next = withShip(next, side, { ...ship, slots });
  return {
    ...next,
    combat: logged(next.combat, side, `Upkeep: an infestation bleeds ${drained}⚡ off the ship.`, 'system'),
  };
}

/** Give a seat the turn: fresh downs, then its upkeep. */
function beginPlayerTurn(content: Content, battle: Battle, id: PlayerId, round: number): Battle {
  const side = playerSide(id);
  let next: Battle = {
    ...battle,
    combat: { ...battle.combat, turn: side, down: 0, firstDowns: 0, turnOver: null, round },
  };
  next = emit(next, { kind: 'turn', side, label: `${sideName(next, side)}’s turn` });
  next = upkeep(content, next, side);
  return {
    ...next,
    combat: logged(next.combat, side, `${sideName(next, side)} takes the turn.`, 'system'),
  };
}

/**
 * Hand the turn to the seat after `after`, skipping anyone destroyed. Coming
 * back round past the last seat starts a new round. Solo, the next seat is the
 * same one, with fresh downs.
 */
export function passToNextSeat(content: Content, battle: Battle, after: PlayerId | null): Battle {
  const order = battle.combat.participants;
  const alive = new Set(livingParticipants(battle).map((p) => p.id));
  if (alive.size === 0) return battle;
  const from = after ? order.indexOf(after) : -1;
  for (let step = 1; step <= order.length; step++) {
    const index = (from + step) % order.length;
    const id = order[index]!;
    if (!alive.has(id)) continue;
    const wrapped = from >= 0 && index <= from;
    return beginPlayerTurn(content, battle, id, battle.combat.round + (wrapped ? 1 : 0));
  }
  return battle;
}

/** No 1st down in time: the enemy plays its downs. */
export function beginEnemyTurn(content: Content, battle: Battle, handedBy: PlayerId | null): Battle {
  const side = enemySide(battle.combat);
  let next: Battle = {
    ...battle,
    combat: { ...battle.combat, turn: side, down: 0, firstDowns: 0, turnOver: null, handedBy },
  };
  next = emit(next, { kind: 'turn', side, label: `${next.combat.enemy.name}’s turn` });
  next = upkeep(content, next, side);
  const upcoming = next.combat.actionDecks
    .map((d, i) => {
      const card = d.faceUp ? content.cards[d.faceUp] : undefined;
      return `D${i + 1} ${card?.kind === 'action' ? ACTION_LABEL[card.action] : '—'}`;
    })
    .join(' · ');
  return {
    ...next,
    combat: logged(next.combat, side, `${next.combat.enemy.name} takes the turn — ${upcoming}.`, 'system'),
  };
}

/** The next seat to fly after this one — who a 1st down would hand to. */
export function seatAfter(battle: Battle, after: PlayerId | null): PlayerId | null {
  const order = battle.combat.participants;
  const alive = new Set(livingParticipants(battle).map((p) => p.id));
  const from = after ? order.indexOf(after) : -1;
  for (let step = 1; step <= order.length; step++) {
    const id = order[(from + step) % order.length]!;
    if (alive.has(id)) return id;
  }
  return null;
}

/**
 * A seat spends one of its downs. A 1st down ends the turn on the spot —
 * the downs left are forfeit — and so does the last down, or losing the
 * ship to a retaliation. The turn then waits for the seat to end it.
 */
export function playerDown(
  content: Content,
  battle: Battle,
  config: GameConfig,
  action: DownAction,
  rng: Rng,
): { battle: Battle; result: DownResult } {
  const side = battle.combat.turn;
  const { battle: after, result } = resolveDown(content, battle, config, side, action, rng);
  if (result.illegal || side.kind !== 'player') return { battle: after, result };

  let next: Battle = {
    ...after,
    combat: { ...after.combat, down: after.combat.down + (result.spent ? 1 : 0) },
  };
  if (next.combat.outcome) return { battle: next, result };

  const name = sideName(next, side);
  if (result.firstDown) {
    const to = playerOf(next, seatAfter(next, side.id))?.label ?? 'the next seat';
    next = { ...next, combat: logged({ ...next.combat, turnOver: 'first-down' }, side, `1ST DOWN — ${name}’s turn is over; it goes to ${to}.`, 'convert') };
    return { battle: emit(next, { kind: 'first-down', side, label: `1st down — ${name}` }), result };
  }
  if (playerOf(next, side.id)?.destroyed) {
    return { battle: { ...next, combat: { ...next.combat, turnOver: 'destroyed' } }, result };
  }
  if (next.combat.down >= config.downCount) {
    next = { ...next, combat: logged({ ...next.combat, turnOver: 'out-of-downs' }, side, `${name} is out of downs without a 1st down — the enemy is next.`, 'system') };
  }
  return { battle: next, result };
}

/**
 * The seat ends its turn. After a 1st down the next seat goes; otherwise —
 * out of downs, or calling it early — the enemy does.
 */
export function endPlayerTurn(content: Content, battle: Battle): Battle {
  const side = battle.combat.turn;
  if (side.kind !== 'player' || battle.combat.outcome) return battle;
  if (battle.combat.turnOver === 'first-down') return passToNextSeat(content, battle, side.id);
  const early = battle.combat.turnOver === null;
  const next = early
    ? { ...battle, combat: logged(battle.combat, side, `${sideName(battle, side)} ends the turn without a 1st down.`, 'system') }
    : battle;
  return beginEnemyTurn(content, next, side.id);
}

/** Build the opening state for a fight and give the first seat the turn. */
export function startCombat(
  content: Content,
  party: Battle['party'],
  enemy: EnemyInstance,
  participants: PlayerId[],
  config: GameConfig,
  rng: Rng,
): Battle {
  const clean = (ship: Ship): Ship => ({ ...ship, flags: { negateNext: 0, retaliate: 0 } });
  const combat: CombatState = {
    round: 1,
    participants,
    enemy: { ...enemy, ship: clean(enemy.ship) },
    turn: playerSide(participants[0] ?? ''),
    down: 0,
    firstDowns: 0,
    turnOver: null,
    aggressor: null,
    handedBy: null,
    actionDecks: buildActionDecks(content.actions, config.downCount, rng),
    log: [],
    events: [],
  };
  const battle: Battle = {
    party: {
      ...party,
      players: party.players.map((p) => (participants.includes(p.id) ? { ...p, ship: clean(p.ship) } : p)),
    },
    combat,
  };
  const first = livingParticipants(battle)[0];
  return first ? beginPlayerTurn(content, battle, first.id, 1) : battle;
}
