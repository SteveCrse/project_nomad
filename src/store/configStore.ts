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
  toJSON: () => string;
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

      toJSON: () => JSON.stringify(get().config, null, 2),
    }),
    {
      name: 'nomad.config.v1',
      // New tunables added after a session was saved should take their default
      // rather than come back undefined.
      merge: (persisted, current) => {
        const saved = (persisted as { config?: Partial<GameConfig> } | undefined)?.config ?? {};
        return { ...current, config: { ...DEFAULT_CONFIG, ...saved } };
      },
    },
  ),
);

/** Convenience selector — most components only need the config itself. */
export const useConfig = (): GameConfig => useConfigStore((s) => s.config);
