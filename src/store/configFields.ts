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

export type ConfigField = NumericField | BooleanField;

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
    title: 'Players',
    fields: [
      { kind: 'number', key: 'playerCount', label: 'player_count', control: 'stepper', min: 1, max: 4, step: 1 },
      { kind: 'number', key: 'downCount', label: 'down_count', control: 'stepper', min: 2, max: 6, step: 1 },
      { kind: 'number', key: 'maxAp', label: 'max_ap', control: 'stepper', min: 0, max: 6, step: 1 },
      { kind: 'number', key: 'hullHp', label: 'hull_hp', control: 'slider', min: 10, max: 200, step: 5 },
      { kind: 'number', key: 'gridCols', label: 'grid_cols', control: 'stepper', min: 2, max: 8, step: 1 },
      { kind: 'number', key: 'gridRows', label: 'grid_rows', control: 'stepper', min: 1, max: 4, step: 1 },
    ],
  },
  {
    id: 'combat',
    title: 'Combat',
    fields: [
      {
        kind: 'number',
        key: 'convThreshold',
        label: 'conv_threshold',
        control: 'slider',
        min: 4,
        max: 24,
        step: 1,
        hint: 'default when an enemy has no override',
      },
      {
        kind: 'number',
        key: 'playerConvThreshold',
        label: 'player_threshold',
        control: 'slider',
        min: 4,
        max: 24,
        step: 1,
        hint: 'what an enemy must deal in one set to convert on a seat',
      },
      {
        kind: 'boolean',
        key: 'thresholdCountsShielded',
        label: 'shielded_counts',
        hint: 'does damage eaten by shields still count toward conversion?',
      },
      {
        kind: 'boolean',
        key: 'allowThresholdUpgrades',
        label: 'threshold_upgrades',
        hint: 'rules open question #2',
      },
      {
        kind: 'number',
        key: 'thresholdUpgradeStep',
        label: 'threshold_step',
        control: 'stepper',
        min: 1,
        max: 6,
        step: 1,
      },
      {
        kind: 'number',
        key: 'thresholdUpgradePowerCost',
        label: 'threshold_cost',
        control: 'stepper',
        min: 0,
        max: 5,
        step: 1,
        hint: '⚔ lost per attack per upgrade',
      },
      { kind: 'number', key: 'enemyPartsBase', label: 'enemy_parts_base', control: 'stepper', min: 0, max: 8, step: 1 },
      {
        kind: 'number',
        key: 'partsPerExtraPlayer',
        label: 'parts_per_player',
        control: 'stepper',
        min: 0,
        max: 6,
        step: 1,
        hint: 'extra parts drawn per player beyond the first',
      },
      {
        kind: 'number',
        key: 'enemyHpScale',
        label: 'enemy_hp_scale',
        control: 'slider',
        min: 1,
        max: 3,
        step: 0.05,
        precision: 2,
      },
    ],
  },
  {
    id: 'economy',
    title: 'Economy',
    fields: [
      { kind: 'number', key: 'scrapCap', label: 'scrap_cap', control: 'stepper', min: 1, max: 8, step: 1 },
      {
        kind: 'number',
        key: 'energyPerTurn',
        label: 'energy_per_turn',
        control: 'slider',
        min: 0,
        max: 20,
        step: 1,
        hint: 'reactor baseline spread across the grid each turn',
      },
      {
        kind: 'number',
        key: 'energyCostMult',
        label: 'energy_cost_mult',
        control: 'slider',
        min: 0.25,
        max: 2,
        step: 0.05,
        precision: 2,
      },
      { kind: 'number', key: 'energyCostReroute', label: 'energy_cost_reroute', control: 'stepper', min: 0, max: 5, step: 1 },
      { kind: 'number', key: 'energyCostChargeShield', label: 'energy_cost_shield', control: 'stepper', min: 0, max: 5, step: 1 },
      { kind: 'number', key: 'handSize', label: 'hand_size', control: 'stepper', min: 0, max: 10, step: 1 },
      { kind: 'number', key: 'lootPerNode', label: 'loot_per_node', control: 'stepper', min: 0, max: 5, step: 1 },
      { kind: 'number', key: 'carriedPartsCap', label: 'carried_parts_cap', control: 'stepper', min: 0, max: 10, step: 1 },
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
        hint: 'proposed in the rules doc — confirm cadence',
      },
      { kind: 'number', key: 'maxRarityNow', label: 'max_rarity_now', control: 'stepper', min: 1, max: 5, step: 1, hint: 'starting ceiling; checkpoints raise the live one' },
      { kind: 'number', key: 'rarityPerCheckpoint', label: 'rarity_per_check', control: 'stepper', min: 0, max: 3, step: 1 },
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
