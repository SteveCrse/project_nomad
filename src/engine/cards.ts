import type {
  Card,
  CardEffect,
  CardKind,
  DiceSpec,
  EffectTiming,
  EffectType,
  EventCard,
  ItemCard,
  PartCard,
} from './types/card';
import { EFFECTS, defaultParams, isActiveEffect, isDamageEffect } from './effects';
import type { EffectDef, EffectParamDef } from './effects';
import type { CardId } from './types/ids';

/**
 * Turning an authored card into a card the engine can resolve — and into the
 * text printed on its face.
 *
 * A card is authored as a list of `effects`, each carrying its own numbers,
 * its own ⚡ cost and its own dice. `compileCard` folds that list down into the
 * flat fields combat and upkeep already read (`power`, `generates`, `absorbs`,
 * an event's `damage`…), which is the whole trick behind editing content at
 * runtime: retune a number in the deck editor, recompile, and the next
 * activation resolves the new value. Nothing in the engine looks at a card id.
 *
 * `printedLines` closes the loop on the printed side. There is no authored
 * rules text to drift out of date: what a card says is *derived* from what it
 * does, every time it is drawn.
 */

// ------------------------------------------------------------------ reading

/** An effect's value for a param, falling back to the registry default. */
export function effectParam(effect: CardEffect, key: string): number {
  const value = effect.params?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return EFFECTS[effect.type]?.params.find((p) => p.key === key)?.default ?? 0;
}

export const effectsOf = (card: Card): CardEffect[] => card.effects ?? [];

export const timingOf = (effect: CardEffect): EffectTiming =>
  EFFECTS[effect.type]?.timing ?? 'passive';

/**
 * The effects an activation resolves, in printed order.
 *
 * A card is activatable exactly when it has one of these — there's no separate
 * "active module" flag to disagree with the effect list. A card carrying only
 * passives is simply never activated; its passives are on regardless.
 */
export const activeEffects = (card: Card): CardEffect[] =>
  effectsOf(card).filter((e) => timingOf(e) === 'active');

/** Can a down be spent on this card at all? */
export const isActivatable = (card: Card): boolean => activeEffects(card).length > 0;

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

// --------------------------------------------------------------------- cost

/**
 * ⚡ one firing of a single effect draws from the card's own pool.
 *
 * Cost belongs to the effect, not to the card: a module that shoots for 1⚡ and
 * patches its shield for 3 prints both, and an activation pays for what it
 * actually resolves. With variable dice the printed number is the cost *per
 * die*, so buying more dice is what makes the shot expensive.
 */
export function effectCost(effect: CardEffect, diceCount = 1): number {
  if (!isActiveEffect(effect.type)) return 0;
  const base = Math.max(0, effect.cost ?? 0);
  const perDie = effect.dice?.count === 'variable' ? Math.max(1, diceCount) : 1;
  return base * perDie;
}

/** ⚡ one whole activation draws, before `config.energyCostMult`. */
export const cardCost = (card: Card, diceCount = 1): number =>
  activeEffects(card).reduce((sum, e) => sum + effectCost(e, diceCount), 0);

/** ⚡ each bought die costs, for cards that let the player buy dice. */
export const costPerDie = (card: Card): number =>
  activeEffects(card)
    .filter((e) => e.dice?.count === 'variable')
    .reduce((sum, e) => sum + Math.max(0, e.cost ?? 0), 0);

export const hasVariableDice = (card: Card): boolean =>
  activeEffects(card).some((e) => e.dice?.count === 'variable');

/** The dice an activation rolls — one spec per effect that calls for them. */
export const diceOf = (card: Card): DiceSpec[] =>
  activeEffects(card)
    .map((e) => e.dice)
    .filter((d): d is DiceSpec => !!d);

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

/** One printed rule, and the chip that says when it happens. */
export interface PrintedLine {
  timing: EffectTiming;
  text: string;
}

const OPTIONAL = /\[([^\]]*)\]/g;
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * A parameter as printed: its number, its symbol, and whatever the effect's
 * dice add to it.
 *
 * Dice are a modifier on the effect's payload, so they're printed where the
 * payload is: `10⚔️ per hit` rather than a separate sentence the reader has to
 * join up. Only the effect's *first* parameter is the payload — the rest
 * (`loseOnMiss`) are flat numbers the roll never scales.
 */
function paramExpr(effect: CardEffect, def: EffectDef, p: EffectParamDef): string {
  const value = effectParam(effect, p.key);
  const symbol = p.symbol ?? '';
  const dice = effect.dice;
  if (!dice || def.params[0]?.key !== p.key) return `${value}${symbol}`;

  if (dice.hitUnder !== undefined || dice.hitOver !== undefined) {
    // A hit rule with no per-hit payout gates the effect instead of scaling
    // it: the dice decide whether it lands, the number is what it lands for.
    if (dice.perHit === undefined) return `${value}${symbol}`;
    const perHit = `${dice.perHit}${symbol} per hit`;
    return value > 0 ? `${value}${symbol} + ${perHit}` : perHit;
  }
  return value > 0 ? `${value}${symbol} + the roll` : `the roll in ${symbol || 'points'}`;
}

/** What to roll, and what counts as a hit. */
function diceClause(dice: DiceSpec): string {
  const count = dice.count === 'variable' ? 'X' : String(dice.count);
  const roll = `Roll ${count}${dice.die}`;
  const hits: string[] = [];
  if (dice.hitUnder !== undefined) hits.push(`${dice.hitUnder} or less`);
  if (dice.hitOver !== undefined) hits.push(`${dice.hitOver} or more`);
  return hits.length === 0 ? `${roll} and add the total.` : `${roll} — a roll of ${hits.join(' or ')} hits.`;
}

function fillTemplate(def: EffectDef, effect: CardEffect): string {
  // `[bracketed]` segments drop when a number inside them is 0, so a knob left
  // at zero prints nothing instead of a dead clause.
  const body = def.template.replace(OPTIONAL, (_whole, segment: string) => {
    const keys = [...segment.matchAll(PLACEHOLDER)].map((m) => m[1]!);
    const live = keys.length === 0 || keys.every((key) => effectParam(effect, key) > 0);
    return live ? segment : '';
  });

  return body
    .replace(PLACEHOLDER, (whole, key: string) => {
      const p = def.params.find((x) => x.key === key);
      return p ? paramExpr(effect, def, p) : whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** One effect as printed: what it costs, what it rolls, what it does. */
export function effectLine(effect: CardEffect): string {
  const def = EFFECTS[effect.type];
  if (!def) return `Unknown effect: ${effect.type}.`;

  const clauses: string[] = [];
  const cost = effectCost(effect);
  if (cost > 0) {
    clauses.push(effect.dice?.count === 'variable' ? `Spend ${cost}⚡ per 🎲.` : `Spend ${cost}⚡.`);
  }
  if (effect.dice) clauses.push(diceClause(effect.dice));

  const body = def.coded ? (effect.text ?? '').trim() : fillTemplate(def, effect);
  if (body) clauses.push(body);
  return clauses.join(' ');
}

/**
 * A cockpit's three intrinsic lines.
 *
 * It carries no effects — the weapon, the shield and the generator are what
 * *being* a cockpit means — so they're printed off its own numbers instead.
 */
function cockpitLines(card: PartCard): PrintedLine[] {
  const lines: PrintedLine[] = [];
  const power = card.power ?? 0;
  const gen = card.genPerDown ?? 0;
  if (power > 0) {
    lines.push({ timing: 'active', text: `Deal ${power}⚔️ to an enemy ship. No ⚡ — the down is the cost.` });
  }
  if (gen > 0) {
    lines.push({ timing: 'active', text: `Put ${gen}⚡ back into this cockpit’s shield.` });
  }
  if ((card.energyCapacity ?? 0) > 0) {
    lines.push({ timing: 'passive', text: 'Absorbs incoming ⚔️ while charged — the ship’s last line.' });
  }
  return lines;
}

/**
 * Everything a card prints, in order, each tagged with when it happens.
 *
 * Derived from the effect list every time, so the face of a card and its
 * behaviour cannot disagree: retune a number and the text retunes with it.
 */
export function printedLines(card: Card): PrintedLine[] {
  const lines: PrintedLine[] =
    card.kind === 'part' && card.role === 'COCKPIT' ? cockpitLines(card) : [];
  for (const effect of effectsOf(card)) {
    const text = effectLine(effect);
    // Nothing on an event card is fitted to a ship: the whole card resolves
    // the moment it's drawn, a `reminder` on it included.
    if (text) lines.push({ timing: card.kind === 'event' ? 'event' : timingOf(effect), text });
  }
  return lines;
}

/** The printed rules as one string, for tooltips, search and the log. */
export const printedText = (card: Card): string =>
  printedLines(card)
    .map((line) => line.text)
    .join(' ');

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

  for (const effect of effects) {
    const def = EFFECTS[effect.type];
    if (!def) {
      out.push(`unknown effect “${effect.type}”`);
      continue;
    }
    if (def.coded && !(effect.text ?? '').trim()) {
      out.push(`${def.label.toLowerCase()} with no printed text — the card says nothing`);
    }
    if (def.timing !== 'active' && (effect.cost ?? 0) > 0) {
      out.push(`${def.label} charges ⚡ but is never activated`);
    }
    const gated = effect.dice?.hitUnder !== undefined || effect.dice?.hitOver !== undefined;
    if (effectParam(effect, 'loseOnMiss') > 0 && !gated) {
      out.push('loses ⚡ on a miss but rolls nothing that can miss');
    }
  }

  const actives = effects.filter((e) => timingOf(e) === 'active');
  const attack = effects.find((e) => isDamageEffect(e.type));

  if (card.kind === 'part') {
    const pool = card.energyCapacity ?? 0;
    const cost = cardCost(card);
    if (actives.length > 0 && cost > pool && !card.freeReroute) {
      out.push(`costs ${cost}⚡ out of a ${pool}⚡ pool — can never fire on its own charge`);
    }
    if (card.role === 'COCKPIT') {
      if (!card.slots) out.push('cockpit with no slots');
      if (!card.energyCapacity) out.push('cockpit with no shield pool — one hit wrecks it');
    } else if (effects.length === 0) {
      out.push('no effects — inert');
    }
    if (hasEffect(card, 'absorb') && pool <= 0) out.push('absorbs ⚔️ but holds no ⚡');
  }

  if (attack && effectParam(attack, 'power') <= 0 && !attack.dice) {
    out.push('attack deals 0⚔️');
  }
  if (card.kind === 'event' && effects.length === 0) out.push('event resolves to nothing');

  return out;
}

// ------------------------------------------------------------ new cards

/** A blank card of the given kind, ready to be filled in by the editor. */
export function blankCard(kind: CardKind, id: CardId, name = 'New Card'): Card {
  const base = { id, name, rarity: 1 as const, amount: 1, effects: [] };
  if (kind === 'item') return { ...base, kind: 'item', role: 'OTH' };
  if (kind === 'event') return { ...base, kind: 'event', subtype: 'Empty Space · Player Event' };
  return { ...base, kind: 'part', role: 'OTH', energyCapacity: 2 };
}

// ------------------------------------------------------------- migration

/**
 * Bring a card saved under the old shape forward.
 *
 * Cards edited in the browser are persisted, so a designer's playtest overlay
 * outlives the schema. A card-level `energyCost`/`dice` becomes a modifier on
 * the first active effect — which is what they always were in practice — the
 * old `partType: 'cockpit'` becomes the COCKPIT role, and hand-written rules
 * text survives on whichever coded effect used to carry it. Anything else
 * printed by hand is dropped: text is derived now.
 */
export function migrateCard(raw: Card): Card {
  const legacy = raw as Card & {
    energyCost?: number | null;
    dice?: DiceSpec;
    text?: string;
    status?: string;
    partType?: string;
    consumable?: boolean;
  };
  if (
    legacy.energyCost === undefined &&
    legacy.dice === undefined &&
    legacy.text === undefined &&
    legacy.status === undefined &&
    legacy.partType === undefined &&
    legacy.consumable === undefined
  ) {
    return raw;
  }

  const { energyCost, dice, text, status, partType, consumable, ...rest } = legacy;
  const card = (
    partType === 'cockpit' ? { ...rest, role: 'COCKPIT' } : rest
  ) as Card;
  const effects = effectsOf(card).map((e) => ({ ...e }));

  const first = effects.findIndex((e) => isActiveEffect(e.type));
  if (first >= 0) {
    if (typeof energyCost === 'number' && effects[first]!.cost === undefined) {
      effects[first]!.cost = energyCost;
    }
    if (dice && effects[first]!.dice === undefined) effects[first]!.dice = dice;
  }

  const printed = [text, status].filter((s): s is string => !!s && s.trim().length > 0).join(' ');
  for (const effect of effects) {
    if (EFFECTS[effect.type]?.coded && !effect.text && printed) effect.text = printed;
  }

  return { ...card, effects };
}
