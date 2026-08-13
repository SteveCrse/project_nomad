import type { PartCard } from '@engine/types';

/**
 * Parts deck. Generates enemy ships and becomes player ship components.
 *
 * Content only — adding or tuning a part must never require an engine change.
 * Cards carried over from the design's card browser keep their printed wording
 * verbatim on the `manual`/`reminder` effect that carries it; the entries added
 * to back the seeded ships are marked `placeholder` and have not been balanced.
 *
 * A card's behaviour is its `effects` list: entries from the vocabulary in
 * `engine/effects.ts`, each with its own numbers, its own ⚡ `cost` and its own
 * `dice`. `compileCard` folds those into the flat fields the engine resolves,
 * so retuning a card is a number change here (or in the deck editor) and
 * nothing else. Anything the vocabulary can't express is `manual` — the tool
 * still spends the down and the energy, and the table adjudicates the payload.
 *
 * There is no printed-text field: what a card says is derived from what it
 * does, so a card can't be retuned into contradicting itself.
 */
export const PARTS: PartCard[] = [
  // ---- cockpits ----
  //
  // A cockpit is a weapon, a shield and a generator in one, and it is the only
  // durability a ship has: `power` is the basic attack (one down, no ⚡),
  // `energyCapacity` is the basic shield (its max ⚡), and `genPerDown` is what
  // one down of the basic generator puts back into it.
  //
  // They carry no effects: all three are intrinsic to being a cockpit rather
  // than fitted to one, and `printedLines` prints them off these numbers.
  //
  // Copies deviate from the design sheet's 1-each: the Parts deck delimits
  // enemy ships on the next cockpit drawn, so at one-in-fifty every enemy
  // spawns enormous. These keep cockpits at roughly the one-in-five the rules
  // doc assumes, weighted toward the commons.
  {
    id: 'basic-cockpit-2000',
    name: 'Basic Cockpit 2000',
    kind: 'part',
    partType: 'cockpit',
    role: 'OTH',
    rarity: 1,
    amount: 4,
    slots: 4,
    power: 1,
    energyCapacity: 5,
    genPerDown: 1,
    effects: [],
    art: 'n04_t.webp',
  },
  {
    id: 'smol-boi',
    name: 'Smol boi',
    kind: 'part',
    partType: 'cockpit',
    role: 'OTH',
    rarity: 1,
    amount: 3,
    slots: 2,
    power: 1,
    energyCapacity: 4,
    genPerDown: 1,
    effects: [],
    art: 't_13.webp',
  },
  {
    id: 'larry-the-marauder',
    name: 'Larry - The Marauder',
    kind: 'part',
    partType: 'cockpit',
    role: 'OTH',
    rarity: 1,
    amount: 2,
    slots: 4,
    power: 1,
    energyCapacity: 10,
    genPerDown: 1,
    effects: [],
    art: 't_67.webp',
  },
  {
    id: 'bfc',
    name: 'BFC',
    kind: 'part',
    partType: 'cockpit',
    role: 'OTH',
    rarity: 2,
    amount: 2,
    slots: 8,
    power: 1,
    energyCapacity: 6,
    genPerDown: 1,
    effects: [],
    art: 't_75.webp',
  },
  {
    id: 'advanced-cp-3k',
    name: 'Advanced CP 3K',
    kind: 'part',
    partType: 'cockpit',
    role: 'OTH',
    rarity: 3,
    amount: 1,
    slots: 4,
    power: 2,
    energyCapacity: 8,
    genPerDown: 2,
    effects: [],
    art: 't_72.webp',
  },

  // ---- rarity 1 ----
  {
    id: 'photon-canon',
    name: 'Photon Canon',
    kind: 'part',
    partType: 'active-module',
    role: 'WPN',
    rarity: 1,
    amount: 3,
    energyCapacity: 1,
    effects: [{ type: 'damage', params: { power: 2 }, cost: 1 }],
  },
  {
    id: 'kinetic-shield',
    name: 'Kinetic Shield',
    kind: 'part',
    partType: 'passive-module',
    role: 'SHD',
    rarity: 1,
    amount: 3,
    energyCapacity: 5,
    effects: [{ type: 'absorb' }],
  },
  {
    id: 'garbage-cannon',
    name: 'Garbage Cannon',
    kind: 'part',
    partType: 'active-module',
    role: 'WPN',
    rarity: 1,
    amount: 3,
    energyCapacity: 0,
    // Sacrificing a card for a variable payload isn't in the vocabulary.
    effects: [
      {
        type: 'manual',
        text: "Sacrifice 1 module or item to attack an enemy with ⚔️ equal to the card's Power Rating.",
      },
    ],
  },

  // ---- rarity 2 ----
  {
    id: 'solar-panels',
    name: 'Solar Panels',
    kind: 'part',
    partType: 'passive-module',
    role: 'GEN',
    rarity: 2,
    amount: 3,
    energyCapacity: 2,
    effects: [{ type: 'generate', params: { amount: 1 } }],
  },
  {
    id: 'overflow-distributor',
    name: 'Overflow Distributor',
    kind: 'part',
    partType: 'passive-module',
    role: 'RDS',
    rarity: 2,
    amount: 3,
    energyCapacity: 2,
    effects: [
      { type: 'free-reroute' },
      {
        type: 'reminder',
        text: 'Whenever a module gains ⚡️ when it is full, you may reroute it immediately.',
      },
    ],
  },

  // ---- rarity 3 ----
  {
    id: 'laser-array',
    name: 'Laser Array',
    kind: 'part',
    partType: 'active-module',
    role: 'WPN',
    rarity: 3,
    amount: 1,
    energyCapacity: 5,
    // All of this card's damage comes off the dice, so its own power is 0 and
    // `perHit` is the number worth tuning. The cost is per die: spend X⚡ →
    // cast X🎲.
    effects: [
      {
        type: 'damage',
        params: { power: 0 },
        cost: 1,
        dice: { count: 'variable', die: 'd6', hitUnder: 1, perHit: 10 },
      },
    ],
  },
  {
    id: 'shock-absorber',
    name: 'Shock Absorber',
    kind: 'part',
    partType: 'passive-module',
    role: 'SHD',
    rarity: 3,
    amount: 1,
    energyCapacity: 2,
    effects: [{ type: 'damage-reduction', params: { amount: 1 } }],
  },

  // ---- rarity 4 ----
  {
    id: 'quantum-collapse-converter',
    name: 'Quantum Collapse Converter',
    kind: 'part',
    partType: 'active-module',
    role: 'GEN',
    rarity: 4,
    amount: 1,
    energyCapacity: 10,
    effects: [
      {
        type: 'gain-energy',
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
    partType: 'active-module',
    role: 'WPN',
    rarity: 4,
    amount: 1,
    // Printed capacity is 1⚡, which can never pay this card's own 2⚡ cost.
    // Raised to 4 so the card is testable.
    energyCapacity: 4,
    // Two effects on one card: the gun, and the infestation that pays for it.
    effects: [
      { type: 'damage', params: { power: 5 }, cost: 2 },
      { type: 'drain', params: { amount: 1 } },
    ],
  },
  {
    id: 'escape-pod',
    name: 'Escape Pod',
    kind: 'part',
    partType: 'passive-module',
    role: 'OTH',
    rarity: 4,
    amount: 1,
    energyCapacity: null,
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
    partType: 'active-module',
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
    partType: 'passive-module',
    role: 'RDS',
    rarity: 5,
    amount: 1,
    energyCapacity: 0,
    effects: [
      { type: 'free-reroute' },
      {
        type: 'reminder',
        text: 'Modules can use ⚡️ from other modules without rerouting (except when taking damage).',
      },
    ],
  },

  // ---- placeholders backing the seeded ships: numbers not balanced ----
  {
    id: 'gauss-canon',
    name: 'Gauss Canon',
    kind: 'part',
    partType: 'active-module',
    role: 'WPN',
    rarity: 2,
    amount: 2,
    energyCapacity: 6,
    effects: [{ type: 'damage', params: { power: 4 }, cost: 3 }],
  },
  {
    id: 'fusion-reactor',
    name: 'Fusion Reactor',
    kind: 'part',
    partType: 'passive-module',
    role: 'GEN',
    rarity: 2,
    amount: 2,
    energyCapacity: 2,
    effects: [{ type: 'generate', params: { amount: 2 } }],
  },
  {
    id: 'generator',
    name: 'Generator',
    kind: 'part',
    partType: 'passive-module',
    role: 'GEN',
    rarity: 1,
    amount: 4,
    energyCapacity: 3,
    effects: [{ type: 'generate', params: { amount: 1 } }],
  },
  {
    id: 'aerogel-insulators',
    name: 'Aerogel Insulators',
    kind: 'part',
    partType: 'passive-module',
    role: 'GEN',
    rarity: 2,
    amount: 2,
    energyCapacity: 1,
    effects: [
      {
        type: 'reminder',
        text: 'Modules adjacent to this one do not lose ⚡️ when damaged. (placeholder)',
      },
    ],
  },
  {
    id: 'medium-shields',
    name: 'Medium Shields',
    kind: 'part',
    partType: 'passive-module',
    role: 'SHD',
    rarity: 2,
    amount: 2,
    energyCapacity: 10,
    effects: [{ type: 'absorb' }],
  },
  {
    id: 'subspace-field',
    name: 'Subspace Field',
    kind: 'part',
    partType: 'passive-module',
    role: 'SHD',
    rarity: 3,
    amount: 1,
    energyCapacity: 7,
    specialization: 'tank',
    effects: [{ type: 'absorb' }],
  },
  {
    id: 'defense-turret',
    name: 'Defense Turret',
    kind: 'part',
    partType: 'active-module',
    role: 'SHD',
    rarity: 2,
    amount: 2,
    energyCapacity: 4,
    // No `absorb`: its charge pays for the negate rather than soaking passively.
    effects: [{ type: 'negate-next-attack', cost: 2 }],
  },
  {
    id: 'antimatter-torpedo',
    name: 'Antimatter Torpedo',
    kind: 'part',
    partType: 'active-module',
    role: 'WPN',
    rarity: 3,
    amount: 1,
    energyCapacity: 4,
    specialization: 'dps',
    effects: [{ type: 'damage-module', params: { power: 8 }, cost: 4 }],
  },
  {
    id: 'mines',
    name: 'Mines',
    kind: 'part',
    partType: 'active-module',
    role: 'WPN',
    rarity: 1,
    amount: 3,
    energyCapacity: 2,
    effects: [{ type: 'retaliate', params: { amount: 3 }, cost: 2 }],
  },
  {
    id: 'cargo-bay',
    name: 'Cargo Bay',
    kind: 'part',
    partType: 'passive-module',
    role: 'OTH',
    rarity: 1,
    amount: 3,
    energyCapacity: 1,
    effects: [{ type: 'scrap-cap', params: { amount: 1 } }],
  },
  {
    id: 'comms-array',
    name: 'Comms Array',
    kind: 'part',
    partType: 'passive-module',
    role: 'OTH',
    rarity: 2,
    amount: 2,
    energyCapacity: 0,
    specialization: 'support',
    effects: [
      {
        type: 'reminder',
        text: 'Another player in your sector may spend your ⚡️. (placeholder)',
      },
    ],
  },
  {
    id: 'decoy',
    name: 'Decoy',
    kind: 'part',
    partType: 'passive-module',
    role: 'SHD',
    rarity: 1,
    amount: 2,
    energyCapacity: 0,
    effects: [
      {
        type: 'reminder',
        text: 'The first attack each combat targets the Decoy instead. (placeholder)',
      },
    ],
  },
];
