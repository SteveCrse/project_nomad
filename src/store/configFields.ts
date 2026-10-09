import type { GameConfig } from '@engine/types';

/**
 * Describes how each tunable is edited in the config sidebar.
 *
 * The sidebar renders from this list rather than hand-writing a row per knob,
 * so adding a tunable is: add it to GameConfig + DEFAULT_CONFIG, add a
 * descriptor here, done.
 */

type KeysOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

export type NumericConfigKey = KeysOfType<GameConfig, number>;
export type BooleanConfigKey = KeysOfType<GameConfig, boolean>;
/** The string-union knobs — the rules' open questions with named options. */
export type SelectConfigKey = 'shipSizeRule' | 'downedPlayer';

interface FieldBase {
  /** snake_case, matching the design's debug panel. */
  label: string;
  /** One-liner shown under the control. */
  hint?: string;
}

export interface NumericField extends FieldBase {
  kind: 'number';
  key: NumericConfigKey;
  control: 'stepper' | 'slider';
  min: number;
  max: number;
  step: number;
  /** Decimals to show; integers when omitted. */
  precision?: number;
}

export interface BooleanField extends FieldBase {
  kind: 'boolean';
  key: BooleanConfigKey;
}

export interface SelectField extends FieldBase {
  kind: 'select';
  key: SelectConfigKey;
  options: { value: string; label: string; hint: string }[];
}

export type ConfigField = NumericField | BooleanField | SelectField;

export interface ConfigSection {
  id: string;
  title: string;
  fields: ConfigField[];
  /** Rendered under the section, for derivations and open questions. */
  note?: string;
}

export const CONFIG_SECTIONS: ConfigSection[] = [
  {
    id: 'players',
    title: 'Players & ships',
    fields: [
      { kind: 'number', key: 'playerCount', label: 'player_count', control: 'stepper', min: 1, max: 4, step: 1 },
      {
        kind: 'number',
        key: 'downCount',
        label: 'down_count',
        control: 'stepper',
        min: 2,
        max: 6,
        step: 1,
        hint: 'downs per turn, both sides — and one enemy action deck per down',
      },
      {
        kind: 'boolean',
        key: 'draft',
        label: 'snake_draft',
        hint: 'off: roll out on the authored loadouts',
      },
      {
        kind: 'number',
        key: 'draftTokens',
        label: 'draft_tokens',
        control: 'stepper',
        min: 0,
        max: 30,
        step: 1,
        hint: 'energy tokens per seat — spent on cards, the rest is starting ⚡',
      },
      {
        kind: 'number',
        key: 'draftRounds',
        label: 'draft_rounds',
        control: 'stepper',
        min: 1,
        max: 8,
        step: 1,
        hint: 'module rounds after the cockpit round',
      },
      {
        kind: 'number',
        key: 'draftStartEnergy',
        label: 'draft_start_energy',
        control: 'stepper',
        min: 0,
        max: 6,
        step: 1,
        hint: 'extra ⚡ on every drafted module, before the tokens go on',
      },
      {
        kind: 'select',
        key: 'shipSizeRule',
        label: 'ship_size_rule',
        hint: 'what limits a ship on top of the draft',
        options: [
          { value: 'draft', label: 'DRAFT', hint: 'only the draft’s rounds and tokens' },
          { value: 'slots', label: 'SLOTS', hint: 'the cockpit also lists a max number of modules' },
          { value: 'budget', label: 'BUDGET', hint: 'module upkeep against the cockpit’s rating' },
        ],
      },
    ],
  },
  {
    id: 'combat',
    title: 'Energy & combat',
    fields: [
      {
        kind: 'number',
        key: 'startEnergy',
        label: 'start_energy',
        control: 'stepper',
        min: 0,
        max: 6,
        step: 1,
        hint: '⚡ an enemy module, a loadout or a refit starts with · rules: 1',
      },
      {
        kind: 'number',
        key: 'enemyModulesPerDepth',
        label: 'enemy_per_depth',
        control: 'stepper',
        min: 0,
        max: 3,
        step: 1,
        hint: 'enemy modules = depth × this + players × the next',
      },
      {
        kind: 'number',
        key: 'enemyModulesPerPlayer',
        label: 'enemy_per_player',
        control: 'stepper',
        min: 0,
        max: 3,
        step: 1,
      },
      {
        kind: 'boolean',
        key: 'enemySizeCapped',
        label: 'enemy_size_capped',
        hint: 'hold enemies to the same size limit as players',
      },
      {
        kind: 'select',
        key: 'downedPlayer',
        label: 'downed_player',
        hint: 'TBD in the rules — what a seat does once its cockpit is gone',
        options: [
          { value: 'out', label: 'OUT', hint: 'sits out the mission, rebuilds at its end' },
          { value: 'revive', label: 'REVIVE', hint: 'a teammate spends a down: cockpit back with 1⚡' },
        ],
      },
    ],
    note: 'Hit chance = ⚡ ÷ 6, and ⚡ is HP. Expected damage = attack × ⚡ ÷ 6.',
  },
  {
    id: 'loot',
    title: 'Loot',
    fields: [
      { kind: 'number', key: 'scrapCap', label: 'scrap_cap', control: 'stepper', min: 1, max: 8, step: 1 },
      { kind: 'number', key: 'handSize', label: 'hand_size', control: 'stepper', min: 0, max: 10, step: 1 },
      { kind: 'number', key: 'lootPerNode', label: 'loot_per_node', control: 'stepper', min: 0, max: 5, step: 1 },
      {
        kind: 'boolean',
        key: 'lootOneModule',
        label: 'loot_one_module',
        hint: 'from the ideas list — a kill may pay one module instead of the ship',
      },
    ],
  },
  {
    id: 'board',
    title: 'Board / Rarity',
    fields: [
      { kind: 'number', key: 'missionLength', label: 'mission_length', control: 'stepper', min: 3, max: 20, step: 1 },
      { kind: 'number', key: 'maxBranches', label: 'max_branches', control: 'stepper', min: 1, max: 5, step: 1 },
      { kind: 'number', key: 'checkpointEvery', label: 'checkpoint_every', control: 'stepper', min: 1, max: 12, step: 1 },
      {
        kind: 'boolean',
        key: 'checkpointsAreRearrangePoints',
        label: 'checkpoint_rearrange',
        hint: 'not in the rules — rebuild at checkpoints too',
      },
      {
        kind: 'number',
        key: 'maxRarityNow',
        label: 'start_rarity',
        control: 'stepper',
        min: 1,
        max: 5,
        step: 1,
        hint: 'rules: the parts deck starts with commons',
      },
      { kind: 'number', key: 'rarityPerCheckpoint', label: 'rarity_per_check', control: 'stepper', min: 0, max: 3, step: 1 },
      {
        kind: 'number',
        key: 'commonsRemovedPerCheckpoint',
        label: 'commons_removed',
        control: 'stepper',
        min: 0,
        max: 10,
        step: 1,
        hint: 'commons taken out of the parts deck per checkpoint',
      },
    ],
  },
];

export const NUMERIC_FIELDS: Record<string, NumericField> = Object.fromEntries(
  CONFIG_SECTIONS.flatMap((s) => s.fields)
    .filter((f): f is NumericField => f.kind === 'number')
    .map((f) => [f.key, f]),
);

/** Clamp to the field's declared range, and snap fractional steps cleanly. */
export function clampField(key: NumericConfigKey, value: number): number {
  const field = NUMERIC_FIELDS[key];
  if (!field) return value;
  const clamped = Math.min(field.max, Math.max(field.min, value));
  const decimals = field.precision ?? 0;
  return Number(clamped.toFixed(decimals));
}
