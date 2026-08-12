import type { EventCard } from '@engine/types';

/** Events deck. Drawn on Event steps. */
export const EVENTS: EventCard[] = [
  {
    id: 'gravity-well',
    name: 'Gravity Well',
    kind: 'event',
    subtype: 'Empty Space · Board Change',
    rarity: 1,
    amount: 1,
    placesMarker: true,
    text: 'Place a Gravity Well chit on this sector. Players on this sector must spend 1 additional ⚡️ to leave it. Draw 1 loot.',
  },
  {
    id: 'shipwreck',
    name: 'Shipwreck',
    kind: 'event',
    subtype: 'Empty Space · Player Event',
    rarity: 1,
    amount: 1,
    text: 'INVESTIGATE — ⚀ It’s a trap! Draw 1😈 · ⚁⚂ Nothing valuable · ⚃⚄ Draw 1 common loot · ⚅ Draw 1 rare loot. Or LEAVE IT BE.',
    flavor: 'You happen upon a derelict husk of what used to be a ship.',
  },
];
