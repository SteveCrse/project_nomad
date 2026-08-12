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
}

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
  /** Damage this module deals per activation, before dice/config modifiers. */
  power?: number;
  /** Cards that raise the scrap deck cap declare it here. */
  scrapCapBonus?: number;
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
}

/** Events deck: drawn on Event steps. */
export interface EventCard extends CardBase {
  kind: 'event';
  /** Free-text classification shown on the card, e.g. "Empty Space · Board Change". */
  subtype: string;
  /** Events that alter the board place a marker on the current node. */
  placesMarker?: boolean;
}

export type Card = PartCard | ItemCard | EventCard;

export const isPart = (c: Card): c is PartCard => c.kind === 'part';
export const isItem = (c: Card): c is ItemCard => c.kind === 'item';
export const isEvent = (c: Card): c is EventCard => c.kind === 'event';
export const isCockpit = (c: Card): c is PartCard => isPart(c) && c.partType === 'cockpit';
