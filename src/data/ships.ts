import type { Loadout } from '@engine/types';

/**
 * Starting ships for a playtest run.
 *
 * Scenario content, not engine state: `newRun` builds real `Ship`s out of
 * these by looking each part up in the Parts data, so nothing here duplicates
 * card text or hard-codes slot geometry.
 */
export const STARTING_LOADOUTS: Loadout[] = [
  {
    id: 'p1',
    label: 'P1',
    shipName: 'MAGPIE',
    accent: 'var(--role-gen)',
    cockpitId: 'cockpit-mk3',
    partIds: [
      'solar-panels',
      'gauss-canon',
      'overflow-distributor',
      'shock-absorber',
      'cargo-bay',
    ],
  },
  {
    id: 'p2',
    label: 'P2',
    shipName: 'RUSTBUCKET',
    accent: 'var(--role-rds)',
    cockpitId: 'cockpit-mk3',
    partIds: ['fusion-reactor', 'overflow-distributor', 'laser-array', 'medium-shields'],
  },
  {
    id: 'p3',
    label: 'P3',
    shipName: 'LAST CALL',
    accent: 'var(--role-wpn)',
    cockpitId: 'cockpit-scavenger',
    partIds: ['generator', 'photon-canon', 'mines', 'kinetic-shield'],
  },
  {
    id: 'p4',
    label: 'P4',
    shipName: 'DEEP CUT',
    accent: 'var(--role-shd)',
    cockpitId: 'cockpit-mk3',
    partIds: [
      'subspace-field',
      'antimatter-torpedo',
      'defense-turret',
      'aerogel-insulators',
      'comms-array',
    ],
  },
];
