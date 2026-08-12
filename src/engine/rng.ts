import type { DieKind } from './types/card';

/**
 * Seeded RNG. Playtest runs are reproducible from a seed, so a surprising
 * combat can be replayed with a tweaked config and compared.
 */
export interface Rng {
  seed: number;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  roll(die: DieKind): number;
  rollMany(count: number, die: DieKind): number[];
}

export const DIE_SIDES: Record<DieKind, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};

// TODO: mulberry32 or similar. Kept as a stub so no caller depends on the
// distribution before it's the real one.
export function createRng(_seed: number): Rng {
  throw new Error('engine/rng: createRng not implemented');
}
