import type { ModuleRole, Rarity } from '@engine/types';

/** Role → token colour. Mirrors the ROLE map in the imported design. */
export const ROLE_COLOR: Record<ModuleRole, string> = {
  GEN: 'var(--role-gen)',
  WPN: 'var(--role-wpn)',
  SHD: 'var(--role-shd)',
  RDS: 'var(--role-rds)',
  OTH: 'var(--role-oth)',
};

export const ROLE_LABEL: Record<ModuleRole, string> = {
  GEN: 'GENERATOR',
  WPN: 'WEAPON',
  SHD: 'SHIELD',
  RDS: 'REDISTRIB.',
  OTH: 'OTHER',
};

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

/** Deck header colour by card kind. */
export const KIND_COLOR: Record<string, string> = {
  part: 'var(--role-gen)',
  item: 'var(--role-shd)',
  event: 'var(--role-rds)',
};

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
