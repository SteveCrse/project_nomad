import type { Battle, CombatLogEntry, CombatState, SideRef, TableEvent } from '../types/combat';
import type { DiceSpec } from '../types/card';
import type { PlayerState } from '../types/player';
import type { Ship } from '../types/ship';
import type { PlayerId } from '../types/ids';
import type { DiceRoll } from '../ship';

export const sideKey = (side: SideRef): string => `${side.kind}:${side.id}`;

export const sameSide = (a: SideRef, b: SideRef): boolean => a.kind === b.kind && a.id === b.id;

export const playerSide = (id: PlayerId): SideRef => ({ kind: 'player', id });

export const enemySide = (combat: CombatState): SideRef => ({ kind: 'enemy', id: combat.enemy.instanceId });

// ---------------------------------------------------------------- accessors

export const playerOf = (battle: Battle, id: PlayerId | null | undefined): PlayerState | undefined =>
  id ? battle.party.players.find((p) => p.id === id) : undefined;

export const livingParticipants = (battle: Battle): PlayerState[] =>
  battle.combat.participants
    .map((id) => playerOf(battle, id))
    .filter((p): p is PlayerState => !!p && !p.destroyed);

export const currentSide = (combat: CombatState): SideRef => combat.turn;

export function shipOf(battle: Battle, side: SideRef): Ship | undefined {
  return side.kind === 'player' ? playerOf(battle, side.id)?.ship : battle.combat.enemy.ship;
}

export function sideName(battle: Battle, side: SideRef): string {
  return side.kind === 'player'
    ? (playerOf(battle, side.id)?.label ?? side.id)
    : battle.combat.enemy.name;
}

/**
 * Who the enemy is shooting at: the aggressor — the player who attacked last.
 * Before anyone has, it's the seat whose turn handed the enemy its turn, and
 * past that the first seat still flying.
 */
export function aggroTarget(battle: Battle): PlayerId | null {
  const alive = livingParticipants(battle);
  const pick = (id: PlayerId | null) => alive.find((p) => p.id === id)?.id ?? null;
  return pick(battle.combat.aggressor) ?? pick(battle.combat.handedBy) ?? alive[0]?.id ?? null;
}

/** The ship on the far side of a fight from `side`, and which ship that is. */
export function opposingShip(
  battle: Battle,
  side: SideRef,
  target?: PlayerId,
): { side: SideRef; ship: Ship } | null {
  if (side.kind === 'player') {
    return { side: enemySide(battle.combat), ship: battle.combat.enemy.ship };
  }
  const id = target ?? aggroTarget(battle);
  const player = livingParticipants(battle).find((p) => p.id === id);
  return player ? { side: playerSide(player.id), ship: player.ship } : null;
}

// ---------------------------------------------------------------- writes

export function logged(
  combat: CombatState,
  side: SideRef,
  message: string,
  tone: CombatLogEntry['tone'] = 'info',
): CombatState {
  return { ...combat, log: [...combat.log, { round: combat.round, side, message, tone }] };
}

/** Record something the table should be shown. */
export function emit(battle: Battle, event: TableEvent): Battle {
  return { ...battle, combat: { ...battle.combat, events: [...battle.combat.events, event] } };
}

export function withShip(battle: Battle, side: SideRef, ship: Ship): Battle {
  if (side.kind === 'player') {
    return {
      ...battle,
      party: {
        ...battle.party,
        players: battle.party.players.map((p) =>
          p.id === side.id ? { ...p, ship, destroyed: ship.destroyed } : p,
        ),
      },
    };
  }
  return { ...battle, combat: { ...battle.combat, enemy: { ...battle.combat.enemy, ship } } };
}

export function withPlayer(battle: Battle, id: PlayerId, patch: Partial<PlayerState>): Battle {
  return {
    ...battle,
    party: {
      ...battle.party,
      players: battle.party.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    },
  };
}

// ---------------------------------------------------------------- dice

/** A dice spec's hit rule as printed: "≤ 2", "≥ 5", or null when the dice are summed. */
export function diceRule(spec: DiceSpec): string | null {
  const parts: string[] = [];
  if (spec.hitUnder !== undefined) parts.push(`≤ ${spec.hitUnder}`);
  if (spec.hitOver !== undefined) parts.push(`≥ ${spec.hitOver}`);
  return parts.length > 0 ? parts.join(' or ') : null;
}

/** Record a card's own dice as a roll the table sees. */
export function emitDice(
  battle: Battle,
  side: SideRef,
  label: string,
  spec: DiceSpec,
  roll: DiceRoll,
  outcome: string,
): Battle {
  if (roll.dice.length === 0) return battle;
  return emit(battle, {
    kind: 'roll',
    side,
    label,
    die: spec.die,
    dice: roll.dice,
    rule: diceRule(spec),
    success: roll.hitRule ? roll.hits > 0 : null,
    outcome,
  });
}
