import { create } from 'zustand';
import type { Cell, CardId, DownAction, GameState, PlayerId, RunEvent, SlotIndex, SlotRef } from '@engine/types';
import type { LootChoice, Rng } from '@engine';
import { createRng, game } from '@engine';
import { CONTENT, STARTING_LOADOUTS } from '@data';
import { useConfigStore } from './configStore';

/**
 * The live run.
 *
 * A thin shell over `engine/game`: every action reads the current config out
 * of the config store, calls a pure engine step, and stores the result. The
 * RNG is the one mutable thing that lives here — it's kept alongside the
 * state so a run stays reproducible from `seed`.
 *
 * One thing the shell adds: **nothing that rolls dice lands unseen.** A step
 * whose events include a roll is *staged* — held back while the dice overlay
 * shows the roll — and only committed once the table has thrown the dice and
 * read the result. An attack then flies across the table before it lands.
 */

export type RollEvent = Extract<RunEvent, { kind: 'roll' }>;

/** A step held back until its dice have been shown. */
export interface Staged {
  /** The state the step produced. */
  state: GameState;
  /** Everything the step did, the rolls among it. */
  events: RunEvent[];
  rolls: RollEvent[];
  /** The dice have been thrown — the overlay is showing the result. */
  thrown: boolean;
}

/** A shot on its way across the table. */
export interface Flight {
  from: SlotRef;
  to: SlotRef;
  hit: boolean;
}

/** How long a shot takes to cross the table, in ms. */
export const FLIGHT_MS = 380;

interface GameStore {
  state: GameState | null;
  rng: Rng;
  seed: number;
  /** Reason the last action was refused, surfaced next to the controls. */
  error: string | null;
  staged: Staged | null;
  flight: Flight | null;

  newRun: (seed?: number) => void;

  // ---- setup: the draft ----
  /** Buy a face-up card for the seat on the clock — onto a cell when it was dropped on one. */
  draftCard: (cardId: CardId, cell?: Cell) => void;
  /** The seat on the clock passes this round. */
  passDraft: () => void;
  /** Pick for whoever is on the clock until the draft is over. */
  draftAll: () => void;
  /** Fit a drafted part from the hold; no cell takes the best legal one. */
  assemblePart: (player: PlayerId, cardId: CardId, cell: Cell | null) => void;
  returnPart: (player: PlayerId, slot: SlotIndex) => void;
  /** Put a leftover token on a module, or take one back off. */
  placeEnergy: (player: PlayerId, slot: SlotIndex, delta: 1 | -1) => void;
  /** Spread a seat's leftover tokens over its ship. */
  autoEnergy: (player: PlayerId) => void;
  startMission: () => void;

  /** Move a module to another cell (swapping), at setup or a rearrangement point. */
  moveModule: (player: PlayerId, from: SlotIndex, cell: Cell) => void;
  /** Rearrangement point: fit from the scrap deck (a cockpit there swaps in). */
  fitFromScrap: (player: PlayerId, cardId: CardId, cell: Cell | null) => void;
  /** Rearrangement point: pull a module off the ship into the scrap deck. */
  stowToScrap: (player: PlayerId, slot: SlotIndex) => void;

  setSplit: (split: boolean) => void;
  moveTo: (player: PlayerId, nodeId: string) => void;
  /** Spend a down. Anything that rolls dice is staged for the overlay. */
  takeDown: (action: DownAction) => boolean;
  endTurn: () => void;
  /** Play the enemy's next down — staged if it rolls. */
  enemyStep: () => void;
  /** The overlay threw the dice: show the result. */
  throwDice: () => void;
  /** The table has read the roll: fly the shot, then land the step. */
  commitStaged: () => void;
  resolveLoot: (player: PlayerId | null, choice: LootChoice) => void;
  salvage: (player: PlayerId, cardId: CardId | null) => void;
  claimReward: (player: PlayerId) => void;
  resolveEvent: () => void;
  closePrompt: () => void;
  nextMission: () => void;
  clearError: () => void;
}

const config = () => useConfigStore.getState().config;
const randomSeed = () => Math.floor(Math.random() * 9000) + 1000;

/** Events a step added on top of the state it started from. */
const newEvents = (before: GameState, after: GameState): RunEvent[] =>
  after.eventCounter < before.eventCounter ? after.events : after.events.filter((e) => e.id > before.eventCounter);

export const useGameStore = create<GameStore>((set, get) => {
  /** Nothing new starts while dice are on the table or a shot is in the air. */
  const busy = () => !!get().staged || !!get().flight;

  /** Apply an engine step that can refuse with a reason; stage it if it rolled. */
  const attempt = (fn: (state: GameState) => { state: GameState; error?: string }): boolean => {
    const current = get().state;
    if (!current || busy()) return false;
    const result = fn(current);
    if (result.error) {
      set({ error: result.error });
      return false;
    }
    const events = newEvents(current, result.state);
    const rolls = events.filter((e): e is RollEvent => e.kind === 'roll');
    if (rolls.length > 0) set({ staged: { state: result.state, events, rolls, thrown: false }, error: null });
    else set({ state: result.state, error: null });
    return true;
  };

  /** Apply an engine step that can't refuse. */
  const step = (fn: (state: GameState) => GameState) => {
    attempt((s) => ({ state: fn(s) }));
  };

  return {
    state: null,
    rng: createRng(1),
    seed: 0,
    error: null,
    staged: null,
    flight: null,

    newRun: (seed = randomSeed()) => {
      const rng = createRng(seed);
      set({
        seed,
        rng,
        error: null,
        staged: null,
        flight: null,
        state: game.newRun(CONTENT, config(), seed, STARTING_LOADOUTS, rng),
      });
    },

    draftCard: (cardId, cell) => step((s) => game.draftCard(CONTENT, config(), s, cardId, get().rng, cell)),

    passDraft: () => step((s) => game.passDraft(CONTENT, config(), s, get().rng)),

    draftAll: () =>
      step((s) => {
        let next = s;
        // One seat, one card, in snake order — the same picks a table would
        // make, just without a click per card.
        for (let i = 0; i < 200 && game.nextDrafter(next); i++) {
          const after = game.autoDraft(CONTENT, config(), next, get().rng);
          if (after === next) break; // refused; don't spin
          next = after;
        }
        return next;
      }),

    assemblePart: (player, cardId, cell) => step((s) => game.assemblePart(CONTENT, config(), s, player, cardId, cell)),

    returnPart: (player, slot) => step((s) => game.returnPart(CONTENT, config(), s, player, slot)),

    placeEnergy: (player, slot, delta) =>
      attempt((s) => {
        const error = game.energyError(CONTENT, config(), s, player, slot, delta);
        return error ? { state: s, error } : { state: game.placeEnergy(CONTENT, config(), s, player, slot, delta) };
      }),

    autoEnergy: (player) => step((s) => game.autoEnergy(CONTENT, config(), s, player)),

    startMission: () => step((s) => game.startMission(CONTENT, config(), s, get().rng)),

    moveModule: (player, from, cell) => step((s) => game.moveModule(CONTENT, s, player, from, cell)),

    fitFromScrap: (player, cardId, cell) =>
      attempt((s) => game.fitFromScrap(CONTENT, s, config(), player, cardId, cell)),

    stowToScrap: (player, slot) => attempt((s) => game.stowToScrap(CONTENT, s, config(), player, slot)),

    setSplit: (split) => step((s) => game.setSplit(s, split)),

    moveTo: (player, nodeId) => step((s) => game.moveTo(CONTENT, s, config(), get().rng, player, nodeId)),

    takeDown: (action) => attempt((s) => game.takeDown(CONTENT, s, config(), get().rng, action)),

    endTurn: () => step((s) => game.endTurn(CONTENT, s)),

    enemyStep: () => step((s) => game.enemyStep(CONTENT, s, config(), get().rng)),

    throwDice: () => {
      const staged = get().staged;
      if (staged && !staged.thrown) set({ staged: { ...staged, thrown: true } });
    },

    commitStaged: () => {
      const staged = get().staged;
      if (!staged) return;
      const shot = staged.rolls.find((r) => r.from && r.to);
      if (!shot?.from || !shot.to) {
        set({ state: staged.state, staged: null });
        return;
      }
      set({ staged: null, flight: { from: shot.from, to: shot.to, hit: !!shot.success } });
      setTimeout(() => set({ state: staged.state, flight: null }), FLIGHT_MS);
    },

    resolveLoot: (player, choice) =>
      step((s) => game.resolveLoot(CONTENT, s, config(), get().rng, player, choice)),

    salvage: (player, cardId) => step((s) => game.salvage(CONTENT, s, config(), player, cardId)),

    claimReward: (player) => step((s) => game.claimReward(CONTENT, s, config(), get().rng, player)),

    resolveEvent: () => step((s) => game.resolveEvent(CONTENT, s, config(), get().rng)),

    closePrompt: () => step((s) => game.closePrompt(CONTENT, s, config(), get().rng)),

    nextMission: () => step((s) => game.nextMission(CONTENT, s, config(), get().rng)),

    clearError: () => set({ error: null }),
  };
});

/** Most components only want the run itself. */
export const useGame = (): GameState | null => useGameStore((s) => s.state);

/** Dice on the table or a shot in the air — the controls wait. */
export const useBusy = (): boolean => useGameStore((s) => !!s.staged || !!s.flight);
