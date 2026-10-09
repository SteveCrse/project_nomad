import type { CardId } from './ids';

/**
 * The decks called out in the rules: Parts (cockpits are their own deck but
 * share the part shape), Items, Events, and the enemy's action decks.
 */
export type CardKind = 'part' | 'item' | 'event' | 'action';

/**
 * What a part is for.
 *
 *   GEN generator · WPN weapon · SHD shield · RDS redistributor · OTH other
 *   COCKPIT — the back of every ship, and its own deck
 *
 * Role carries rules of its own now: a shield sits at the front and blocks
 * what's behind it, a generator is one of the two things that may produce ⚡,
 * and a cockpit is the ship. Everything else a card does is its effect list.
 */
export type ModuleRole = 'GEN' | 'WPN' | 'SHD' | 'RDS' | 'OTH' | 'COCKPIT';

/**
 * Optional build specialization from the rules ("tank, high DPS, luck").
 * Distinct from role: role is what the module does, specialization is what it
 * pushes the ship toward.
 */
export type Specialization = 'tank' | 'dps' | 'luck' | 'support';

/** 1 common → 5 legendary. Gated in play by the rarity checkpoints. */
export type Rarity = 1 | 2 | 3 | 4 | 5;

/**
 * When an effect happens.
 *   active  — a down fires it
 *   passive — always on while the module stands
 *   event   — resolves when the card is drawn on a step
 */
export type EffectTiming = 'active' | 'passive' | 'event';

/** Dice an effect's resolution may call for, on top of the attack roll. */
export type DieKind = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

export interface DiceSpec {
  count: number;
  die: DieKind;
  /** Rolls at or below this count as hits. */
  hitUnder?: number;
  /** Rolls at or above this count as hits. */
  hitOver?: number;
  /** Payload per hit. With no hit rule the dice are summed onto the payload. */
  perHit?: number;
}

/**
 * The vocabulary a card's behaviour is built from.
 *
 * Every entry has a definition in `engine/effects.ts` — label, tunable
 * parameters, printed-text fragment — and the active ones have a case in
 * combat's resolver. A card is a *list* of these, so new content is assembled
 * from parts that already work rather than written as a new special case.
 *
 * Deliberately small. Anything outside the vocabulary is `manual` (active) or
 * `reminder` (passive): the tool still spends the down, and the table
 * adjudicates the payload. Better a knowingly-manual card than a
 * silently-wrong one.
 */
export type EffectType =
  // ---- active: spend a down to fire ----
  | 'damage'
  | 'damage-module'
  | 'generate'
  | 'emp'
  | 'restore-shield'
  | 'negate-next-attack'
  | 'retaliate'
  | 'manual'
  // ---- passive: always on while the module stands ----
  | 'damage-reduction'
  | 'drain'
  | 'free-reroute'
  | 'scrap-cap'
  | 'reminder'
  // ---- events: resolved when the card is drawn on a step ----
  | 'event-damage'
  | 'grant-loot'
  | 'spawn-combat'
  | 'place-marker';

/**
 * One effect on a card, with everything that makes it *this* card's version.
 *
 * Params are the numbers a card prints: tuning a card means changing a number
 * here, never writing a new effect. Keys the card omits fall back to the
 * registry's default, so an effect is always resolvable.
 */
export interface CardEffect {
  type: EffectType;
  params?: Record<string, number>;
  /**
   * ⚡ this effect draws from the module's own pool when it fires. Active
   * abilities only: an attack never has one — the seat picks how much ⚡ a
   * shot spends, within the module's `minSpend`/`maxSpend`.
   */
  cost?: number;
  /** Dice this effect's resolution calls for, if any. */
  dice?: DiceSpec;
  /**
   * Printed wording for effects resolved at the table (`manual`, `reminder`).
   * The rest of the vocabulary prints from its registry template and its own
   * numbers, so its text can't drift.
   */
  text?: string;
}

/**
 * Where a module may sit, relative to the modules around it — the limits the
 * rules print on the card ("no shield in front of another shield").
 *
 * On the grid, *in front of* and *behind* mean the same column, further
 * forward or further back; *next to* means one of the four cells touching it.
 */
export type PlacementKind = 'not-in-front-of' | 'not-behind' | 'next-to' | 'not-next-to';

export interface PlacementRule {
  rule: PlacementKind;
  /** The role the rule is about. */
  role: ModuleRole;
}

interface CardBase {
  id: CardId;
  name: string;
  kind: CardKind;
  rarity: Rarity;
  /** Copies of this card in the deck. Deck data — never printed on the card. */
  amount: number;
  /** Italic, non-mechanical line. */
  flavor?: string;
  /** Filename in Project N.O.M.A.D._pngs/fronts, or any image URL. */
  art?: string;
  /**
   * What the card does, assembled from the effect vocabulary. The engine's
   * flat fields below are *derived* from this by `compileCard`, and so is the
   * card's printed rules text — this list is the whole authored card.
   */
  effects?: CardEffect[];
}

/** Parts and cockpits: the two decks ships are built from. */
export interface PartCard extends CardBase {
  kind: 'part';
  /** `COCKPIT` cards form the cockpit deck; every other role is a module. */
  role: ModuleRole;
  specialization?: Specialization;
  /**
   * Max ⚡ this module holds. Energy is both hit chance and HP, so this is the
   * ceiling on both: a common gun holds a lot, a rare one very little.
   */
  energyCapacity: number;
  /** Destroying this module earns the attacker a 1st down. */
  firstDown?: boolean;
  /** Placement limits printed on the card. */
  placement?: PlacementRule[];
  /** Cards that raise the scrap deck cap declare it here (derived). */
  scrapCapBonus?: number;

  // ---- cockpits: printed on the card, not effects ----
  /** Cockpits: max modules under the slot-limit rule. */
  slots?: number;
  /** Cockpits: power rating — draft tokens, or upkeep capacity under a budget. */
  powerRating?: number;
  /**
   * Attack strength. On a cockpit it's printed; on a module it's derived from
   * the card's damage effects.
   */
  power?: number;
  /** Cockpits: what one generate action adds to the cockpit. */
  genPerDown?: number;

  // ---- modules ----
  /**
   * Draft cost in energy tokens, and upkeep under an energy budget: 1–3,
   * rarer being dearer. Blank derives it from rarity.
   */
  powerCost?: number;
  /**
   * Attacks: the fewest and most ⚡ one shot may spend. The seat picks the
   * spend; the roll hits on a d6 at or under it. Blank: 1, and all it holds.
   */
  minSpend?: number;
  maxSpend?: number;

  // ---- derived from `effects` by `compileCard`; don't author by hand ----
  /** What one generate action adds to this module. */
  output?: number;
  /** Passive: flat cut off each hit taken, paid for with 1⚡ from this module. */
  damageReduction?: number;
  /** Passive: ⚡ this module bleeds from the whole ship each turn (Infested). */
  drainPerTurn?: number;
  /** Passive: rerouting costs no down. */
  freeReroute?: boolean;
  /** Attacks that may pick any module, shields or not. */
  targetsModule?: boolean;
}

/**
 * Items deck: loot drawn from Loot steps.
 *
 * Every item is single use — it leaves play the moment it resolves — so that
 * isn't a flag, it's what an item *is*, and the card face prints it.
 */
export interface ItemCard extends CardBase {
  kind: 'item';
  role: ModuleRole;
  /** Derived from a damage effect by `compileCard`. */
  power?: number;
}

/** Events deck: drawn on Event steps. */
export interface EventCard extends CardBase {
  kind: 'event';
  /** Free-text classification shown on the card, e.g. "Empty Space · Board Change". */
  subtype: string;
  /** Marker text dropped on the node when a `place-marker` effect resolves. */
  marker?: string;

  // ---- derived from `effects` by `compileCard`; don't author by hand ----
  placesMarker?: boolean;
  grantsLoot?: number;
  /** One hit of this strength on every ship at the node. */
  damage?: number;
  spawnsCombat?: boolean;
}

/**
 * What an enemy can do with a down. Charging a shield is a reroute into one;
 * the enemy doesn't fire module abilities for now.
 */
export type EnemyActionType = 'attack' | 'generate' | 'reroute';

export const ENEMY_ACTIONS_ALL: readonly EnemyActionType[] = ['attack', 'generate', 'reroute'];

/**
 * Enemy action decks: one per down, each holding every action. The card *is*
 * its action — which module fires, where the energy goes, is the engine's
 * call, made the same way every time (see `engine/ai`).
 */
export interface ActionCard extends CardBase {
  kind: 'action';
  action: EnemyActionType;
}

export type Card = PartCard | ItemCard | EventCard | ActionCard;

export const isPart = (c: Card): c is PartCard => c.kind === 'part';
export const isItem = (c: Card): c is ItemCard => c.kind === 'item';
export const isEvent = (c: Card): c is EventCard => c.kind === 'event';
export const isAction = (c: Card): c is ActionCard => c.kind === 'action';
export const isCockpit = (c: Card): c is PartCard => isPart(c) && c.role === 'COCKPIT';
/** A part that isn't a cockpit — what the parts deck holds. */
export const isModule = (c: Card): c is PartCard => isPart(c) && c.role !== 'COCKPIT';
