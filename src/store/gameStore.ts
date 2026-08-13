import { create } from 'zustand';
import type { CardId, DownAction, GameState, PlayerId, SlotIndex } from '@engine/types';
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
 */

interface GameStore {
  state: GameState | null;
  rng: Rng;
  seed: number;
  /** Reason the last action was refused, surfaced next to the action bar. */
  error: string | null;

  newRun: (seed?: number) => void;

  // ---- setup draft ----
  /** Pull one part off the Parts deck for the seat on the clock. */
  drawStartingPart: (player?: PlayerId) => void;
  /** Draw for whoever is on the clock until every seat has spent its draws. */
  drawAllStartingParts: () => void;
  installCockpit: (player: PlayerId, cardId: CardId) => void;
  /** Slot a drafted part; a negative slot takes the first free one. */
  assemblePart: (player: PlayerId, cardId: CardId, slot: SlotIndex) => void;
  returnPart: (player: PlayerId, slot: SlotIndex) => void;
  startMission: () => void;

  /** Lay out the grid: move a module to another position, or swap two. */
  moveModule: (player: PlayerId, from: SlotIndex, to: SlotIndex) => void;

  setSplit: (split: boolean) => void;
  moveTo: (player: PlayerId, nodeId: string) => void;
  takeDown: (action: DownAction) => void;
  endTurn: () => void;
  enemyStep: () => void;
  /** Run the enemy's whole turn in one go. */
  enemyTurn: () => void;
  resolveLoot: (player: PlayerId, choice: LootChoice) => void;
  claimReward: (player: PlayerId) => void;
  resolveEvent: () => void;
  rearrange: (player: PlayerId, cardId: CardId, slot: SlotIndex) => void;
  buyThreshold: (player: PlayerId) => void;
  closePrompt: () => void;
  nextMission: () => void;
  clearError: () => void;
}

const config = () => useConfigStore.getState().config;
const randomSeed = () => Math.floor(Math.random() * 9000) + 1000;

export const useGameStore = create<GameStore>((set, get) => {
  /** Apply an engine step to the current state; no-op before a run exists. */
  const step = (fn: (state: GameState) => GameState) => {
    const current = get().state;
    if (!current) return;
    set({ state: fn(current), error: null });
  };

  return {
    state: null,
    rng: createRng(1),
    seed: 0,
    error: null,

    newRun: (seed = randomSeed()) => {
      const rng = createRng(seed);
      set({
        seed,
        rng,
        error: null,
        state: game.newRun(CONTENT, config(), seed, STARTING_LOADOUTS, rng),
      });
    },

    drawStartingPart: (player) =>
      step((s) => game.drawStartingPart(CONTENT, s, config(), get().rng, player)),

    drawAllStartingParts: () =>
      step((s) => {
        let next = s;
        // One seat, one card, round the table — the same order a table would
        // do it in, just without a click per card.
        while (game.nextDrafter(next)) {
          const after = game.drawStartingPart(CONTENT, next, config(), get().rng);
          if (after === next) break; // deck dry or refused; don't spin
          next = after;
        }
        return next;
      }),

    installCockpit: (player, cardId) =>
      step((s) => game.installCockpit(CONTENT, s, config(), player, cardId)),

    assemblePart: (player, cardId, slot) =>
      step((s) => game.assemblePart(CONTENT, s, config(), player, cardId, slot)),

    returnPart: (player, slot) => step((s) => game.returnPart(CONTENT, s, player, slot)),

    startMission: () => step((s) => game.startMission(CONTENT, s, config(), get().rng)),

    moveModule: (player, from, to) => step((s) => game.moveModule(CONTENT, s, player, from, to)),

    setSplit: (split) => step((s) => game.setSplit(s, split)),

    moveTo: (player, nodeId) =>
      step((s) => game.moveTo(CONTENT, s, config(), get().rng, player, nodeId)),

    takeDown: (action) => {
      const current = get().state;
      if (!current) return;
      const result = game.takeDown(CONTENT, current, config(), get().rng, action);
      set({ state: result.state, error: result.error ?? null });
    },

    endTurn: () => step((s) => game.endTurn(CONTENT, s, config()).state),

    enemyStep: () => step((s) => game.enemyStep(CONTENT, s, config(), get().rng)),

    enemyTurn: () => {
      const rng = get().rng;
      step((s) => {
        let next = s;
        // Step until control comes back to a seat, the fight ends, or we've
        // clearly looped: a conversion chain can legitimately be long.
        for (let i = 0; i < 40; i++) {
          if (next.phase !== 'combat') break;
          if (game.activeSide(next)?.kind !== 'enemy') break;
          next = game.enemyStep(CONTENT, next, config(), rng);
        }
        return next;
      });
    },

    resolveLoot: (player, choice) =>
      step((s) => game.resolveLoot(CONTENT, s, config(), get().rng, player, choice)),

    claimReward: (player) => step((s) => game.claimReward(CONTENT, s, config(), player)),

    resolveEvent: () => step((s) => game.resolveEvent(CONTENT, s, config(), get().rng)),

    rearrange: (player, cardId, slot) =>
      step((s) => game.applyRearrange(CONTENT, s, config(), player, cardId, slot)),

    buyThreshold: (player) => step((s) => game.buyThreshold(s, config(), player)),

    closePrompt: () => step((s) => game.closePrompt(CONTENT, s, config(), get().rng)),

    nextMission: () => step((s) => game.nextMission(CONTENT, s, config(), get().rng)),

    clearError: () => set({ error: null }),
  };
});

/** Most components only want the run itself. */
export const useGame = (): GameState | null => useGameStore((s) => s.state);
