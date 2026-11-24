import { useEffect } from 'react';
import type { CombatState, GameConfig, GameState, PlayerId, PlayerState, RerouteMove, SideRef, SlotIndex } from '@engine/types';
import { abilityEffects, activeEffects, combat, ship as shipEngine } from '@engine';
import { CONTENT, getCard, getPart } from '@data';
import { aggroOf, battleOf, fxKey, reroutePlan, type ModuleOptions } from '@/lib/combatView';
import { aimsAtEnemy, combatControls, targetAction, type CombatControls } from '@/lib/combatControls';
import { useConfig } from '@/store/configStore';
import { useGameStore, type Staged } from '@/store/gameStore';
import { useUiStore, type CombatMode } from '@/store/uiStore';

/** Where each seat sits, by how many are at the table. P1 is always nearest the screen. */
export type SeatPos = 'bottom' | 'left' | 'top' | 'right';
const SEATS: Record<number, SeatPos[]> = {
  1: ['bottom'],
  2: ['bottom', 'top'],
  3: ['bottom', 'left', 'right'],
  4: ['bottom', 'left', 'top', 'right'],
};
/** How far a seat's side of the table is turned from the bottom, in degrees. */
export const SEAT_ANGLE: Record<SeatPos, number> = { bottom: 0, left: 90, top: 180, right: -90 };

export const seatsFor = (players: PlayerState[]): SeatPos[] => SEATS[Math.min(4, Math.max(1, players.length))]!;

export const seatOf = (state: GameState, id: PlayerId | null | undefined): SeatPos => {
  const i = state.party.players.findIndex((p) => p.id === id);
  return seatsFor(state.party.players)[i] ?? 'bottom';
};

/** Does playing this card need a module on the enemy picked first? */
export const cardAims = (cardId: string, manualDamage: number): boolean => {
  const card = getCard(cardId);
  return !!card && aimsAtEnemy(activeEffects(card), manualDamage);
};

/** How long the enemy waits between its own steps, so each one can be read. */
const ENEMY_BEAT_MS = 1250;

/**
 * Everything the table and the panel under it need to know about the down in
 * hand — one reading of the engine, shared, so the two can never disagree.
 * The engine decides what is legal; this only asks it and turns clicks and
 * drops into its actions.
 */
export interface TablePlay {
  state: GameState;
  config: GameConfig;
  fight: CombatState | null;
  /** Who holds the turn, while the fight is on. */
  side: SideRef | null;
  /** The seat on the clock, on its own turn. */
  acting: PlayerState | null;
  /** The seat the table turns to and whose hand is held up. */
  activeSeat: PlayerId | null;
  aggro: PlayerId | null;
  busy: boolean;
  staged: Staged | null;
  mode: CombatMode | null;
  controls: CombatControls;
  /** The module picked up on the table, with what it can do. */
  sel: ModuleOptions | null;
  /** The reroute being dragged together, played out; null when no marker may move. */
  plan: ReturnType<typeof reroutePlan> | null;
  moves: RerouteMove[];
  /** Why the reroute as built can't be finished, if it can't. */
  rerouteError: string | null;
  /** Screen-only marks per module (`side:id:slot`): attacker, targeted. */
  marks: Record<string, string>;
  /** Why a marker can't go from one module to another; null when it can. */
  dropError: (from: SlotIndex, to: SlotIndex) => string | null;
  dropChit: (from: SlotIndex, to: SlotIndex) => void;
  clickOwn: (slot: SlotIndex) => void;
  clickEnemy: (slot: SlotIndex) => void;
  /** Start the action a picked module's button names. */
  attackWith: (slot: SlotIndex) => void;
  generateOn: (slot: SlotIndex) => void;
  useAbility: (slot: SlotIndex) => void;
  finishReroute: () => void;
  cancel: () => void;
}

export function useTablePlay(state: GameState): TablePlay {
  const config = useConfig();
  const staged = useGameStore((s) => s.staged);
  const flight = useGameStore((s) => s.flight);
  const takeDown = useGameStore((s) => s.takeDown);
  const enemyStep = useGameStore((s) => s.enemyStep);
  const cancelStaged = useGameStore((s) => s.cancelStaged);
  const clearError = useGameStore((s) => s.clearError);
  const mode = useUiStore((s) => s.combatMode);
  const setMode = useUiStore((s) => s.setCombatMode);
  const manualDamage = useUiStore((s) => s.manualDamage);
  const addLeg = useUiStore((s) => s.addRerouteLeg);
  const tableSel = useUiStore((s) => s.tableSel);
  const select = useUiStore((s) => s.selectTableModule);
  const setNote = useUiStore((s) => s.setTableNote);

  const busy = !!staged || !!flight;
  const fight = state.combat;
  const battle = battleOf(state);
  const side = fight && !fight.outcome ? fight.turn : null;
  const aggro = aggroOf(state);

  const take = (action: Parameters<typeof takeDown>[0]) => {
    setNote(null);
    if (takeDown(action)) {
      setMode(null);
      select(null);
    }
  };

  const controls = combatControls(state, config, busy ? null : mode, manualDamage, {
    setMode,
    take,
    pickSource: () => {},
    addLeg: (from, to, amount) => addLeg({ from, to, amount }),
  });
  const acting = controls.acting;
  const open = !!acting && !!fight && !fight.turnOver && !busy;

  // Markers may be dragged whenever nothing else is in hand: the first drop starts the reroute.
  const moves = mode?.kind === 'reroute' ? mode.moves : [];
  const plan = open && acting && (!mode || mode.kind === 'reroute') ? reroutePlan(acting.ship, moves) : null;
  const rerouteError =
    plan && battle && side && moves.length > 0
      ? (plan.error ?? combat.actionError(CONTENT, battle, config, side, { type: 'reroute', moves }))
      : null;

  const name = (slot: SlotIndex) => getPart(acting?.ship.slots[slot]?.partId)?.name ?? 'That module';
  const dropError = (from: SlotIndex, to: SlotIndex): string | null => {
    if (!plan) return 'Nothing can be rerouted right now.';
    if (from === to) return null;
    if ((plan.sendable[from] ?? 0) <= 0) return 'Energy that arrived this reroute stays put: each marker moves one module at most.';
    if (!shipEngine.connected(plan.ship, from, to)) return 'Energy only moves to a connected module, one step per reroute.';
    if ((plan.room[to] ?? 0) <= 0) return `${name(to)} is full. No overloading while rerouting.`;
    return null;
  };

  const marks: Record<string, string> = {};
  const shot = staged?.rolls.find((r) => r.from && r.to);
  if (shot?.from && shot.to) {
    marks[fxKey(shot.from.side, shot.from.slot)] = 'attacker';
    marks[fxKey(shot.to.side, shot.to.slot)] = 'targeted';
  } else if (acting && mode && (mode.kind === 'attack' || mode.kind === 'use') && mode.slot !== null) {
    marks[fxKey({ kind: 'player', id: acting.id }, mode.slot)] = 'attacker';
  }

  const sel = open && !mode && tableSel !== null ? (controls.options.find((o) => o.slot === tableSel && !o.destroyed) ?? null) : null;

  // The turn changed hands: whatever was half-built is dropped.
  const holder = side ? `${side.kind}:${side.id}:${fight?.round}` : 'none';
  useEffect(() => {
    setMode(null);
    select(null);
    setNote(null);
    clearError();
  }, [holder, setMode, select, setNote, clearError]);

  // The enemy plays its own turn, a card at a time; anything it rolls waits for a click.
  const enemyToPlay = side?.kind === 'enemy' && !busy && !state.prompt;
  useEffect(() => {
    if (!enemyToPlay) return;
    const t = window.setTimeout(enemyStep, ENEMY_BEAT_MS);
    return () => clearTimeout(t);
  }, [enemyToPlay, state, enemyStep]);

  return {
    state,
    config,
    fight,
    side,
    acting,
    activeSeat:
      side?.kind === 'player'
        ? side.id
        : fight
          ? (fight.handedBy ?? aggro ?? fight.participants[0] ?? null)
          : (state.awaitingMove[0] ?? state.party.players[0]?.id ?? null),
    aggro,
    busy,
    staged,
    mode,
    controls,
    sel,
    plan,
    moves,
    rerouteError,
    marks,
    dropError,
    dropChit: (from, to) => {
      const error = dropError(from, to);
      if (from === to) return;
      if (error) return setNote(error);
      setNote(null);
      select(null);
      if (mode?.kind === 'reroute') addLeg({ from, to, amount: 1 });
      else setMode({ kind: 'reroute', from: null, moves: [{ from, to, amount: 1 }] });
    },
    clickOwn: (slot) => {
      if (!open || mode) return;
      setNote(null);
      clearError();
      select(tableSel === slot ? null : slot);
    },
    clickEnemy: (slot) => {
      if (busy || !mode) return;
      if (!controls.targets.includes(slot)) {
        const part = getPart(fight?.enemy.ship.slots[slot]?.partId);
        return setNote(`${part?.name ?? 'That module'} is covered. Hit what stands in front of it first.`);
      }
      const action = targetAction(mode, manualDamage, slot, controls.spend?.value);
      if (action) take(action);
    },
    attackWith: (slot) => {
      clearError();
      setMode({ kind: 'attack', slot });
    },
    generateOn: (slot) => take({ type: 'generate', slot }),
    useAbility: (slot) => {
      const part = getPart(acting?.ship.slots[slot]?.partId);
      if (part && aimsAtEnemy(abilityEffects(part), manualDamage)) setMode({ kind: 'use', slot });
      else take({ type: 'use-module', slot, ...(manualDamage > 0 ? { manualDamage } : {}) });
    },
    finishReroute: () => take({ type: 'reroute', moves }),
    cancel: () => {
      setNote(null);
      clearError();
      const action = staged && !staged.thrown ? staged.action : undefined;
      if (action) {
        cancelStaged();
        // An attack goes back to its module, picked, to aim again or drop.
        setMode(action.type === 'attack' ? { kind: 'attack', slot: action.slot, spend: action.spend } : null);
        return;
      }
      setMode(null);
      select(null);
    },
  };
}
