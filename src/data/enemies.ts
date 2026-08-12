import type { EnemyStatBlock } from '@engine/types';

/**
 * Enemy stat blocks: HP pool + conversion threshold, per the rules.
 * Ships are generated from the Parts deck at spawn time, so `partsBase` is a
 * spawn recipe rather than a fixed loadout — except for bosses, which pin
 * their parts with `fixedPartIds`.
 *
 * Thresholds here are the authored defaults; the config sidebar can override
 * any of them per playtest without touching this file.
 */
export const ENEMIES: EnemyStatBlock[] = [
  {
    id: 'scavenger-chain',
    name: 'Scavenger Chain',
    hpPool: 24,
    convThreshold: 12,
    partsBase: 3,
    notes: 'Baseline trash encounter. Converts often, hits softly.',
  },
  {
    id: 'hull-picker',
    name: 'Hull Picker',
    hpPool: 18,
    convThreshold: 8,
    partsBase: 2,
    notes: 'Low threshold — chains sets easily, so it punishes a slow opener.',
  },
  {
    id: 'salvage-baron',
    name: 'Salvage Baron',
    hpPool: 40,
    convThreshold: 16,
    partsBase: 4,
    notes: 'Elite. High threshold makes its conversions rare but swingy.',
  },
  {
    id: 'quarantine-drone',
    name: 'Quarantine Drone',
    hpPool: 30,
    convThreshold: 14,
    partsBase: 3,
    downCount: 3,
    notes: 'Fewer downs than standard — tests the per-enemy downCount override.',
  },
  {
    id: 'the-rustmaw',
    name: 'The Rustmaw',
    hpPool: 60,
    convThreshold: 12,
    partsBase: 6,
    isBoss: true,
    fixedPartIds: [
      'cockpit-mk3',
      'antimatter-torpedo',
      'subspace-field',
      'gauss-canon',
      'fusion-reactor',
      'defense-turret',
      'mines',
    ],
    notes: 'Mission boss. Defeating it ends the mission; its ship is carried forward in pieces.',
  },
];

export const ENEMIES_BY_ID: Record<string, EnemyStatBlock> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);
