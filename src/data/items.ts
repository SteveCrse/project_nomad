import type { ItemCard } from '@engine/types';

/**
 * Items deck. Drawn on Loot steps — distinct from the Parts deck.
 *
 * Items carry the same effect vocabulary modules do. Played from hand for a
 * down, they have no energy of their own — so nothing to pay a cost with, and
 * nothing to roll an attack against: an item's attack always lands.
 */
export const ITEMS: ItemCard[] = [
  {
    id: 'directed-emp',
    name: 'Directed EMP',
    kind: 'item',
    role: 'WPN',
    rarity: 2,
    amount: 3,
    // The rules' EMP card: an enemy module drained to 0 — not destroyed,
    // so it can still be looted.
    effects: [{ type: 'emp' }],
  },
  {
    id: 'omega-13',
    name: 'Omega-13',
    kind: 'item',
    role: 'OTH',
    rarity: 3,
    amount: 1,
    effects: [{ type: 'manual', text: 'Reroll any die roll.' }],
    flavor: 'Activate the Omega-13!',
  },
  {
    id: 'scrap-torch',
    name: 'Scrap Torch',
    kind: 'item',
    role: 'WPN',
    rarity: 1,
    amount: 4,
    // Placeholder — gives Loot steps something to pay out.
    effects: [{ type: 'damage', params: { power: 3 } }],
  },
  {
    id: 'patch-kit',
    name: 'Patch Kit',
    kind: 'item',
    role: 'SHD',
    rarity: 1,
    amount: 3,
    effects: [{ type: 'restore-shield', params: { amount: 5 } }],
  },
];
