import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EnemyId, GameConfig } from '@engine/types';
import { DEFAULT_CONFIG } from '@engine/types';
import { clampField, type BooleanConfigKey, type NumericConfigKey } from './configFields';

/**
 * The tuning state for a playtest run.
 *
 * Nothing downstream reads this yet — the engine will. It's deliberately just
 * `GameConfig` plus setters so it can be handed to engine functions as-is.
 * Persisted so a session's tuning survives a reload mid-playtest.
 */
interface ConfigStore {
  config: GameConfig;
  setNumber: (key: NumericConfigKey, value: number) => void;
  setBoolean: (key: BooleanConfigKey, value: boolean) => void;
  /** Stepper +/-, clamped to the field's declared range. */
  bump: (key: NumericConfigKey, delta: number) => void;
  /** Pass null to clear the override and fall back to the stat block. */
  setEnemyThreshold: (enemyId: EnemyId, value: number | null) => void;
  reset: () => void;
  /**
   * The config as pasteable JSON.
   *
   * Deliberately not named `toJSON`: that name is a serialization hook, and
   * `persist` calls `JSON.stringify` on the whole store — a `toJSON` here would
   * hijack it and write this string in place of the real state, so nothing
   * would ever rehydrate.
   */
  exportJson: () => string;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set, get) => ({
      config: { ...DEFAULT_CONFIG },

      setNumber: (key, value) =>
        set((s) => ({ config: { ...s.config, [key]: clampField(key, value) } })),

      setBoolean: (key, value) => set((s) => ({ config: { ...s.config, [key]: value } })),

      bump: (key, delta) =>
        set((s) => ({ config: { ...s.config, [key]: clampField(key, s.config[key] + delta) } })),

      setEnemyThreshold: (enemyId, value) =>
        set((s) => {
          const next = { ...s.config.enemyConvThresholds };
          if (value === null) delete next[enemyId];
          else next[enemyId] = value;
          return { config: { ...s.config, enemyConvThresholds: next } };
        }),

      reset: () => set({ config: { ...DEFAULT_CONFIG, enemyConvThresholds: {} } }),

      exportJson: () => JSON.stringify(get().config, null, 2),
    }),
    {
      name: 'nomad.config.v1',
      // Only the config is worth keeping; the setters are rebuilt on load.
      partialize: (s) => ({ config: s.config }),
      // New tunables added after a session was saved should take their default
      // rather than come back undefined — and tunables that have since been
      // retired are dropped, so a stale save can't resurrect a knob the rules
      // no longer have.
      merge: (persisted, current) => {
        const saved = (persisted as { config?: Partial<GameConfig> } | undefined)?.config ?? {};
        const known = Object.fromEntries(
          Object.entries(saved).filter(([key]) => key in DEFAULT_CONFIG),
        ) as Partial<GameConfig>;
        return { ...current, config: { ...DEFAULT_CONFIG, ...known } };
      },
    },
  ),
);

/** Convenience selector — most components only need the config itself. */
export const useConfig = (): GameConfig => useConfigStore((s) => s.config);
