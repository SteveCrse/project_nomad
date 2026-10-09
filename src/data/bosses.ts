import type { BossSheet } from '@engine/types';

/**
 * Boss sheets. A boss is the one ship that isn't drawn: its parts are fixed,
 * and the same layout rules lay them out on its grid. Regular enemies have
 * no sheet at all — a cockpit off the cockpit deck, and mission depth +
 * players modules off the parts deck.
 *
 * Kill the boss and its surviving parts are split round the table, in pieces,
 * for the next mission.
 */
export const BOSSES: BossSheet[] = [
  {
    id: 'the-rustmaw',
    name: 'The Rustmaw',
    // Two shields, so two columns covered: the arranger puts one over the
    // cockpit and the other over a gun.
    fixedPartIds: [
      'bfc',
      'subspace-field',
      'defense-turret',
      'gauss-canon',
      'antimatter-torpedo',
      'fusion-reactor',
      'mines',
    ],
    notes: 'Mission boss. Defeating it ends the mission; its ship is carried forward in pieces.',
  },
];

export const BOSSES_BY_ID: Record<string, BossSheet> = Object.fromEntries(
  BOSSES.map((b) => [b.id, b]),
);
