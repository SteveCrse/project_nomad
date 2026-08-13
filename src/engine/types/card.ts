import type { CardId } from './ids';

/** The three decks called out in the rules: Parts, Items, Events. */
export type CardKind = 'part' | 'item' | 'event';

/**
 * Module role. Codes match the test tool's ROLE map so card data and UI
 * colour keys stay in sync.
 *   GEN generator · WPN weapon · SHD shield · RDS redistributor · OTH other
 */
export type ModuleRole = 'GEN' | 'WPN' | 'SHD' | 'RDS' | 'OTH';

/**
 * Optional build specialization from the rules ("tank/DPS/luck"). Distinct
 * from role: role is what the module does, specialization is what it pushes
 * the ship toward.
 */
export type Specialization = 'tank' | 'dps' | 'luck' | 'support';

/** 1 common → 5 legendary. Gated in play by config.maxRarityNow. */
export type Rarity = 1 | 2 | 3 | 4 | 5;

/** Dice a module's action may call for. */
export type DieKind = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

export interface DiceSpec {
  /** How many dice, or 'variable' when the player chooses (e.g. spend X⚡ → X🎲). */
  count: number | 'variable';
  die: DieKind;
  /** Rolls at or below this count as hits (Laser Array: "for every 1 you roll"). */
  hitUnder?: number;
  /** Rolls at or above this count as hits. */
  hitOver?: number;
  /** Damage (or energy) per hit. With no hit rule the dice are summed instead. */
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
 * `reminder` (passive): the tool still spends the down and the energy, and the
 * table adjudicates the payload. Better a knowingly-manual card than a
 * silently-wrong one.
 */
export type EffectType =
  // ---- active: spend a down (and the card's ⚡ cost) to fire ----
  | 'damage'
  | 'damage-all'
  | 'damage-module'
  | 'gain-energy'
  | 'restore-shield'
  | 'negate-next-attack'
  | 'retaliate'
  | 'manual'
  // ---- passive: always on while the module is fitted ----
  | 'absorb'
  | 'generate'
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
 * One effect on a card, with its numbers.
 *
 * Params are the ⚡/⚔️/🎲 values a card prints: tuning a card means changing
 * a number here, never writing a new effect. Keys the card omits fall back to
 * the registry's default, so an effect is always resolvable.
 */
export interface CardEffect {
  type: EffectType;
  params?: Record<string, number>;
}

interface CardBase {
  id: CardId;
  name: string;
  kind: CardKind;
  rarity: Rarity;
  /** Copies of this card in the deck. */
  amount: number;
  /**
   * Rules text as printed on the card.
   *
   * `{placeholders}` are filled from the card's own numbers by
   * `renderText` — `{cost}`, `{power}`, an effect's `{amount}` — so retuning a
   * card's ⚡ or ⚔️ reprints its text instead of silently contradicting it.
   */
  text: string;
  /** Italic, non-mechanical line. */
  flavor?: string;
  /** Persistent condition printed under the effect (e.g. "Infested: ..."). */
  status?: string;
  /** Filename in Project N.O.M.A.D._pngs/fronts, or any image URL. */
  art?: string;
  /**
   * What the card does, assembled from the effect vocabulary. The engine's
   * flat fields below are *derived* from this by `compileCard` — this list is
   * what a card is authored and edited as.
   */
  effects?: CardEffect[];
}

/** Parts deck: becomes ship components, and generates enemy ships. */
export interface PartCard extends CardBase {
  kind: 'part';
  /** Cockpits anchor a ship and are the enemy-spawn delimiter. */
  partType: 'cockpit' | 'active-module' | 'passive-module';
  role: ModuleRole;
  specialization?: Specialization;
  /**
   * Size of this module's own energy pool. null when it holds no energy.
   *
   * On a **cockpit** this is the ship's basic shield: the ⚡ it can hold, the
   * last charge standing between an attack and a wreck.
   */
  energyCapacity: number | null;
  /** Dice this module's action calls for, if any. */
  dice?: DiceSpec;
  /** Cockpits only: module slot count this cockpit grants. */
  slots?: number;
  /**
   * Damage this module deals per activation, before dice/config modifiers.
   *
   * On a **cockpit** this is the basic attack — one down, no ⚡ cost. Every
   * ship can always shoot, however badly.
   */
  power?: number;
  /**
   * Cockpits only: ⚡ the basic generator puts into the cockpit's own shield
   * pool for one down. Distinct from `generates`, which is passive upkeep on a
   * module; running the cockpit generator costs the down that could have been
   * the cockpit's attack.
   */
  genPerDown?: number;
  /** Cards that raise the scrap deck cap declare it here. */
  scrapCapBonus?: number;
  /**
   * Fires at most once per fresh set of downs. The default is unlimited: a
   * module can be activated as often as its pool can pay for, one down each,
   * so a card only carries this when its own text says otherwise.
   */
  oncePerSet?: boolean;

  /**
   * Energy drawn from this module's own pool per activation. With variable
   * dice this is the cost *per die* ("spend X⚡ to cast X🎲").
   */
  energyCost?: number;

  // ---- derived from `effects` by `compileCard`; don't author by hand ----
  // The engine reads these directly, so they stay flat and cheap. Editing a
  // card's effect list rewrites them, which is what makes a retuned number
  // show up in play.
  /** Passive: energy added to this module's pool at the start of its turn. */
  generates?: number;
  /** Passive: flat cut off each incoming attack, draining 1⚡ per use. */
  damageReduction?: number;
  /** Passive: energy this module bleeds from the whole ship each turn (Infested). */
  drainPerTurn?: number;
  /** Passive SHD with a pool soaks damage before the cockpit. */
  absorbs?: boolean;
  /** Passive: energy may be rerouted without spending a down (RDS chains). */
  freeReroute?: boolean;
  /** Attacks that hit a single enemy module rather than its shields. */
  targetsModule?: boolean;
}

/** Items deck: loot drawn from Loot steps. */
export interface ItemCard extends CardBase {
  kind: 'item';
  role: ModuleRole;
  /** Energy spent to use the item. */
  energyCost: number | null;
  dice?: DiceSpec;
  /** Single-use items leave play after resolving. */
  consumable: boolean;
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
  /** Events that alter the board place a marker on the current node. */
  placesMarker?: boolean;
  /** Loot cards handed out when the event resolves. */
  grantsLoot?: number;
  /** ⚔ dealt to every ship at the node, resolved through shields as usual. */
  damage?: number;
  /** The event spawns a fight instead of resolving on the spot. */
  spawnsCombat?: boolean;
}

export type Card = PartCard | ItemCard | EventCard;

export const isPart = (c: Card): c is PartCard => c.kind === 'part';
export const isItem = (c: Card): c is ItemCard => c.kind === 'item';
export const isEvent = (c: Card): c is EventCard => c.kind === 'event';
export const isCockpit = (c: Card): c is PartCard => isPart(c) && c.partType === 'cockpit';
