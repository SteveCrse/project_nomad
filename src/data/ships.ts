import type { Loadout } from '@engine/types';

/**
 * Starting ships for a run with the draft switched off — the quick way into a
 * fight.
 *
 * Scenario content, not engine state: `newRun` builds real ships out of these
 * by looking each part up and laying them out on the grid by the layout
 * rules, so the order here doesn't matter. Each fits every size rule: within
 * its cockpit's slots *and* its power rating.
 *
 * With the draft on, the cockpit named here is only a placeholder hull until
 * the cockpit round hands the seat a real one.
 */
export const STARTING_LOADOUTS: Loadout[] = [
  {
    id: 'p1',
    label: 'P1',
    shipName: 'MAGPIE',
    accent: 'var(--role-gen)',
    cockpitId: 'basic-cockpit-2000',
    partIds: ['kinetic-shield', 'photon-canon', 'generator'],
  },
  {
    // The tank: the deepest cockpit, and a big shield on the front of it.
    id: 'p2',
    label: 'P2',
    shipName: 'RUSTBUCKET',
    accent: 'var(--role-rds)',
    cockpitId: 'larry-the-marauder',
    partIds: ['medium-shields', 'photon-canon', 'generator'],
  },
  {
    id: 'p3',
    label: 'P3',
    shipName: 'LAST CALL',
    accent: 'var(--role-wpn)',
    cockpitId: 'smol-boi',
    partIds: ['photon-canon', 'generator'],
  },
  {
    id: 'p4',
    label: 'P4',
    shipName: 'DEEP CUT',
    accent: 'var(--role-shd)',
    cockpitId: 'bfc',
    partIds: ['kinetic-shield', 'gauss-canon', 'fusion-reactor', 'mines'],
  },
];
