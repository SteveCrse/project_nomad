import type { PartId, PlayerId } from '@engine/types';

/**
 * Seeded table state for the test tool.
 *
 * This is scenario content, not engine state — it's what the Table and Ship
 * Builder views render before real game state exists. Slots reference parts by
 * id so nothing here duplicates card text.
 */

export interface SeedSlot {
  /** null = empty slot. */
  partId: PartId | null;
  /** Current charge in this module's pool; capacity comes from the part. */
  energy?: number;
  /** Slot blown out in combat — occupied but dead. */
  adrift?: boolean;
}

export interface SeedShip {
  id: PlayerId;
  /** Seat label. */
  label: string;
  shipName: string;
  accent: string;
  hp: number;
  hpMax: number;
  /** Downs spent in the current set. */
  downsUsed: number;
  ap: number;
  apMax: number;
  /** Cards currently in this player's scrap deck. */
  scrapCount: number;
  gridCols: number;
  slots: SeedSlot[];
}

const empty: SeedSlot = { partId: null };
const cockpit: SeedSlot = { partId: 'cockpit-mk3' };

export const SEED_PLAYERS: SeedShip[] = [
  {
    id: 'p1',
    label: 'P1',
    shipName: 'MAGPIE',
    accent: 'var(--role-gen)',
    hp: 42,
    hpMax: 60,
    downsUsed: 1,
    ap: 2,
    apMax: 2,
    scrapCount: 2,
    gridCols: 5,
    slots: [
      { partId: 'solar-panels', energy: 2 },
      cockpit,
      { partId: 'gauss-canon', energy: 4 },
      { partId: 'overflow-distributor', energy: 2 },
      empty,
      empty,
      { partId: 'shock-absorber', energy: 1 },
      { partId: 'cargo-bay', energy: 1 },
      empty,
      empty,
    ],
  },
  {
    id: 'p2',
    label: 'P2',
    shipName: 'RUSTBUCKET',
    accent: 'var(--role-rds)',
    hp: 55,
    hpMax: 60,
    downsUsed: 0,
    ap: 1,
    apMax: 2,
    scrapCount: 3,
    gridCols: 5,
    slots: [
      { partId: 'fusion-reactor', energy: 2 },
      cockpit,
      { partId: 'overflow-distributor', energy: 2 },
      { partId: 'laser-array', energy: 5 },
      empty,
      empty,
      { partId: 'medium-shields', energy: 7 },
      empty,
      empty,
      empty,
    ],
  },
  {
    id: 'p3',
    label: 'P3',
    shipName: 'LAST CALL',
    accent: 'var(--role-wpn)',
    hp: 12,
    hpMax: 60,
    downsUsed: 3,
    ap: 0,
    apMax: 2,
    scrapCount: 1,
    gridCols: 5,
    slots: [
      { partId: null, adrift: true },
      cockpit,
      { partId: 'photon-canon', energy: 1 },
      empty,
      empty,
      empty,
      { partId: 'generator', energy: 3 },
      empty,
      empty,
      empty,
    ],
  },
  {
    id: 'p4',
    label: 'P4',
    shipName: 'DEEP CUT',
    accent: 'var(--role-shd)',
    hp: 60,
    hpMax: 60,
    downsUsed: 0,
    ap: 2,
    apMax: 2,
    scrapCount: 4,
    gridCols: 5,
    slots: [
      { partId: 'subspace-field', energy: 5 },
      cockpit,
      { partId: 'antimatter-torpedo', energy: 4 },
      { partId: 'defense-turret', energy: 3 },
      empty,
      empty,
      { partId: 'aerogel-insulators', energy: 1 },
      { partId: 'comms-array', energy: 0 },
      empty,
      empty,
    ],
  },
];

/** The enemy ship currently on the table, rolled from the Parts deck. */
export const SEED_ENEMY = {
  statBlockId: 'scavenger-chain',
  hp: 18,
  hpMax: 24,
  downsUsed: 1,
  gridCols: 3,
  slots: [
    { partId: 'photon-canon', energy: 1 },
    { partId: 'kinetic-shield', energy: 3 },
    empty,
    { partId: 'generator', energy: 3 },
    { partId: 'mines', energy: 2 },
    empty,
  ] as SeedSlot[],
};

/** Modules hoarded in the active player's scrap deck, awaiting a rearrange point. */
export const SEED_SCRAP: SeedSlot[] = [
  { partId: 'solar-panels', energy: 0 },
  { partId: 'cargo-bay', energy: 0 },
  { partId: 'decoy', energy: 0 },
  empty,
];

/** Deck counters shown on the table. */
export const SEED_TABLE = {
  seed: 4471,
  sector: 7,
  round: 4,
  turn: 'P2',
  lootRemaining: 92,
  encounterRemaining: 33,
  enemyDraw: 4,
  discard: 11,
  activePlayerId: 'p2',
};
