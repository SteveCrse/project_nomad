import type { EventCard } from '@engine/types';

/**
 * Events deck. Drawn on Event steps.
 *
 * The effects (`grant-loot`, `event-damage`, `spawn-combat`, `place-marker`)
 * are what the engine resolves; anything the card asks a player to decide is
 * carried by a `reminder` and still decided at the table.
 */
export const EVENTS: EventCard[] = [
  {
    id: 'gravity-well',
    name: 'Gravity Well',
    kind: 'event',
    subtype: 'Empty Space · Board Change',
    rarity: 1,
    amount: 1,
    marker: 'GRAVITY WELL',
    effects: [
      { type: 'place-marker' },
      {
        type: 'reminder',
        text: 'Players on this sector must spend 1 additional ⚡️ to leave it.',
      },
      { type: 'grant-loot', params: { count: 1 } },
    ],
  },
  {
    id: 'shipwreck',
    name: 'Shipwreck',
    kind: 'event',
    subtype: 'Empty Space · Player Event',
    rarity: 1,
    amount: 1,
    effects: [
      {
        type: 'reminder',
        text: 'INVESTIGATE — ⚀ It’s a trap! Draw 1😈 · ⚁⚂ Nothing valuable · ⚃⚄ Draw 1 common loot · ⚅ Draw 1 rare loot. Or LEAVE IT BE.',
      },
      { type: 'grant-loot', params: { count: 1 } },
    ],
    flavor: 'You happen upon a derelict husk of what used to be a ship.',
  },
  {
    id: 'debris-field',
    name: 'Debris Field',
    kind: 'event',
    subtype: 'Hazard · Damage',
    rarity: 1,
    amount: 2,
    effects: [{ type: 'event-damage', params: { amount: 4 } }],
    flavor: 'It grinds through the wreckage.',
  },
  {
    id: 'ambush',
    name: 'Ambush',
    kind: 'event',
    subtype: 'Hazard · Combat',
    rarity: 2,
    amount: 2,
    effects: [{ type: 'spawn-combat' }],
    flavor: 'Something was waiting in the dust.',
  },
];
