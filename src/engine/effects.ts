import type { CardKind, EffectTiming, EffectType, ModuleRole } from './types/card';

/**
 * The effect catalogue — every building block a card can be assembled from.
 *
 * This is the contract between three places: the deck editor reads `params`
 * and `template` to offer a card's numbers for tuning, `cards.ts` compiles the
 * chosen values into the flat fields the engine resolves *and* prints the
 * card's rules text from them, and combat has a case for each
 * `timing: 'active'` entry.
 *
 * Adding an effect means adding it here *and* wiring its case; adding a
 * **card** means neither. That's the split the rest of the tool is built on.
 *
 * Effects marked `coded` are the escape hatch for one-offs the vocabulary
 * can't express (`manual`, `reminder`, and any bespoke rule added later): the
 * editor exposes their phrasing and nothing else, because their payload lives
 * in code or on the table rather than in a parameter.
 */

export interface EffectParamDef {
  key: string;
  label: string;
  /** Printed after the number, on the card and in the editor: ⚡, ⚔️, 🎲. */
  symbol?: string;
  default: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
}

export interface EffectDef {
  type: EffectType;
  label: string;
  /** Active effects cost a down (and their own ⚡) to fire; passives are always on. */
  timing: EffectTiming;
  /** One line for the picker: what it does in play. */
  summary: string;
  /** Card kinds this effect may be put on. */
  kinds: CardKind[];
  params: EffectParamDef[];
  /**
   * Printed-text fragment.
   *
   * `{param}` prints that parameter's number *and its symbol*, scaled by the
   * effect's dice where they feed the payload. `[bracketed]` segments drop out
   * when a number inside them is 0, so an unused knob prints nothing rather
   * than a dead clause.
   */
  template: string;
  /** Resolved in code or at the table — the wording is the card's, not ours. */
  coded?: boolean;
  /** Role this effect suggests when it lands on a blank card. */
  role?: ModuleRole;
}

/** Terse param constructor — every tunable is a small non-negative integer. */
const param = (
  key: string,
  label: string,
  fallback: number,
  symbol?: string,
  max = 99,
): EffectParamDef => ({
  key,
  label,
  default: fallback,
  min: 0,
  max,
  step: 1,
  ...(symbol ? { symbol } : {}),
});

export const EFFECTS: Record<EffectType, EffectDef> = {
  // ------------------------------------------------------------- active
  damage: {
    type: 'damage',
    label: 'Attack',
    timing: 'active',
    summary: 'Deal ⚔️ to one enemy ship — shields first, then its cockpit pool.',
    kinds: ['part', 'item'],
    params: [param('power', 'Attack', 2, '⚔️')],
    template: 'Deal {power} to an enemy ship.',
    role: 'WPN',
  },
  'damage-all': {
    type: 'damage-all',
    label: 'Attack all',
    timing: 'active',
    summary: 'Deal ⚔️ to every living enemy ship at once.',
    kinds: ['part', 'item'],
    params: [param('power', 'Attack', 2, '⚔️')],
    template: 'Deal {power} to every enemy ship.',
    role: 'WPN',
  },
  'damage-module': {
    type: 'damage-module',
    label: 'Attack a module',
    timing: 'active',
    summary: 'Hit one enemy module instead of its shields; overkill knocks it out.',
    kinds: ['part', 'item'],
    params: [param('power', 'Attack', 8, '⚔️')],
    template: 'Deal {power} to one enemy module.',
    role: 'WPN',
  },
  'gain-energy': {
    type: 'gain-energy',
    label: 'Gain ⚡',
    timing: 'active',
    summary:
      'Put ⚡ into this module’s own pool. With a hit rule on the dice it’s a gamble — a miss costs the loss instead.',
    kinds: ['part', 'item'],
    params: [
      param('amount', 'Gain', 5, '⚡'),
      param('loseOnMiss', 'Lose on a miss', 0, '⚡'),
    ],
    template: 'Gain {amount}.[ On a miss, lose {loseOnMiss} instead.]',
    role: 'GEN',
  },
  'restore-shield': {
    type: 'restore-shield',
    label: 'Patch the cockpit shield',
    timing: 'active',
    summary: 'Put ⚡ back into the cockpit pool — the ship’s last line.',
    kinds: ['part', 'item'],
    params: [param('amount', 'Restore', 4, '⚡')],
    template: 'Put {amount} back into your cockpit shield.',
    role: 'SHD',
  },
  'negate-next-attack': {
    type: 'negate-next-attack',
    label: 'Negate the next attack',
    timing: 'active',
    summary: 'The next attack against this ship deals nothing at all.',
    kinds: ['part', 'item'],
    params: [],
    template: 'The next attack against your ship deals no ⚔️.',
    role: 'SHD',
  },
  retaliate: {
    type: 'retaliate',
    label: 'Retaliate',
    timing: 'active',
    summary: 'The next enemy that attacks this ship takes ⚔️ straight back.',
    kinds: ['part', 'item'],
    params: [param('amount', 'Damage back', 3, '⚔️')],
    template: 'The next enemy to attack you takes {amount}.',
    role: 'WPN',
  },
  manual: {
    type: 'manual',
    label: 'Manual — resolved at the table',
    timing: 'active',
    summary:
      'Spends the down and the ⚡, and leaves the payload to the table. The honest option for a rule the vocabulary can’t express.',
    kinds: ['part', 'item'],
    params: [],
    template: 'Resolve this card’s text at the table.',
    coded: true,
  },

  // ------------------------------------------------------------ passive
  absorb: {
    type: 'absorb',
    label: 'Absorbs ⚔️',
    timing: 'passive',
    summary: 'Charged pool soaks incoming ⚔️ before the cockpit has to.',
    kinds: ['part'],
    params: [],
    template: 'Absorbs incoming ⚔️ while charged.',
    role: 'SHD',
  },
  generate: {
    type: 'generate',
    label: 'Generate ⚡',
    timing: 'passive',
    summary: 'Fills its own pool at the start of every turn.',
    kinds: ['part'],
    params: [param('amount', 'Per turn', 1, '⚡')],
    template: 'Generate {amount} at the start of your turn.',
    role: 'GEN',
  },
  'damage-reduction': {
    type: 'damage-reduction',
    label: 'Reduce incoming ⚔️',
    timing: 'passive',
    summary: 'Flat cut off every attack, paid for with 1⚡ from this module.',
    kinds: ['part'],
    params: [param('amount', 'Cut', 1, '⚔️')],
    template: 'Whenever an enemy attacks you, reduce the ⚔️ by {amount} and remove 1⚡ from this module.',
    role: 'SHD',
  },
  drain: {
    type: 'drain',
    label: 'Drain the ship',
    timing: 'passive',
    summary: 'Bleeds ⚡ off every module each turn — the downside half of a card.',
    kinds: ['part'],
    params: [param('amount', 'Per turn', 1, '⚡')],
    template: 'At the end of your turn, drains {amount} from all modules.',
  },
  'free-reroute': {
    type: 'free-reroute',
    label: 'Free rerouting',
    timing: 'passive',
    summary: 'Charge moves across the grid without spending a down.',
    kinds: ['part'],
    params: [],
    template: '⚡ can be rerouted without spending a down.',
    role: 'RDS',
  },
  'scrap-cap': {
    type: 'scrap-cap',
    label: 'Raise the Scrap Deck cap',
    timing: 'passive',
    summary: 'Carry more unfitted parts between rearrangement points.',
    kinds: ['part'],
    params: [param('amount', 'Extra slots', 1, '', 9)],
    template: 'Raises your Scrap Deck cap by {amount}.',
  },
  reminder: {
    type: 'reminder',
    label: 'Printed rule — no engine effect',
    timing: 'passive',
    summary:
      'Text the tool prints but doesn’t resolve. Use it for a rule the table applies itself, rather than leaving a card looking wired up when it isn’t.',
    kinds: ['part', 'item', 'event'],
    params: [],
    template: 'Resolve this card’s text at the table.',
    coded: true,
  },

  // ------------------------------------------------------------- events
  'event-damage': {
    type: 'event-damage',
    label: 'Hazard damage',
    timing: 'event',
    summary: 'Every ship in the sector takes ⚔️, through shields as usual.',
    kinds: ['event'],
    params: [param('amount', 'Damage', 4, '⚔️')],
    template: 'Every ship in this sector takes {amount}.',
  },
  'grant-loot': {
    type: 'grant-loot',
    label: 'Grant loot',
    timing: 'event',
    summary: 'Hands out cards off the Items deck.',
    kinds: ['event'],
    params: [param('count', 'Cards', 1, '', 9)],
    template: 'Draw {count} loot.',
  },
  'spawn-combat': {
    type: 'spawn-combat',
    label: 'Spawn a fight',
    timing: 'event',
    summary: 'The step turns into combat instead of resolving on the spot.',
    kinds: ['event'],
    params: [],
    template: 'Something was waiting here. Fight it.',
  },
  'place-marker': {
    type: 'place-marker',
    label: 'Place a marker',
    timing: 'event',
    summary: 'Drops a lasting chit on this sector — the card’s `marker` text.',
    kinds: ['event'],
    params: [],
    template: 'Place a marker on this sector.',
  },
};

export const EFFECT_LIST: EffectDef[] = Object.values(EFFECTS);

export const effectDef = (type: EffectType): EffectDef | undefined => EFFECTS[type];

/** Effects that put ⚔️ on a target — what "offensive" means for a module. */
export const DAMAGE_EFFECTS: EffectType[] = ['damage', 'damage-all', 'damage-module'];

export const isDamageEffect = (type: EffectType): boolean => DAMAGE_EFFECTS.includes(type);

/** Only active effects charge a ⚡ cost and take a down. */
export const isActiveEffect = (type: EffectType): boolean => EFFECTS[type]?.timing === 'active';

/** Effects offerable on a card of this kind, actives first. */
export function effectsForKind(kind: CardKind): EffectDef[] {
  return EFFECT_LIST.filter((def) => def.kinds.includes(kind)).sort(
    (a, b) => Number(a.timing !== 'active') - Number(b.timing !== 'active'),
  );
}

/** A fresh effect's numbers: every declared param at its default. */
export function defaultParams(type: EffectType): Record<string, number> {
  const def = EFFECTS[type];
  if (!def) return {};
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}
