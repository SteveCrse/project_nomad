import type { ItemCard } from '@engine/types';

/**
 * Items deck. Drawn on Loot steps — distinct from the Parts deck.
 *
 * Items carry the same effect vocabulary modules do; played from hand they
 * have no module pool, so their ⚡ cost comes out of the seat's loose charge.
 */
export const ITEMS: ItemCard[] = [
  {
    id: 'directed-emp',
    name: 'Directed EMP',
    kind: 'item',
    role: 'WPN',
    rarity: 2,
    amount: 3,
    energyCost: 5,
    consumable: true,
    // Negation aimed at *someone else's* attack isn't in the vocabulary —
    // `negate-next-attack` shields the player who plays it.
    effects: [{ type: 'manual' }],
    text: "Spend {cost}⚡️. Select one enemy whose next attack doesn't do any damage.",
  },
  {
    id: 'omega-13',
    name: 'Omega-13',
    kind: 'item',
    role: 'OTH',
    rarity: 3,
    amount: 1,
    energyCost: null,
    consumable: true,
    effects: [{ type: 'manual' }],
    text: 'Reroll any die roll.',
    flavor: 'Activate the Omega-13!',
  },
  {
    id: 'scrap-torch',
    name: 'Scrap Torch',
    kind: 'item',
    role: 'WPN',
    rarity: 1,
    amount: 4,
    energyCost: 1,
    consumable: true,
    effects: [{ type: 'damage', params: { power: 4 } }],
    text: 'Spend {cost}⚡️. Deal {power}⚔️ to an enemy ship. (placeholder — gives Loot steps something to pay out)',
  },
  {
    id: 'patch-kit',
    name: 'Patch Kit',
    kind: 'item',
    role: 'SHD',
    rarity: 1,
    amount: 3,
    energyCost: null,
    consumable: true,
    effects: [{ type: 'restore-shield', params: { amount: 6 } }],
    text: 'Put {amount}⚡ back into your cockpit shield. (placeholder)',
  },
];
