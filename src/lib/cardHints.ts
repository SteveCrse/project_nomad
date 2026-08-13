import type { Card, EffectTiming } from '@engine/types';
import { cardCost, isActivatable } from '@engine';
import { ROLE_LABEL, rarityName } from '@/lib/palette';

/**
 * What every part of a card means — in general, and on the card in front of
 * you.
 *
 * The gallery is where a card is read for the first time, so nothing on it
 * should have to be looked up: hovering any element says both what that
 * element *is* ("the band across the top is the tier") and what it says
 * *here* ("Legendary — the rarest, and out of the bag until the party is deep
 * enough"). Every hint is built from card data, so a retuned card explains
 * itself with its new numbers.
 */
export interface CardHint {
  /** What the element is, as a short label. */
  title: string;
  /** The general rule, then this card's case. */
  body: string;
}

const KIND_WORD: Record<Card['kind'], string> = {
  part: 'module card from the Parts deck',
  item: 'single-use card from the Items deck',
  event: 'card from the Events deck',
};

const TIMING_RULE: Record<EffectTiming, string> = {
  active: 'An ACT line costs a down to fire, plus whatever ⚡ it draws from the card’s own pool.',
  passive: 'A PAS line is on the whole time the card is fitted — it costs nothing and can’t be fired.',
  event: 'An EVT line resolves the moment the card is drawn on a step; the card is then done.',
};

/** The rarity band across the top of the card. */
export function rarityHint(card: Card): CardHint {
  const tier = card.rarity;
  const legendary = tier >= 5;
  return {
    title: 'Tier band',
    body:
      `The band is the card’s rarity, and its wording says what the card is. Rarity gates the ` +
      `deck: tiers above the party’s current ceiling are out of the bag until a checkpoint raises it. ` +
      `This one is ${rarityName(tier)} (tier ${tier} of 5)` +
      (legendary
        ? ' — the rarest there is, which is why the band catches the light like foil.'
        : '.'),
  };
}

/** The illustration strip. */
export const artHint = (card: Card): CardHint => ({
  title: 'Art',
  body: `Illustration only — nothing on it is a rule. It identifies ${card.name} across the table at a glance.`,
});

/** The card's name. */
export function nameHint(card: Card): CardHint {
  const role = card.kind === 'event' ? null : ROLE_LABEL[card.role];
  return {
    title: 'Name',
    body:
      `What the card is called — the id the log, the deck sheet and the ship grid all refer to. ` +
      `${card.name} is a ${KIND_WORD[card.kind]}` +
      (role ? `, filed under ${role}.` : '.'),
  };
}

/** One printed rules line, with its timing chip. */
export function lineHint(card: Card, line: { timing: EffectTiming; text: string }): CardHint {
  const cost = card.kind !== 'event' && isActivatable(card) ? cardCost(card) : 0;
  const extra =
    line.timing === 'active' && cost > 0
      ? ` Firing everything this card resolves off one down costs ${cost}⚡ from its pool.`
      : '';
  return {
    title: line.timing === 'active' ? 'Active line' : line.timing === 'passive' ? 'Passive line' : 'Event line',
    body: `${TIMING_RULE[line.timing]} Here: ${line.text}${extra}`,
  };
}

/** The italic line under the rules. */
export const flavorHint = (card: Card): CardHint => ({
  title: 'Flavour',
  body: `Fiction, not rules — it never changes how ${card.name} resolves.`,
});

/** The footer strip, which says something different on each deck. */
export function footerHint(card: Card): CardHint {
  if (card.kind === 'item') {
    return {
      title: 'Single use',
      body: 'Every item leaves play the moment it resolves — there is no pool to charge and nothing to fit.',
    };
  }
  if (card.kind === 'event') {
    return {
      title: 'Event',
      body: 'An event has no lasting presence: it is drawn on a step, it resolves, and it goes to the discard.',
    };
  }
  const capacity = card.energyCapacity ?? 0;
  return {
    title: 'Energy pool',
    body:
      `⚡ is held on the card itself, one chit per point, and it is what pays for firing and what ` +
      `soaks damage on a shield. ${card.name} holds up to ${capacity}⚡.`,
  };
}

/** A cockpit's module-slot count. */
export const slotsHint = (card: Card): CardHint => ({
  title: 'Module slots',
  body:
    `A cockpit is the ship: it sets how many modules may hang off it, and it does not count ` +
    `itself against that number. ` +
    (card.kind === 'part' && card.role === 'COCKPIT'
      ? `This one flies with ${card.slots ?? 0} module(s), in whatever shape you attach them.`
      : ''),
});

/** The cockpit's basic attack and generator, printed as stats. */
export const cockpitStatsHint = (card: Card): CardHint => ({
  title: 'Cockpit basics',
  body:
    card.kind === 'part' && card.role === 'COCKPIT'
      ? `Every ship can always shoot and always recharge, however badly: ${card.power ?? 0}⚔ for a down ` +
        `with no ⚡ spent, or ${card.genPerDown ?? 0}⚡ back into this cockpit’s own shield for a down.`
      : '',
});

/** The once-per-set cap some modules carry. */
export const oncePerSetHint = (card: Card): CardHint => ({
  title: 'One shot per set',
  body:
    `Modules normally fire as often as a side has downs and ⚡ to pay with. ${card.name} is capped ` +
    `at one activation per fresh set of downs.`,
});
