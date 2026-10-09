import type { Card, PartCard } from '@engine/types';
import type { PrintedTiming } from '@engine';
import { attackOf, expectedDamage, outputOf, powerCostOf } from '@engine';
import { ROLE_LABEL, rarityName } from '@/lib/palette';

/**
 * What every part of a card means — in general, and on the card in front of
 * you.
 *
 * The gallery is where a card is read for the first time, so nothing on it
 * should have to be looked up: hovering any element says both what that
 * element *is* ("the band across the top is the tier") and what it says
 * *here*. Every hint is built from card data, so a retuned card explains
 * itself with its new numbers.
 */
export interface CardHint {
  /** What the element is, as a short label. */
  title: string;
  /** The general rule, then this card's case. */
  body: string;
}

const KIND_WORD: Record<Card['kind'], string> = {
  part: 'card from the Parts deck',
  item: 'single-use card from the Items deck',
  event: 'card from the Events deck',
  action: 'card in every enemy action deck',
};

const TIMING_RULE: Record<PrintedTiming, string> = {
  active: 'An ACT line costs a down to fire.',
  passive: 'A PAS line is on the whole time the module is online — it costs nothing and can’t be fired.',
  event: 'An EVT line resolves the moment the card is drawn on a step; the card is then done.',
  layout: 'A LAY line is a placement limit: where this module may sit on the grid — in front of, behind or next to what.',
  enemy: 'What the enemy does when this card is face up on the down it’s playing.',
};

/** The rarity band across the top of the card. */
export function rarityHint(card: Card): CardHint {
  if (card.kind === 'action') {
    return {
      title: 'Enemy action',
      body: 'Every fight builds one deck per enemy down from these cards, top card face up — the table can always read the enemy’s next four moves.',
    };
  }
  const tier = card.rarity;
  const legendary = tier >= 5;
  return {
    title: 'Tier band',
    body:
      `The band is the card’s rarity, and its wording says what the card is. The parts deck starts with ` +
      `commons; each rarity checkpoint shuffles in a rarer stack. This one is ${rarityName(tier)} (tier ${tier} of 5)` +
      (legendary ? ' — the rarest there is, which is why the band catches the light like foil.' : '.'),
  };
}

/** The illustration strip. */
export const artHint = (card: Card): CardHint => ({
  title: 'Art',
  body: `Illustration only — nothing on it is a rule. It identifies ${card.name} across the table at a glance.`,
});

/** The card's name. */
export function nameHint(card: Card): CardHint {
  const role = card.kind === 'event' || card.kind === 'action' ? null : ROLE_LABEL[card.role];
  return {
    title: 'Name',
    body:
      `What the card is called — the id the log, the deck sheet and the ship line all refer to. ` +
      `${card.name} is a ${KIND_WORD[card.kind]}` +
      (role ? `, filed under ${role}.` : '.'),
  };
}

/** One printed rules line, with its timing chip. */
export function lineHint(_card: Card, line: { timing: PrintedTiming; text: string }): CardHint {
  const title = {
    active: 'Active line',
    passive: 'Passive line',
    event: 'Event line',
    layout: 'Placement limit',
    enemy: 'Enemy action',
  }[line.timing];
  return { title, body: `${TIMING_RULE[line.timing]} Here: ${line.text}` };
}

/** The italic line under the rules. */
export const flavorHint = (card: Card): CardHint => ({
  title: 'Flavour',
  body: `Fiction, not rules — it never changes how ${card.name} resolves.`,
});

/** The energy chits: max ⚡, which is hit chance and HP at once. */
export function energyHint(card: PartCard): CardHint {
  const max = card.energyCapacity ?? 0;
  const attack = attackOf(card);
  return {
    title: 'Max energy',
    body:
      `Energy is both hit chance and HP: an attack rolls a d6 and hits at or under the ⚡ on the module, ` +
      `and every hit taken knocks ⚡ off. At 0 it’s offline, and one more hit destroys it. ` +
      `${card.name} holds up to ${max}⚡` +
      (attack > 0
        ? ` — fully charged it hits ${Math.min(max, 6)} in 6, for ${expectedDamage(attack, max).toFixed(1)}⚔ expected per shot.`
        : '.'),
  };
}

/** The footer strip, which says something different on each deck. */
export function footerHint(card: Card): CardHint {
  if (card.kind === 'item') {
    return {
      title: 'Single use',
      body: 'Every item leaves play the moment it resolves. It has no ⚡ of its own, so its attacks land without a roll.',
    };
  }
  if (card.kind === 'event') {
    return {
      title: 'Event',
      body: 'An event has no lasting presence: it is drawn on a step, it resolves, and it goes to the discard.',
    };
  }
  if (card.kind === 'action') {
    return {
      title: 'One per down',
      body: 'Resolved on the enemy’s down when it’s face up. If the enemy can’t do it, it’s discarded and the next card turned.',
    };
  }
  return energyHint(card);
}

/** A part's combat numbers: attack, generate output. */
export function statsHint(card: PartCard): CardHint {
  const attack = attackOf(card);
  const output = outputOf(card);
  const bits: string[] = [];
  if (attack > 0) bits.push(`each hit takes ${attack}⚡ off whatever it lands on (never less than 1)`);
  if (output > 0) bits.push(`a generate action adds ${output}⚡ to this ${card.role === 'COCKPIT' ? 'cockpit' : 'module'}`);
  return {
    title: card.role === 'COCKPIT' ? 'Cockpit' : 'Combat numbers',
    body:
      (card.role === 'COCKPIT'
        ? 'The cockpit is the heart of the grid and is the ship — destroy it and the ship is gone. '
        : '') + (bits.length > 0 ? `Here: ${bits.join('; ')}.` : 'This module neither attacks nor generates.'),
  };
}

/** What limits ship size, printed on a cockpit. */
export const sizeHint = (card: PartCard): CardHint => ({
  title: 'Ship size',
  body:
    `The draft's rounds and energy tokens limit every ship. On top of that, under the slot limit this cockpit ` +
    `holds ${card.slots ?? 0} module(s); under an energy budget its modules’ upkeep may total ${card.powerRating ?? 0}.`,
});

/** A module's power cost. */
export const costHint = (card: PartCard): CardHint => ({
  title: 'Draft cost',
  body:
    `Energy tokens to draft it — tokens not spent are starting ⚡ — and its upkeep under an energy budget: 1–3, rarer being dearer. ` +
    `${card.name} costs ${powerCostOf(card)}` +
    (card.powerCost === undefined ? ', from its rarity.' : '.'),
});

/** The 1st-down icon. */
export const firstDownHint = (card: PartCard): CardHint => ({
  title: '1st-down icon',
  body:
    `Destroying a module with this icon earns a 1st down: a seat’s turn ends and goes to the next seat — the ` +
    `enemy doesn’t get a turn; the enemy goes back to Down 1. ${card.name} carries it.`,
});
