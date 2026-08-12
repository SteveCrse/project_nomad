import type { ItemCard } from '@engine/types';

/** Items deck. Drawn on Loot steps — distinct from the Parts deck. */
export const ITEMS: ItemCard[] = [
  {
    id: 'directed-emp',
    name: 'Directed EMP',
    kind: 'item',
    role: 'WPN',
    rarity: 2,
    amount: 3,
    apCost: null,
    energyCost: 5,
    consumable: true,
    text: "Spend 5⚡️. Select one enemy whose next attack doesn't do any damage.",
  },
  {
    id: 'omega-13',
    name: 'Omega-13',
    kind: 'item',
    role: 'OTH',
    rarity: 3,
    amount: 1,
    apCost: 0,
    energyCost: null,
    consumable: true,
    text: 'Reroll any die roll.',
    flavor: 'Activate the Omega-13!',
  },
];
