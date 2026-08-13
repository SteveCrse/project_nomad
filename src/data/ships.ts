import type { Loadout } from '@engine/types';

/**
 * Starting ships for a playtest run.
 *
 * Scenario content, not engine state: `newRun` builds real `Ship`s out of
 * these by looking each part up in the Parts data, so nothing here duplicates
 * card text or hard-codes slot geometry.
 *
 * The cockpit is the pick that matters most: it sets slot count, the basic
 * attack, and the shield pool that is the seat's only durability. These four
 * spread across the range on purpose — a big grid on a thin shield (BFC), a
 * deep shield on a small grid (Larry), and so on.
 */
export const STARTING_LOADOUTS: Loadout[] = [
  {
    // 8 positions on a 6⚡ shield: room for everything, and nothing spare to
    // soak a bad turn.
    id: 'p1',
    label: 'P1',
    shipName: 'MAGPIE',
    accent: 'var(--role-gen)',
    cockpitId: 'bfc',
    partIds: [
      'solar-panels',
      'gauss-canon',
      'overflow-distributor',
      'shock-absorber',
      'cargo-bay',
    ],
  },
  {
    // The opposite trade: 10⚡ of cockpit shield, only three positions to fit
    // a build into.
    id: 'p2',
    label: 'P2',
    shipName: 'RUSTBUCKET',
    accent: 'var(--role-rds)',
    cockpitId: 'larry-the-marauder',
    partIds: ['fusion-reactor', 'overflow-distributor', 'laser-array'],
  },
  {
    id: 'p3',
    label: 'P3',
    shipName: 'LAST CALL',
    accent: 'var(--role-wpn)',
    cockpitId: 'basic-cockpit-2000',
    partIds: ['generator', 'photon-canon', 'mines'],
  },
  {
    // The only cockpit that shoots for 2⚔ and generates 2⚡ a down.
    id: 'p4',
    label: 'P4',
    shipName: 'DEEP CUT',
    accent: 'var(--role-shd)',
    cockpitId: 'advanced-cp-3k',
    partIds: ['subspace-field', 'antimatter-torpedo', 'defense-turret'],
  },
];
