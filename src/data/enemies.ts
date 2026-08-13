import type { EnemyStatBlock } from '@engine/types';

/**
 * Enemy stat blocks: ship size + conversion threshold, per the rules.
 *
 * There is no HP here, because there is no HP anywhere. How much an enemy can
 * take is whatever ship the Parts deck rolls for it — charged shields, then
 * its cockpit's own pool — so `partsBase` is both the spawn recipe *and* the
 * difficulty dial. Bosses pin their parts with `fixedPartIds` instead.
 *
 * Thresholds here are the authored defaults; the config sidebar can override
 * any of them per playtest without touching this file.
 */
export const ENEMIES: EnemyStatBlock[] = [
  {
    id: 'scavenger-chain',
    name: 'Scavenger Chain',
    convThreshold: 12,
    partsBase: 3,
    notes: 'Baseline trash encounter. Converts often, hits softly.',
  },
  {
    id: 'hull-picker',
    name: 'Hull Picker',
    convThreshold: 8,
    partsBase: 2,
    notes: 'Low threshold — chains sets easily, so it punishes a slow opener.',
  },
  {
    id: 'salvage-baron',
    name: 'Salvage Baron',
    convThreshold: 16,
    partsBase: 4,
    notes: 'Elite. High threshold makes its conversions rare but swingy.',
  },
  {
    id: 'quarantine-drone',
    name: 'Quarantine Drone',
    convThreshold: 14,
    partsBase: 3,
    downCount: 3,
    notes: 'Fewer downs than standard — tests the per-enemy downCount override.',
  },
  {
    id: 'the-rustmaw',
    name: 'The Rustmaw',
    convThreshold: 12,
    partsBase: 6,
    isBoss: true,
    // A BFC anchors it — 8 positions, so the boss is the one ship on the table
    // carrying a full rack. Its durability is the Subspace Field plus the 6⚡
    // on the cockpit behind it; there is nothing else to grind through.
    fixedPartIds: [
      'bfc',
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
