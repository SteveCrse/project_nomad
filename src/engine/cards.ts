import type {
  Card,
  CardEffect,
  CardKind,
  DiceSpec,
  EffectTiming,
  EffectType,
  EnemyActionType,
  EventCard,
  ItemCard,
  ModuleRole,
  PartCard,
  PlacementRule,
} from './types/card';
import { ENEMY_ACTIONS_ALL } from './types/card';
import { EFFECTS, defaultParams, isActiveEffect, isDamageEffect } from './effects';
import type { EffectDef, EffectParamDef } from './effects';
import type { CardId } from './types/ids';

/**
 * Turning an authored card into a card the engine can resolve — and into the
 * text printed on its face.
 *
 * A card is authored as a list of `effects`, each carrying its own numbers.
 * `compileCard` folds that list down into the flat fields combat reads
 * (`power`, `output`, an event's `damage`…), which is the whole trick behind
 * editing content at runtime: retune a number in the deck editor, recompile,
 * and the next activation resolves the new value. Nothing in the engine looks
 * at a card id.
 *
 * `printedLines` closes the loop on the printed side. There is no authored
 * rules text to drift out of date: what a card says is *derived* from what it
 * does, every time it is drawn.
 */

/** Sides on the attack die. The balancing maths in the rules is built on a d6. */
export const HIT_DIE = 6;

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

/** The effects a down can fire, in printed order. */
export const activeEffects = (card: Card): CardEffect[] =>
  effectsOf(card).filter((e) => timingOf(e) === 'active');

/** Can a down be spent on this card at all? */
export const isActivatable = (card: Card): boolean => activeEffects(card).length > 0;

export const passiveEffects = (card: Card): CardEffect[] =>
  effectsOf(card).filter((e) => timingOf(e) === 'passive');

export const hasEffect = (card: Card, type: EffectType): boolean =>
  effectsOf(card).some((e) => e.type === type);

/**
 * Abilities the *use another module* action resolves: everything active that
 * isn't the attack or the generate action, which have downs of their own.
 */
export const abilityEffects = (card: Card): CardEffect[] =>
  activeEffects(card).filter((e) => !isDamageEffect(e.type) && e.type !== 'generate');

/**
 * Attack strength. A cockpit prints it; a module's is the sum of its damage
 * effects, so one roll decides one hit however the card is assembled.
 */
export function attackOf(card: Card): number {
  // A cockpit can always fire, whatever its card prints.
  if (card.kind === 'part' && card.role === 'COCKPIT') return Math.max(1, card.power ?? 0);
  if (card.kind === 'event' || card.kind === 'action') return 0;
  return effectsOf(card)
    .filter((e) => isDamageEffect(e.type))
    .reduce((sum, e) => sum + effectParam(e, 'power'), 0);
}

/** What one generate action adds: a cockpit prints it, a generator's effect carries it. */
export function outputOf(card: Card): number {
  if (card.kind !== 'part') return 0;
  // A cockpit can always generate, whatever its card prints.
  if (card.role === 'COCKPIT') return Math.max(1, card.genPerDown ?? 0);
  const generate = effectsOf(card).find((e) => e.type === 'generate');
  return generate ? effectParam(generate, 'amount') : 0;
}

/** Rarity → power cost, for cards that don't print one: 1–3, rarer being dearer. */
const RARITY_COST = [1, 2, 2, 3, 3] as const;

/** A module's draft cost in energy tokens — and its upkeep under a budget. */
export function powerCostOf(card: Card): number {
  if (card.kind !== 'part' || card.role === 'COCKPIT') return 0;
  return card.powerCost ?? RARITY_COST[card.rarity - 1] ?? 1;
}

/** The rules' balancing line: expected damage = attack × energy ÷ 6. */
export const expectedDamage = (attack: number, energy: number): number =>
  (attack * Math.max(0, Math.min(energy, HIT_DIE))) / HIT_DIE;

/** Chance an attack with this much ⚡ behind it lands. */
export const hitChance = (energy: number): number =>
  Math.max(0, Math.min(energy, HIT_DIE)) / HIT_DIE;

/** A fresh effect with every param at its default. */
export const makeEffect = (type: EffectType): CardEffect => ({
  type,
  params: defaultParams(type),
});

// --------------------------------------------------------------------- cost

/**
 * ⚡ one firing of a single effect draws from the module's own pool. Attacks
 * never charge one: the seat picks a shot's spend (see `spendRange`).
 */
export function effectCost(effect: CardEffect): number {
  if (!isActiveEffect(effect.type) || isDamageEffect(effect.type)) return 0;
  return Math.max(0, effect.cost ?? 0);
}

/** ⚡ a set of effects draws, fired together off one down. */
export const costOf = (effects: CardEffect[]): number =>
  effects.reduce((sum, e) => sum + effectCost(e), 0);

/**
 * What one shot may spend off a module holding `energy`: at least its
 * `minSpend` (1), at most its `maxSpend` and what it holds. `max < min` means
 * it can't fire.
 */
export function spendRange(part: PartCard, energy: number): { min: number; max: number } {
  const min = Math.max(1, part.minSpend ?? 1);
  const max = Math.min(Math.max(0, energy), part.maxSpend ?? Infinity);
  return { min, max };
}

/** The printed spend limits, or '' when the module has none. */
export function spendLine(part: PartCard): string {
  const min = part.minSpend && part.minSpend > 1 ? part.minSpend : null;
  const max = part.maxSpend ?? null;
  if (min && max) return min === max ? `Spend exactly ${min}⚡ per shot.` : `Spend ${min}–${max}⚡ per shot.`;
  if (min) return `Spend at least ${min}⚡ per shot.`;
  if (max) return `Spend at most ${max}⚡ per shot.`;
  return '';
}

/** The dice one effect rolls on top of the attack roll. */
export const diceOf = (card: Card): DiceSpec[] =>
  activeEffects(card)
    .map((e) => e.dice)
    .filter((d): d is DiceSpec => !!d);

// ---------------------------------------------------------------- compiling

/** Fold the effect list into the flat fields the engine resolves. */
export function compileCard(card: Card): Card {
  if (card.kind === 'part') return compilePart(card);
  if (card.kind === 'event') return compileEvent(card);
  if (card.kind === 'item') return compileItem(card);
  return card;
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
  const cockpit = card.role === 'COCKPIT';
  return {
    ...card,
    // A cockpit's attack and output are printed on it rather than fitted to
    // it, so they survive untouched; a module's come off its effects.
    ...(cockpit ? {} : { power: attackOf(card), output: value('generate') }),
    targetsModule: has('damage-module'),
    freeReroute: has('free-reroute'),
    damageReduction: value('damage-reduction'),
    drainPerTurn: value('drain'),
    scrapCapBonus: value('scrap-cap'),
  };
}

function compileItem(card: ItemCard): ItemCard {
  const attack = attackOf(card);
  return { ...card, ...(attack > 0 ? { power: attack } : {}) };
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

/**
 * When a printed line happens: the three effect timings, plus the two kinds of
 * line that aren't effects — where the module may sit, and what an enemy
 * action card makes the enemy do.
 */
export type PrintedTiming = EffectTiming | 'layout' | 'enemy';

/** One printed rule, and the chip that says when it happens. */
export interface PrintedLine {
  timing: PrintedTiming;
  text: string;
}

const OPTIONAL = /\[([^\]]*)\]/g;
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * A parameter as printed: its number, its symbol, and whatever the effect's
 * dice add to it. Only the effect's *first* parameter is the payload — the
 * rest (`loseOnMiss`) are flat numbers the roll never scales.
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
  const roll = `Roll ${dice.count}${dice.die}`;
  const hits: string[] = [];
  if (dice.hitUnder !== undefined) hits.push(`${dice.hitUnder} or less`);
  if (dice.hitOver !== undefined) hits.push(`${dice.hitOver} or more`);
  return hits.length === 0 ? `${roll} and add the total.` : `${roll} — a roll of ${hits.join(' or ')} hits.`;
}

function fillTemplate(def: EffectDef, effect: CardEffect): string {
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
  if (cost > 0) clauses.push(`Spend ${cost}⚡.`);
  if (effect.dice) clauses.push(diceClause(effect.dice));

  const body = def.coded ? (effect.text ?? '').trim() : fillTemplate(def, effect);
  if (body) clauses.push(body);
  return clauses.join(' ');
}

const ROLE_NOUN: Record<ModuleRole, string> = {
  GEN: 'generator',
  WPN: 'weapon',
  SHD: 'shield',
  RDS: 'redistributor',
  OTH: 'utility module',
  COCKPIT: 'cockpit',
};

/** A placement limit as the card prints it. */
export function placementLine(rule: PlacementRule, ownRole?: ModuleRole): string {
  const noun = ROLE_NOUN[rule.role];
  const one = rule.role === ownRole ? `another ${noun}` : `a ${noun}`;
  switch (rule.rule) {
    case 'not-in-front-of':
      return `Can’t sit in front of ${one}.`;
    case 'not-behind':
      return `Can’t sit behind ${one}.`;
    case 'next-to':
      return `Must sit next to ${one}.`;
    case 'not-next-to':
      return `Can’t sit next to ${one}.`;
  }
}

export const ACTION_LABEL: Record<EnemyActionType, string> = {
  attack: 'Attack',
  generate: 'Generate',
  reroute: 'Reroute',
};

/**
 * What each enemy action card makes the enemy do. The card names the action;
 * these are the choices the engine makes on its behalf, the same every time,
 * so a playtester can predict the enemy from the face-up card.
 */
export const ACTION_TEXT: Record<EnemyActionType, string> = {
  attack:
    'Attack the aggressor with the module most likely to hurt (⚔️ × ⚡ ÷ 6), spending all the ⚡ it may. It hits the shield in front of the cockpit, else the cockpit.',
  generate: 'Generate on the producer that gains the most ⚡.',
  reroute:
    'Move ⚡ out of generators — else the cockpit — into the weapons they touch, hardest-hitting first, then into the shields they touch, leaving 1⚡ behind when it can.',
};

/**
 * A cockpit's two intrinsic lines.
 *
 * It carries no effects — attacking and generating are what *being* a cockpit
 * means — so they're printed off its own numbers instead.
 */
function cockpitLines(card: PartCard): PrintedLine[] {
  const lines: PrintedLine[] = [];
  const power = attackOf(card);
  const gen = outputOf(card);
  if (power > 0) lines.push({ timing: 'active', text: `Attack for ${power}⚔️.` });
  if (gen > 0) lines.push({ timing: 'active', text: `Generate ${gen}⚡ on this cockpit.` });
  return lines;
}

/**
 * Everything a card prints, in order, each tagged with when it happens.
 *
 * Derived from the effect list every time, so the face of a card and its
 * behaviour cannot disagree: retune a number and the text retunes with it.
 */
export function printedLines(card: Card): PrintedLine[] {
  if (card.kind === 'action') return [{ timing: 'enemy', text: ACTION_TEXT[card.action] }];

  const lines: PrintedLine[] =
    card.kind === 'part' && card.role === 'COCKPIT' ? cockpitLines(card) : [];
  for (const effect of effectsOf(card)) {
    const text = effectLine(effect);
    // Nothing on an event card is fitted to a ship: the whole card resolves
    // the moment it's drawn, a `reminder` on it included.
    if (text) lines.push({ timing: card.kind === 'event' ? 'event' : timingOf(effect), text });
  }
  if (card.kind === 'part') {
    const spend = attackOf(card) > 0 ? spendLine(card) : '';
    if (spend) lines.push({ timing: 'active', text: spend });
    for (const rule of card.placement ?? []) {
      lines.push({ timing: 'layout', text: placementLine(rule, card.role) });
    }
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
 * Everything about a card that would waste a playtest — said in the table
 * rather than discovered mid-fight.
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

  if (card.kind === 'part') {
    const max = card.energyCapacity ?? 0;
    if (max < 1) out.push('holds no ⚡ — every module starts with 1, and it can never spend any');
    const cost = costOf(activeEffects(card));
    if (cost > max) out.push(`an ability costs ${cost}⚡ out of a ${max}⚡ max — it can never fire`);
    if ((card.minSpend ?? 1) > (card.maxSpend ?? max)) {
      out.push(`a shot must spend ${card.minSpend}⚡ but may spend only ${Math.min(card.maxSpend ?? max, max)}⚡ — it can never fire`);
    }
    if (card.role === 'COCKPIT') {
      if (!card.slots) out.push('cockpit with no slots — nothing fits under the slot rule');
      if (!card.powerRating) out.push('cockpit with no power rating — nothing fits under a budget');
      if (!card.power) out.push('cockpit with no attack — it fires for 1⚔️');
    } else {
      if (hasEffect(card, 'generate') && card.role !== 'GEN') {
        out.push('generates ⚡ but isn’t a generator — the rules only let cockpits and generators produce');
      }
      if (attackOf(card) > 0 && card.role !== 'WPN') {
        out.push('attacks but isn’t filed as a weapon');
      }
      // A shield's job is its role — it blocks — so an empty list is fine there.
      if (effects.length === 0 && card.role !== 'SHD') out.push('no effects — inert');
    }
  }

  if (card.kind !== 'event' && card.kind !== 'action') {
    const attack = effects.find((e) => isDamageEffect(e.type));
    if (attack && effectParam(attack, 'power') <= 0 && !attack.dice) out.push('attack deals 0⚔️');
  }
  if (card.kind === 'item' && costOf(activeEffects(card)) > 0) {
    out.push('items have no ⚡ of their own to pay a cost with');
  }
  if (card.kind === 'event' && effects.length === 0) out.push('event resolves to nothing');

  return out;
}

// ------------------------------------------------------------ new cards

/** A blank card of the given kind, ready to be filled in by the editor. */
export function blankCard(kind: CardKind | 'cockpit', id: CardId, name = 'New Card'): Card {
  const base = { id, name, rarity: 1 as const, amount: 1, effects: [] };
  if (kind === 'item') return { ...base, kind: 'item', role: 'OTH' };
  if (kind === 'event') return { ...base, kind: 'event', subtype: 'Empty Space · Player Event' };
  if (kind === 'action') return { ...base, kind: 'action', action: 'attack' };
  if (kind === 'cockpit') {
    return {
      ...base,
      kind: 'part',
      role: 'COCKPIT',
      energyCapacity: 6,
      power: 2,
      genPerDown: 2,
      slots: 3,
      powerRating: 4,
    };
  }
  return { ...base, kind: 'part', role: 'OTH', energyCapacity: 3 };
}

// ------------------------------------------------------------- migration

/** Effects that changed shape in the v3 rules, brought forward. */
function migrateEffects(effects: CardEffect[]): CardEffect[] {
  const out: CardEffect[] = [];
  for (const raw of effects) {
    const type = raw.type as string;
    // The old shield effect: blocking is the SHD role's job now.
    if (type === 'absorb') continue;
    let effect = raw;
    // Generation is an action now, and the gamble is just its dice.
    if (type === 'gain-energy') effect = { ...effect, type: 'generate' };
    // There's only ever one enemy ship in a fight.
    if (type === 'damage-all') effect = { ...effect, type: 'damage' };
    // Bought dice went with per-die costs: the attack roll reads energy now.
    const dice = effect.dice as (Omit<DiceSpec, 'count'> & { count: number | string }) | undefined;
    if (dice && typeof dice.count !== 'number') effect = { ...effect, dice: { ...dice, count: 1 } };
    // An attack costs no fixed ⚡ any more: the seat picks the spend.
    if (isDamageEffect(effect.type) && effect.cost !== undefined) {
      const { cost: _cost, ...rest } = effect;
      effect = rest;
    }
    out.push(effect);
  }
  return out;
}

const sameEffects = (a: CardEffect[], b: CardEffect[]): boolean =>
  a.length === b.length && a.every((e, i) => e === b[i]);

/**
 * Bring a card saved under an old shape forward.
 *
 * Cards edited in the browser are persisted, so a designer's playtest overlay
 * outlives the schema. Card-level costs and dice become modifiers on the
 * first active effect, the old cockpit `partType` becomes the COCKPIT role,
 * hand-written text survives on a coded effect, and the v3 changes are applied
 * on top: generation is an action, blocking is the shield role, and every
 * module holds at least 1⚡.
 */
export function migrateCard(raw: Card): Card {
  const legacy = raw as Card & {
    energyCost?: number | null;
    dice?: DiceSpec;
    text?: string;
    status?: string;
    partType?: string;
    consumable?: boolean;
    oncePerSet?: boolean;
    absorbs?: boolean;
    generates?: number;
  };

  let card: Card = raw;
  if (
    legacy.energyCost !== undefined ||
    legacy.dice !== undefined ||
    legacy.text !== undefined ||
    legacy.status !== undefined ||
    legacy.partType !== undefined ||
    legacy.consumable !== undefined ||
    legacy.oncePerSet !== undefined ||
    legacy.absorbs !== undefined ||
    legacy.generates !== undefined
  ) {
    const {
      energyCost,
      dice,
      text,
      status,
      partType,
      consumable: _consumable,
      oncePerSet: _oncePerSet,
      absorbs: _absorbs,
      generates: _generates,
      ...rest
    } = legacy;
    card = (partType === 'cockpit' ? { ...rest, role: 'COCKPIT' } : rest) as Card;
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
    card = { ...card, effects };
  }

  const before = effectsOf(card);
  const effects = migrateEffects(before);
  if (!sameEffects(before, effects)) card = { ...card, effects };

  if (card.kind === 'part' && !((card.energyCapacity ?? 0) >= 1)) {
    card = { ...card, energyCapacity: 1 };
  }
  // Charging a shield is a reroute into one now.
  if (card.kind === 'action' && (card.action as string) === 'shield') card = { ...card, action: 'reroute' };
  return card;
}

/**
 * Is this a card the current rules can play? The enemy no longer fires
 * special abilities, so a saved action card for one has nothing to do.
 */
export const isPlayable = (card: Card): boolean =>
  card.kind !== 'action' || ENEMY_ACTIONS_ALL.includes(card.action);
