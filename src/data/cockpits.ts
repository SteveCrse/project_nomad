import type { PartCard } from '@engine/types';

/**
 * Cockpit deck. Drafted in the cockpit round, drawn one per regular enemy.
 *
 * A cockpit sits at the heart of every ship's grid and is the ship: destroy it
 * and the ship is gone. It prints its own numbers rather than carrying effects —
 *
 *   energyCapacity — max ⚡ (its HP ceiling, and its best hit chance)
 *   power          — its attack
 *   genPerDown     — what one generate action adds to it
 *   slots          — max modules, under the slot-limit size rule
 *   powerRating    — upkeep capacity, under the energy-budget size rule
 *
 * The rules: cockpits have higher base energy and attack than regular
 * modules. The commons trade evenly (Basic: all-round; Smol boi: +1⚔️ for
 * less ⚡ and fewer slots; Larry: +2⚡ for a slot); rarer ones are strictly
 * stronger.
 */
export const COCKPITS: PartCard[] = [
  {
    id: 'basic-cockpit-2000',
    name: 'Basic Cockpit 2000',
    kind: 'part',
    role: 'COCKPIT',
    rarity: 1,
    amount: 4,
    energyCapacity: 6,
    power: 3,
    genPerDown: 2,
    slots: 3,
    powerRating: 4,
    effects: [],
    art: 'n04_t.webp',
  },
  {
    id: 'smol-boi',
    name: 'Smol boi',
    kind: 'part',
    role: 'COCKPIT',
    rarity: 1,
    amount: 2,
    energyCapacity: 5,
    power: 4,
    genPerDown: 2,
    slots: 2,
    powerRating: 3,
    effects: [],
    art: 't_13.webp',
  },
  {
    id: 'larry-the-marauder',
    name: 'Larry - The Marauder',
    kind: 'part',
    role: 'COCKPIT',
    rarity: 1,
    amount: 2,
    energyCapacity: 8,
    power: 3,
    genPerDown: 2,
    slots: 2,
    powerRating: 3,
    effects: [],
    art: 't_67.webp',
  },
  {
    id: 'bfc',
    name: 'BFC',
    kind: 'part',
    role: 'COCKPIT',
    rarity: 2,
    amount: 2,
    energyCapacity: 7,
    power: 4,
    genPerDown: 2,
    slots: 5,
    powerRating: 6,
    effects: [],
    art: 't_75.webp',
  },
  {
    id: 'advanced-cp-3k',
    name: 'Advanced CP 3K',
    kind: 'part',
    role: 'COCKPIT',
    rarity: 3,
    amount: 1,
    energyCapacity: 8,
    power: 4,
    genPerDown: 3,
    slots: 4,
    powerRating: 6,
    effects: [],
    art: 't_72.webp',
  },
];
