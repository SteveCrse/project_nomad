import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameConfig } from '@engine/types';
import { DEFAULT_CONFIG } from '@engine/types';
import {
  CONFIG_SECTIONS,
  clampField,
  type BooleanConfigKey,
  type NumericConfigKey,
  type SelectConfigKey,
  type SelectField,
} from './configFields';

/** The values each open question may take — a save from before an option was retired falls back. */
const SELECT_OPTIONS = Object.fromEntries(
  CONFIG_SECTIONS.flatMap((s) => s.fields)
    .filter((f): f is SelectField => f.kind === 'select')
    .map((f) => [f.key, f.options.map((o) => o.value)]),
) as Record<SelectConfigKey, string[]>;

/**
 * The tuning state for a playtest run.
 *
 * Deliberately just `GameConfig` plus setters, so it can be handed to engine
 * functions as-is. Persisted so a session's tuning survives a reload
 * mid-playtest.
 */
interface ConfigStore {
  config: GameConfig;
  setNumber: (key: NumericConfigKey, value: number) => void;
  setBoolean: (key: BooleanConfigKey, value: boolean) => void;
  /** One of an open question's named options. */
  setSelect: <K extends SelectConfigKey>(key: K, value: GameConfig[K]) => void;
  /** Stepper +/-, clamped to the field's declared range. */
  bump: (key: NumericConfigKey, delta: number) => void;
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

      setSelect: (key, value) => set((s) => ({ config: { ...s.config, [key]: value } })),

      reset: () => set({ config: { ...DEFAULT_CONFIG } }),

      exportJson: () => JSON.stringify(get().config, null, 2),
    }),
    {
      // v2: the v3 rules replaced most of the knobs, and the ones that
      // survived changed defaults (commons-only start, no checkpoint
      // rebuilds) — a v1 save would pin the old values.
      name: 'nomad.config.v2',
      // Only the config is worth keeping; the setters are rebuilt on load.
      partialize: (s) => ({ config: s.config }),
      // New tunables added after a session was saved should take their default
      // rather than come back undefined — and tunables that have since been
      // retired are dropped, so a stale save can't resurrect a knob the rules
      // no longer have. So is a retired option of a knob that's still here
      // (the power-token size rule became the draft).
      merge: (persisted, current) => {
        const saved = (persisted as { config?: Partial<GameConfig> } | undefined)?.config ?? {};
        const known = Object.fromEntries(
          Object.entries(saved).filter(
            ([key, value]) =>
              key in DEFAULT_CONFIG &&
              (!(key in SELECT_OPTIONS) || SELECT_OPTIONS[key as SelectConfigKey].includes(value as string)),
          ),
        ) as Partial<GameConfig>;
        return { ...current, config: { ...DEFAULT_CONFIG, ...known } };
      },
    },
  ),
);

/** Convenience selector — most components only need the config itself. */
export const useConfig = (): GameConfig => useConfigStore((s) => s.config);
