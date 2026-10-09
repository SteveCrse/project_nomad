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
 * Printed wording, attack strengths and abilities are carried over from the
 * v2 cards. Max ⚡ was re-sized for the v3 rules — energy is hit chance *and*
 * HP now, not a fuel tank — following the rules' shape rather than a balance
 * pass: common weapons hold a lot of ⚡ and hit softly, rare ones hold little
 * and hit hard. Shields carry the 1st-down icon. Power cost (tokens / upkeep)
 * comes from rarity, since no card prints one yet.
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
    energyCapacity: 5,
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
    effects: [{ type: 'generate', params: { amount: 2 } }],
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
        text: "Sacrifice 1 module or item to attack an enemy with ⚔️ equal to the card's Power Rating.",
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
    energyCapacity: 3,
    effects: [{ type: 'generate', params: { amount: 3 } }],
  },
  {
    id: 'fusion-reactor',
    name: 'Fusion Reactor',
    kind: 'part',
    role: 'GEN',
    rarity: 2,
    amount: 2,
    energyCapacity: 6,
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
    energyCapacity: 3,
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
        text: 'Modules adjacent to this one do not lose ⚡️ when damaged. (placeholder)',
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
    energyCapacity: 2,
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
    effects: [{ type: 'damage-module', params: { power: 8 } }],
  },
  {
    id: 'shock-absorber',
    name: 'Shock Absorber',
    kind: 'part',
    role: 'SHD',
    rarity: 3,
    amount: 1,
    energyCapacity: 3,
    firstDown: true,
    effects: [{ type: 'damage-reduction', params: { amount: 1 } }],
  },
  {
    id: 'subspace-field',
    name: 'Subspace Field',
    kind: 'part',
    role: 'SHD',
    rarity: 3,
    amount: 1,
    energyCapacity: 6,
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
    energyCapacity: 2,
    // Two effects on one card: the gun, and the infestation that pays for it.
    effects: [
      { type: 'damage', params: { power: 5 } },
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
        text: 'When your ship is destroyed, take the Escape Pod ship from the deck and make it your new ship base. If used as a cockpit: 2 slots, 1⚡, 1⚔️.',
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
    effects: [{ type: 'manual', text: 'Sacrifice 1 module or item to gain 20⚡️.' }],
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
