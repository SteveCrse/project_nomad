import type {
  Card,
  CardEffect,
  CardKind,
  EffectType,
  EventCard,
  ItemCard,
  PartCard,
} from './types/card';
import { EFFECTS, defaultParams, isDamageEffect } from './effects';
import type { CardId } from './types/ids';

/**
 * Turning an authored card into a card the engine can resolve.
 *
 * A card is authored as a list of `effects` with their numbers. `compileCard`
 * folds that list down into the flat fields combat and upkeep already read
 * (`power`, `generates`, `absorbs`, an event's `damage`…), which is the whole
 * trick behind editing content at runtime: retune a number in the deck editor,
 * recompile, and the next activation resolves the new value. Nothing in the
 * engine looks at a card id.
 *
 * `renderText` closes the loop on the printed side, filling `{placeholders}`
 * from those same numbers so a card's text can't drift from its behaviour.
 */

// ------------------------------------------------------------------ reading

/** An effect's value for a param, falling back to the registry default. */
export function effectParam(effect: CardEffect, key: string): number {
  const value = effect.params?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return EFFECTS[effect.type]?.params.find((p) => p.key === key)?.default ?? 0;
}

export const effectsOf = (card: Card): CardEffect[] => card.effects ?? [];

const timingOf = (effect: CardEffect): 'active' | 'passive' | undefined =>
  EFFECTS[effect.type]?.timing;

/**
 * The effects an activation resolves, in printed order.
 *
 * An active module with nothing resolvable still activates as `manual`: the
 * down and the ⚡ are spent and the table adjudicates, which is what a
 * half-built card should do rather than quietly nothing.
 */
export function activeEffects(card: Card): CardEffect[] {
  const active = effectsOf(card).filter((e) => timingOf(e) === 'active');
  if (active.length > 0) return active;
  const activatable = card.kind === 'part' ? card.partType === 'active-module' : card.kind === 'item';
  return activatable ? [{ type: 'manual' }] : [];
}

export const passiveEffects = (card: Card): CardEffect[] =>
  effectsOf(card).filter((e) => timingOf(e) === 'passive');

export const hasEffect = (card: Card, type: EffectType): boolean =>
  effectsOf(card).some((e) => e.type === type);

/** ⚔️ this card deals per activation, before dice and modifiers. */
export function attackOf(card: Card): number {
  const attack = effectsOf(card).find((e) => isDamageEffect(e.type));
  if (attack) return effectParam(attack, 'power');
  return card.kind === 'event' ? 0 : (card.power ?? 0);
}

/** A fresh effect with every param at its default. */
export const makeEffect = (type: EffectType): CardEffect => ({
  type,
  params: defaultParams(type),
});

// ---------------------------------------------------------------- compiling

/** Fold the effect list into the flat fields the engine resolves. */
export function compileCard(card: Card): Card {
  if (card.kind === 'part') return compilePart(card);
  if (card.kind === 'event') return compileEvent(card);
  return compileItem(card);
}

const finder = (card: Card) => {
  const effects = effectsOf(card);
  return {
    has: (type: EffectType) => effects.some((e) => e.type === type),
    value: (type: EffectType, key = 'amount'): number | undefined => {
      const found = effects.find((e) => e.type === type);
      return found ? effectParam(found, key) : undefined;
    },
  };
};

function compilePart(card: PartCard): PartCard {
  const { has, value } = finder(card);
  const attack = effectsOf(card).find((e) => isDamageEffect(e.type));
  return {
    ...card,
    // A cockpit's `power` is its own basic attack rather than an effect, so it
    // survives untouched unless the card carries a damage effect of its own.
    ...(attack ? { power: effectParam(attack, 'power') } : {}),
    targetsModule: has('damage-module'),
    absorbs: has('absorb'),
    freeReroute: has('free-reroute'),
    generates: value('generate'),
    damageReduction: value('damage-reduction'),
    drainPerTurn: value('drain'),
    scrapCapBonus: value('scrap-cap'),
  };
}

function compileItem(card: ItemCard): ItemCard {
  const attack = effectsOf(card).find((e) => isDamageEffect(e.type));
  return { ...card, ...(attack ? { power: effectParam(attack, 'power') } : {}) };
}

function compileEvent(card: EventCard): EventCard {
  const { has, value } = finder(card);
  return {
    ...card,
    damage: value('event-damage'),
    grantsLoot: value('grant-loot', 'count'),
    spawnsCombat: has('spawn-combat'),
    placesMarker: has('place-marker'),
  };
}

/** Compile a whole deck. The app hands the result to `makeContent`. */
export const hydrateDeck = (cards: Card[]): Card[] => cards.map(compileCard);

// ------------------------------------------------------------ printed text

const PLACEHOLDER = /\{(\w+(?:\.\w+)?)\}/g;

/**
 * The numbers a card's text may quote.
 *
 * Card stats first, then each effect's params — `{amount}` is the first
 * effect that declares one, `{2.amount}` the second effect's. An unknown
 * placeholder is left standing so a typo is visible on the card instead of
 * printing a hole.
 */
export function textScope(card: Card): Record<string, string | number> {
  const scope: Record<string, string | number> = { copies: card.amount };

  if (card.kind !== 'event') {
    if (card.energyCost !== null && card.energyCost !== undefined) scope.cost = card.energyCost;
    if (card.dice) {
      scope.dice = card.dice.count === 'variable' ? 'X' : card.dice.count;
      scope.die = card.dice.die;
      if (card.dice.perHit !== undefined) scope.perHit = card.dice.perHit;
      if (card.dice.hitUnder !== undefined) scope.hitUnder = card.dice.hitUnder;
      if (card.dice.hitOver !== undefined) scope.hitOver = card.dice.hitOver;
    }
  }
  if (card.kind === 'part') {
    if (card.energyCapacity !== null && card.energyCapacity !== undefined) {
      scope.pool = card.energyCapacity;
    }
    if (card.slots !== undefined) scope.slots = card.slots;
    if (card.genPerDown !== undefined) scope.gen = card.genPerDown;
  }
  scope.power = attackOf(card);

  effectsOf(card).forEach((effect, i) => {
    for (const p of EFFECTS[effect.type]?.params ?? []) {
      const value = effectParam(effect, p.key);
      scope[`${i + 1}.${p.key}`] = value;
      if (!(p.key in scope)) scope[p.key] = value;
    }
  });

  return scope;
}

/** Fill a card's `{placeholders}` from its own numbers. */
export function renderText(card: Card, text?: string): string {
  const source = text ?? card.text ?? '';
  if (!source.includes('{')) return source;
  const scope = textScope(card);
  return source.replace(PLACEHOLDER, (whole, key: string) =>
    key in scope ? String(scope[key]) : whole,
  );
}

/** Placeholders still unresolved — an authoring typo, surfaced as a warning. */
export function unknownPlaceholders(card: Card): string[] {
  const scope = textScope(card);
  const found = new Set<string>();
  for (const text of [card.text, card.status, card.flavor]) {
    for (const match of (text ?? '').matchAll(PLACEHOLDER)) {
      const key = match[1]!;
      if (!(key in scope)) found.add(key);
    }
  }
  return [...found];
}

/**
 * Draft printed text from the card's effects.
 *
 * Deliberately a *template*, not a rendered string: the placeholders stay in
 * so the text keeps tracking the numbers after the next edit. Cards worth
 * printing get their wording written by hand — this is the starting point.
 */
export function textFromEffects(card: Card): string {
  // Two effects can declare the same param name (a drain and a generator both
  // print `amount`), and a bare `{amount}` resolves to the first of them — so
  // anything after the first claim on a name gets its indexed form.
  const claimed = new Set<string>();
  const lines = effectsOf(card)
    .map((effect, i) => {
      const def = EFFECTS[effect.type];
      if (!def?.template) return '';
      return def.template.replace(PLACEHOLDER, (whole, key: string) => {
        if (!def.params.some((p) => p.key === key)) return whole;
        const indexed = claimed.has(key);
        claimed.add(key);
        return indexed ? `{${i + 1}.${key}}` : `{${key}}`;
      });
    })
    .filter(Boolean);

  const cost = card.kind !== 'event' && card.energyCost ? 'Spend {cost}⚡️. ' : '';
  return cost + lines.join(' ');
}

// -------------------------------------------------------------- authoring QA

/**
 * Everything about a card that would waste a playtest.
 *
 * The balance pass is the point of the editor, so a card that can never fire
 * — the printed Infested Railgun cost 2⚡ out of a 1⚡ pool — should say so in
 * the table rather than be discovered mid-fight.
 */
export function cardWarnings(card: Card): string[] {
  const out: string[] = [];
  const effects = effectsOf(card);

  if (card.amount < 1) out.push('no copies in the deck');
  if (!card.name.trim()) out.push('unnamed');

  const unknown = unknownPlaceholders(card);
  if (unknown.length > 0) out.push(`unknown placeholder ${unknown.map((k) => `{${k}}`).join(', ')}`);

  const actives = effects.filter((e) => EFFECTS[e.type]?.timing === 'active');
  const attack = effects.find((e) => isDamageEffect(e.type));

  if (card.kind === 'part') {
    const pool = card.energyCapacity ?? 0;
    const cost = card.energyCost ?? 0;
    if (card.partType === 'active-module') {
      if (cost > pool && !card.freeReroute) {
        out.push(`costs ${cost}⚡ out of a ${pool}⚡ pool — can never fire on its own charge`);
      }
      if (actives.length === 0) out.push('active module with no active effect');
    }
    if (card.partType === 'passive-module' && actives.length > 0) {
      out.push('passive module carrying an active effect — it will never be activated');
    }
    if (card.partType === 'cockpit') {
      if (!card.slots) out.push('cockpit with no slots');
      if (!card.energyCapacity) out.push('cockpit with no shield pool — one hit wrecks it');
    } else if (effects.length === 0) {
      out.push('no effects — inert');
    }
    if (hasEffect(card, 'absorb') && pool <= 0) out.push('absorbs ⚔️ but holds no ⚡');
  }

  if (attack && effectParam(attack, 'power') <= 0 && card.kind !== 'event' && !card.dice) {
    out.push('attack deals 0⚔️');
  }
  if (card.kind === 'event' && effects.length === 0) out.push('event resolves to nothing');

  return out;
}

// ------------------------------------------------------------ new cards

const BLANK_TEXT = 'New card — add an effect.';

/** A blank card of the given kind, ready to be filled in by the editor. */
export function blankCard(kind: CardKind, id: CardId, name = 'New Card'): Card {
  const base = { id, name, rarity: 1 as const, amount: 1, text: BLANK_TEXT, effects: [] };
  if (kind === 'item') {
    return { ...base, kind: 'item', role: 'OTH', energyCost: null, consumable: true };
  }
  if (kind === 'event') {
    return { ...base, kind: 'event', subtype: 'Empty Space · Player Event' };
  }
  return {
    ...base,
    kind: 'part',
    partType: 'active-module',
    role: 'OTH',
    energyCapacity: 2,
    energyCost: 1,
  };
}
