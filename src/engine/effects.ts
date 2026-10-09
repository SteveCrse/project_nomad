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
 * can't express (`manual`, `reminder`): the editor exposes their phrasing and
 * nothing else, because their payload lives on the table rather than in a
 * parameter.
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
  /** Active effects cost a down to fire; passives are on while the module is online. */
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
  /** Resolved at the table — the wording is the card's, not ours. */
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
    summary:
      'Roll a d6 against this module’s ⚡ — at or under it hits. A hit takes ⚔️ worth of ⚡ off the target (at least 1).',
    kinds: ['part', 'item'],
    params: [param('power', 'Attack', 2, '⚔️')],
    template: 'Attack for {power}.',
    role: 'WPN',
  },
  'damage-module': {
    type: 'damage-module',
    label: 'Precision attack',
    timing: 'active',
    summary: 'An attack that may pick any module on the enemy ship — the shields in front don’t stop it.',
    kinds: ['part', 'item'],
    params: [param('power', 'Attack', 4, '⚔️')],
    template: 'Attack any module for {power}, shields or not.',
    role: 'WPN',
  },
  generate: {
    type: 'generate',
    label: 'Generate ⚡',
    timing: 'active',
    summary:
      'The generate action: output lands on this module. With a hit rule on the dice it’s a gamble — a miss costs the loss instead.',
    kinds: ['part'],
    params: [param('amount', 'Output', 2, '⚡'), param('loseOnMiss', 'Lose on a miss', 0, '⚡')],
    template: 'Generate {amount} on this module.[ On a miss, lose {loseOnMiss} instead.]',
    role: 'GEN',
  },
  emp: {
    type: 'emp',
    label: 'EMP',
    timing: 'active',
    summary:
      'Drain one enemy module to 0⚡ without destroying it. It stays offline until recharged, and can still be looted.',
    kinds: ['part', 'item'],
    params: [],
    template: 'Drain one enemy module to 0⚡ — offline, not destroyed.',
  },
  'restore-shield': {
    type: 'restore-shield',
    label: 'Recharge the cockpit',
    timing: 'active',
    summary: 'Put ⚡ straight onto your own cockpit, up to its max.',
    kinds: ['part', 'item'],
    params: [param('amount', 'Recharge', 2, '⚡')],
    template: 'Put {amount} onto your cockpit.',
  },
  'negate-next-attack': {
    type: 'negate-next-attack',
    label: 'Negate the next hit',
    timing: 'active',
    summary: 'The next hit on this ship does nothing at all.',
    kinds: ['part', 'item'],
    params: [],
    template: 'The next hit on your ship is negated.',
    role: 'SHD',
  },
  retaliate: {
    type: 'retaliate',
    label: 'Retaliate',
    timing: 'active',
    summary: 'The next enemy to hit this ship takes a hit straight back.',
    kinds: ['part', 'item'],
    params: [param('amount', 'Hit back', 3, '⚔️')],
    template: 'The next enemy to hit you takes a {amount} hit back.',
    role: 'WPN',
  },
  manual: {
    type: 'manual',
    label: 'Manual — resolved at the table',
    timing: 'active',
    summary:
      'Spends the down and leaves the payload to the table. The honest option for a rule the vocabulary can’t express.',
    kinds: ['part', 'item'],
    params: [],
    template: 'Resolve this card’s text at the table.',
    coded: true,
  },

  // ------------------------------------------------------------ passive
  'damage-reduction': {
    type: 'damage-reduction',
    label: 'Soften hits',
    timing: 'passive',
    summary: 'Every hit on this ship removes less ⚡ — never under 1 — paid for with 1⚡ from this module.',
    kinds: ['part'],
    params: [param('amount', 'Cut', 1, '⚔️')],
    template: 'Hits on your ship remove {amount} less (never under 1⚡). Costs this module 1⚡ each time.',
    role: 'SHD',
  },
  drain: {
    type: 'drain',
    label: 'Drain the ship',
    timing: 'passive',
    summary: 'Bleeds ⚡ off every module at the start of each turn — the downside half of a card.',
    kinds: ['part'],
    params: [param('amount', 'Per turn', 1, '⚡')],
    template: 'At the start of your turn, drains {amount} from every module.',
  },
  'free-reroute': {
    type: 'free-reroute',
    label: 'Free rerouting',
    timing: 'passive',
    summary: 'Moving ⚡ between modules costs no down.',
    kinds: ['part'],
    params: [],
    template: 'Rerouting ⚡ costs no down.',
    role: 'RDS',
  },
  'scrap-cap': {
    type: 'scrap-cap',
    label: 'Raise the scrap deck cap',
    timing: 'passive',
    summary: 'Carry more spare modules.',
    kinds: ['part'],
    params: [param('amount', 'Extra slots', 1, '', 9)],
    template: 'Raises your scrap deck cap by {amount}.',
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
    label: 'Hazard hit',
    timing: 'event',
    summary: 'Every ship in the sector takes a hit, on its front shield or its cockpit.',
    kinds: ['event'],
    params: [param('amount', 'Strength', 2, '⚔️')],
    template: 'Every ship in this sector takes a {amount} hit.',
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

/** Effects that put a hit on a target — what makes a module a weapon. */
export const DAMAGE_EFFECTS: EffectType[] = ['damage', 'damage-module'];

export const isDamageEffect = (type: EffectType): boolean => DAMAGE_EFFECTS.includes(type);

/** Only active effects take a down. */
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
