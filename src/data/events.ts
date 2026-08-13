import type { EventCard } from '@engine/types';

/**
 * Events deck. Drawn on Event steps.
 *
 * The structured fields (`grantsLoot`, `damage`, `spawnsCombat`,
 * `placesMarker`) are what the engine resolves; anything the card asks a
 * player to decide is still decided at the table.
 */
export const EVENTS: EventCard[] = [
  {
    id: 'gravity-well',
    name: 'Gravity Well',
    kind: 'event',
    subtype: 'Empty Space · Board Change',
    rarity: 1,
    amount: 1,
    placesMarker: true,
    marker: 'GRAVITY WELL',
    grantsLoot: 1,
    text: 'Place a Gravity Well chit on this sector. Players on this sector must spend 1 additional ⚡️ to leave it. Draw 1 loot.',
  },
  {
    id: 'shipwreck',
    name: 'Shipwreck',
    kind: 'event',
    subtype: 'Empty Space · Player Event',
    rarity: 1,
    amount: 1,
    grantsLoot: 1,
    text: 'INVESTIGATE — ⚀ It’s a trap! Draw 1😈 · ⚁⚂ Nothing valuable · ⚃⚄ Draw 1 common loot · ⚅ Draw 1 rare loot. Or LEAVE IT BE.',
    flavor: 'You happen upon a derelict husk of what used to be a ship.',
  },
  {
    id: 'debris-field',
    name: 'Debris Field',
    kind: 'event',
    subtype: 'Hazard · Damage',
    rarity: 1,
    amount: 2,
    damage: 4,
    text: 'Every ship in this sector takes 4⚔️ as it grinds through the wreckage. (placeholder)',
  },
  {
    id: 'ambush',
    name: 'Ambush',
    kind: 'event',
    subtype: 'Hazard · Combat',
    rarity: 2,
    amount: 2,
    spawnsCombat: true,
    text: 'Something was waiting in the dust. Fight it. (placeholder)',
  },
];
