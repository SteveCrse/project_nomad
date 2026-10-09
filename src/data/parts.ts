import type { PartCard } from '@engine/types';

/**
 * Parts deck: modules. Builds the players' ships in the draft, and every
 * regular enemy (mission depth + players of them).
 *
 * Content only — adding or tuning a part must never require an engine change.
 * A card's behaviour is its `effects` list, from the vocabulary in
 * `engine/effects.ts`; its role carries rules of its own (nothing may sit in
 * front of a shield and it covers its column, a weapon never sits in front of
 * the cockpit, only generators and cockpits produce ⚡).
 *
 * Balanced on the rules' line: 1⚡ spent is worth attack ÷ 6 damage, and the
 * deck's copy-weighted average attack (cockpits and weapons) is ≈3.5, so 1⚡ ≈
 * 0.6 damage. A hit's overflow is lost, so ⚔️ past ~6 buys nothing. Draft cost
 * is the price: 1 token not spent is 1 starting ⚡, so a module must beat
 * that. Weapons climb in ⚡ efficiency (⚔️ ÷ 6) with rarity — photon .33,
 * gauss .67, laser .83, torpedo / railgun 1.0 — while commons hold more ⚡
 * for reliable shots. Generators beat the cockpit's 2⚡ per generate, which
 * is what pays for the reroute. Shields carry the 1st-down icon and take
 * 2 (kinetic) to 4 (subspace) average hits to break. Power cost (tokens /
 * upkeep) comes from rarity, since no card prints one yet.
 *
 * Expected damage = attack × energy ÷ 6 — the deck sheet prints it per card.
 */
export const PARTS: PartCard[] = [
  // ---- rarity 1 ----
  {
    id: 'photon-canon',
    name: 'Photon Canon',
    kind: 'part',
    role: 'WPN',
    rarity: 1,
    amount: 5,
    energyCapacity: 6,
    effects: [{ type: 'damage', params: { power: 2 } }],
  },
  {
    id: 'kinetic-shield',
    name: 'Kinetic Shield',
    kind: 'part',
    role: 'SHD',
    rarity: 1,
    amount: 5,
    energyCapacity: 3,
    firstDown: true,
    effects: [],
  },
  {
    id: 'generator',
    name: 'Generator',
    kind: 'part',
    role: 'GEN',
    rarity: 1,
    amount: 5,
    energyCapacity: 4,
    effects: [{ type: 'generate', params: { amount: 3 } }],
  },
  {
    id: 'garbage-cannon',
    name: 'Garbage Cannon',
    kind: 'part',
    role: 'WPN',
    rarity: 1,
    amount: 2,
    energyCapacity: 3,
    // Sacrificing a card for a variable payload isn't in the vocabulary.
    effects: [
      {
        type: 'manual',
        text: 'Sacrifice 1 of your other modules: deal a hit with ⚔️ equal to its max ⚡. It always lands.',
      },
    ],
  },
  {
    id: 'mines',
    name: 'Mines',
    kind: 'part',
    role: 'WPN',
    rarity: 1,
    amount: 3,
    energyCapacity: 3,
    effects: [{ type: 'retaliate', params: { amount: 3 }, cost: 2 }],
  },
  {
    id: 'cargo-bay',
    name: 'Cargo Bay',
    kind: 'part',
    role: 'OTH',
    rarity: 1,
    amount: 2,
    energyCapacity: 2,
    effects: [{ type: 'scrap-cap', params: { amount: 1 } }],
  },
  {
    id: 'decoy',
    name: 'Decoy',
    kind: 'part',
    role: 'SHD',
    rarity: 1,
    amount: 3,
    energyCapacity: 2,
    firstDown: true,
    effects: [
      {
        type: 'reminder',
        text: 'The first attack each combat targets the Decoy instead. (placeholder)',
      },
    ],
  },

  // ---- rarity 2 ----
  {
    id: 'solar-panels',
    name: 'Solar Panels',
    kind: 'part',
    role: 'GEN',
    rarity: 2,
    amount: 2,
    energyCapacity: 4,
    effects: [{ type: 'generate', params: { amount: 4 } }],
  },
  {
    id: 'fusion-reactor',
    name: 'Fusion Reactor',
    kind: 'part',
    role: 'GEN',
    rarity: 2,
    amount: 2,
    energyCapacity: 8,
    effects: [{ type: 'generate', params: { amount: 3 } }],
  },
  {
    id: 'overflow-distributor',
    name: 'Overflow Distributor',
    kind: 'part',
    role: 'RDS',
    rarity: 2,
    amount: 2,
    energyCapacity: 3,
    effects: [{ type: 'free-reroute' }],
  },
  {
    id: 'gauss-canon',
    name: 'Gauss Canon',
    kind: 'part',
    role: 'WPN',
    rarity: 2,
    amount: 2,
    energyCapacity: 4,
    effects: [{ type: 'damage', params: { power: 4 } }],
  },
  {
    id: 'medium-shields',
    name: 'Medium Shields',
    kind: 'part',
    role: 'SHD',
    rarity: 2,
    amount: 2,
    energyCapacity: 5,
    firstDown: true,
    // The rules' own example of a printed placement limit.
    placement: [{ rule: 'not-in-front-of', role: 'SHD' }],
    effects: [],
  },
  {
    id: 'defense-turret',
    name: 'Defense Turret',
    kind: 'part',
    role: 'SHD',
    rarity: 2,
    amount: 2,
    energyCapacity: 3,
    firstDown: true,
    effects: [{ type: 'negate-next-attack', cost: 2 }],
  },
  {
    id: 'aerogel-insulators',
    name: 'Aerogel Insulators',
    kind: 'part',
    role: 'OTH',
    rarity: 2,
    amount: 2,
    energyCapacity: 2,
    effects: [
      {
        type: 'reminder',
        text: 'Hits on modules adjacent to this one remove 1⚡ less (never under 1). (placeholder)',
      },
    ],
  },
  {
    id: 'comms-array',
    name: 'Comms Array',
    kind: 'part',
    role: 'OTH',
    rarity: 2,
    amount: 1,
    energyCapacity: 2,
    specialization: 'support',
    effects: [
      {
        type: 'reminder',
        text: 'Another player in your sector may spend your ⚡️. (placeholder)',
      },
    ],
  },

  // ---- rarity 3 ----
  {
    id: 'laser-array',
    name: 'Laser Array',
    kind: 'part',
    role: 'WPN',
    rarity: 3,
    amount: 1,
    energyCapacity: 3,
    effects: [{ type: 'damage', params: { power: 5 } }],
  },
  {
    id: 'antimatter-torpedo',
    name: 'Antimatter Torpedo',
    kind: 'part',
    role: 'WPN',
    rarity: 3,
    amount: 1,
    energyCapacity: 2,
    specialization: 'dps',
    effects: [{ type: 'damage-module', params: { power: 6 } }],
  },
  {
    id: 'shock-absorber',
    name: 'Shock Absorber',
    kind: 'part',
    role: 'SHD',
    rarity: 3,
    amount: 1,
    energyCapacity: 4,
    firstDown: true,
    effects: [{ type: 'damage-reduction', params: { amount: 2 } }],
  },
  {
    id: 'subspace-field',
    name: 'Subspace Field',
    kind: 'part',
    role: 'SHD',
    rarity: 3,
    amount: 1,
    energyCapacity: 8,
    firstDown: true,
    specialization: 'tank',
    placement: [{ rule: 'not-in-front-of', role: 'SHD' }],
    effects: [],
  },

  // ---- rarity 4 ----
  {
    id: 'quantum-collapse-converter',
    name: 'Quantum Collapse Converter',
    kind: 'part',
    role: 'GEN',
    rarity: 4,
    amount: 1,
    energyCapacity: 10,
    effects: [
      {
        type: 'generate',
        params: { amount: 10, loseOnMiss: 10 },
        dice: { count: 1, die: 'd6', hitOver: 2 },
      },
    ],
    flavor:
      "The great thing about getting energy from the improbability of the universe is that there's quite a lot of it.",
  },
  {
    id: 'infested-railgun',
    name: 'Infested Railgun',
    kind: 'part',
    role: 'WPN',
    rarity: 4,
    amount: 1,
    energyCapacity: 4,
    // Two effects on one card: the gun, and the infestation that pays for it.
    effects: [
      { type: 'damage', params: { power: 6 } },
      { type: 'drain', params: { amount: 1 } },
    ],
  },
  {
    id: 'escape-pod',
    name: 'Escape Pod',
    kind: 'part',
    role: 'OTH',
    rarity: 4,
    amount: 1,
    energyCapacity: 1,
    effects: [
      {
        type: 'reminder',
        text: 'When your cockpit is destroyed, the Escape Pod becomes your cockpit: max 1⚡, 1⚔️, generates 1⚡, 2 module slots. (placeholder)',
      },
    ],
  },

  // ---- rarity 5 ----
  {
    id: 'quorg-the-module-eater',
    name: 'Quorg the Module Eater',
    kind: 'part',
    role: 'GEN',
    rarity: 5,
    amount: 1,
    energyCapacity: 20,
    // Sacrificing a card is a table decision.
    effects: [{ type: 'manual', text: 'Sacrifice 1 of your other modules or an item: put 20⚡ on this module.' }],
  },
  {
    id: 'igrid',
    name: 'iGrid™',
    kind: 'part',
    role: 'RDS',
    rarity: 5,
    amount: 1,
    energyCapacity: 2,
    effects: [
      { type: 'free-reroute' },
      {
        type: 'reminder',
        text: 'Modules can use ⚡️ from other modules without rerouting (except when taking damage).',
      },
    ],
  },
];
