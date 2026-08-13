import type { Card, ModuleRole, Rarity } from '@engine/types';

/** Role → token colour. Mirrors the ROLE map in the imported design. */
export const ROLE_COLOR: Record<ModuleRole, string> = {
  GEN: 'var(--role-gen)',
  WPN: 'var(--role-wpn)',
  SHD: 'var(--role-shd)',
  RDS: 'var(--role-rds)',
  OTH: 'var(--role-oth)',
  COCKPIT: 'var(--n-900)',
};

export const ROLE_LABEL: Record<ModuleRole, string> = {
  GEN: 'GENERATOR',
  WPN: 'WEAPON',
  SHD: 'SHIELD',
  RDS: 'REDISTRIB.',
  OTH: 'OTHER',
  COCKPIT: 'COCKPIT',
};

/**
 * Role as a word, for the card's printed header.
 *
 * `OTH` is blank on purpose: "Common Other Module" says nothing, and a card
 * with no role worth naming should just read "Common Module".
 */
const ROLE_NOUN: Record<ModuleRole, string> = {
  GEN: 'Generator',
  WPN: 'Weapon',
  SHD: 'Shield',
  RDS: 'Redistributor',
  OTH: '',
  COCKPIT: 'Cockpit',
};

const KIND_NOUN: Record<Card['kind'], string> = {
  part: 'Module',
  item: 'Item',
  event: 'Event',
};

/**
 * What a card *is*, as one line: "Common Shield Module", "Legendary Weapon
 * Item", "Rare Cockpit".
 *
 * A cockpit is its own noun rather than a kind of module — it's the ship, not
 * something fitted to one — so it stands in for the kind instead of qualifying
 * it.
 */
export function cardTitleLine(card: Card): string {
  const role = card.kind === 'event' ? '' : ROLE_NOUN[card.role];
  const kind = role === 'Cockpit' ? '' : KIND_NOUN[card.kind];
  return [rarityName(card.rarity), role, kind].filter(Boolean).join(' ');
}

/** Rarity ramp, index 0 = rarity 1 (common). */
export const RARITY_COLOR: string[] = [
  'var(--rarity-1)',
  'var(--rarity-2)',
  'var(--rarity-3)',
  'var(--rarity-4)',
  'var(--rarity-5)',
];

export const RARITY_NAME: string[] = ['COMMON', 'UNCOMMON', 'RARE', 'ULTRA RARE', 'LEGENDARY'];

export const rarityColor = (rarity: Rarity | number): string =>
  RARITY_COLOR[rarity - 1] ?? RARITY_COLOR[0]!;

export const rarityName = (rarity: Rarity | number): string =>
  RARITY_NAME[rarity - 1] ?? RARITY_NAME[0]!;

/**
 * Text colour that reads on a rarity band.
 *
 * Only legendary's red is dark enough to want cream on it; the rest carry the
 * near-black the rest of the card is set in.
 */
export const rarityInk = (rarity: Rarity | number): string =>
  rarity >= 5 ? 'var(--cream-100)' : 'var(--n-900)';

/**
 * Shield bar colour by remaining percentage — green / amber / red.
 * Red means the cockpit pool is nearly dry, which is as close to "critical"
 * as a ship gets: the next hit past it wrecks the ship.
 */
export function shieldColor(pct: number): string {
  if (pct < 30) return 'var(--toggle-red-500)';
  if (pct < 70) return 'var(--amber-500)';
  return 'var(--crt-green-500)';
}
