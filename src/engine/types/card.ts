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
 * What activating an active module does, in terms the engine can resolve.
 *
 * Deliberately small: anything outside this vocabulary is `manual`, which
 * still spends the down, the AP and the energy but leaves the payload to the
 * table. Better a knowingly-manual card than a silently-wrong one.
 */
export type ModuleEffect =
  /** Deal `power` (plus any dice) to the target. */
  | { kind: 'damage' }
  /** Add energy to this module's own pool; dice decide hit/miss when present. */
  | { kind: 'gain-energy'; amount: number; loseOnMiss?: number }
  /** The next attack against this ship deals nothing. */
  | { kind: 'negate-next-attack' }
  /** The next attacker takes `amount` back. */
  | { kind: 'retaliate'; amount: number }
  /** Resolve by hand at the table; the tool just tracks the cost. */
  | { kind: 'manual' };

interface CardBase {
  id: CardId;
  name: string;
  kind: CardKind;
  rarity: Rarity;
  /** Copies of this card in the deck. */
  amount: number;
  /** Rules text as printed on the card. */
  text: string;
  /** Italic, non-mechanical line. */
  flavor?: string;
  /** Persistent condition printed under the effect (e.g. "Infested: ..."). */
  status?: string;
  /** Filename in Project N.O.M.A.D._pngs/fronts, once art is mapped. */
  art?: string;
}

/** Parts deck: becomes ship components, and generates enemy ships. */
export interface PartCard extends CardBase {
  kind: 'part';
  /** Cockpits anchor a ship and are the enemy-spawn delimiter. */
  partType: 'cockpit' | 'active-module' | 'passive-module';
  role: ModuleRole;
  specialization?: Specialization;
  /** Action-point cost to activate. null for passives. */
  apCost: number | null;
  /** Size of this module's own energy pool. null when it holds no energy. */
  energyCapacity: number | null;
  /** Dice this module's action calls for, if any. */
  dice?: DiceSpec;
  /** Cockpits only: module slot count this cockpit grants. */
  slots?: number;
  /** Cockpits only: AP per turn this cockpit grants, when it deviates from config. */
  apPerTurn?: number;
  /** Damage this module deals per activation, before dice/config modifiers. */
  power?: number;
  /** Cards that raise the scrap deck cap declare it here. */
  scrapCapBonus?: number;
  /**
   * Fires at most once per fresh set of downs. The default is unlimited: a
   * module can be activated as often as its pool can pay for, one down each,
   * so a card only carries this when its own text says otherwise.
   */
  oncePerSet?: boolean;

  // ---- structured behaviour: what the engine actually resolves ----
  /**
   * Energy drawn from this module's own pool per activation. With variable
   * dice this is the cost *per die* ("spend X⚡ to cast X🎲").
   */
  energyCost?: number;
  /** Passive: energy added to this module's pool at the start of its turn. */
  generates?: number;
  /** Passive: flat cut off each incoming attack, draining 1⚡ per use. */
  damageReduction?: number;
  /** Passive: energy this module bleeds from the whole ship each turn (Infested). */
  drainPerTurn?: number;
  /** Passive SHD with a pool soaks damage before hull; set false to opt out. */
  absorbs?: boolean;
  /** Passive: energy may be rerouted without spending a down (RDS chains). */
  freeReroute?: boolean;
  /** What activating this module does. Defaults to damage when it has power. */
  effect?: ModuleEffect;
  /** Attacks that hit a single enemy module rather than the hull. */
  targetsModule?: boolean;
}

/** Items deck: loot drawn from Loot steps. */
export interface ItemCard extends CardBase {
  kind: 'item';
  role: ModuleRole;
  apCost: number | null;
  /** Energy spent to use the item. */
  energyCost: number | null;
  dice?: DiceSpec;
  /** Single-use items leave play after resolving. */
  consumable: boolean;
  /** Damage dealt when played, if any. */
  power?: number;
  /** What playing this card does; defaults to manual. */
  effect?: ModuleEffect;
}

/** Events deck: drawn on Event steps. */
export interface EventCard extends CardBase {
  kind: 'event';
  /** Free-text classification shown on the card, e.g. "Empty Space · Board Change". */
  subtype: string;
  /** Events that alter the board place a marker on the current node. */
  placesMarker?: boolean;
  /** Marker text dropped on the node when `placesMarker` is set. */
  marker?: string;
  /** Loot cards handed out when the event resolves. */
  grantsLoot?: number;
  /** Hull damage dealt to every player at the node. */
  hullDamage?: number;
  /** The event spawns a fight instead of resolving on the spot. */
  spawnsCombat?: boolean;
}

export type Card = PartCard | ItemCard | EventCard;

export const isPart = (c: Card): c is PartCard => c.kind === 'part';
export const isItem = (c: Card): c is ItemCard => c.kind === 'item';
export const isEvent = (c: Card): c is EventCard => c.kind === 'event';
export const isCockpit = (c: Card): c is PartCard => isPart(c) && c.partType === 'cockpit';
