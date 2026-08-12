import type { DieKind } from './types/card';

/**
 * Seeded RNG. Playtest runs are reproducible from a seed, so a surprising
 * combat can be replayed with a tweaked config and compared.
 *
 * The one deliberately stateful thing in the engine: `next()` advances the
 * stream. `draws` is exposed so a run can be replayed exactly — recreate from
 * the seed and burn that many draws.
 */
export interface Rng {
  seed: number;
  /** Raw draws taken so far. */
  draws: number;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  roll(die: DieKind): number;
  rollMany(count: number, die: DieKind): number[];
  /** Uniform pick; throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick — weights line up with items by index. */
  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T;
}

export const DIE_SIDES: Record<DieKind, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};

/** mulberry32 — small, fast, good enough for dice, and trivially seedable. */
export function createRng(seed: number, burn = 0): Rng {
  let state = seed >>> 0;

  const rng: Rng = {
    seed,
    draws: 0,
    next() {
      rng.draws += 1;
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      if (max < min) return min;
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    roll(die) {
      return rng.int(1, DIE_SIDES[die]);
    },
    rollMany(count, die) {
      return Array.from({ length: Math.max(0, count) }, () => rng.roll(die));
    },
    pick(items) {
      if (items.length === 0) throw new Error('engine/rng: pick from an empty list');
      return items[rng.int(0, items.length - 1)]!;
    },
    pickWeighted(items, weights) {
      const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
      if (items.length === 0) throw new Error('engine/rng: pickWeighted from an empty list');
      if (total <= 0) return rng.pick(items);
      let roll = rng.next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= Math.max(0, weights[i] ?? 0);
        if (roll <= 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },
  };

  for (let i = 0; i < burn; i++) rng.next();
  rng.draws = burn;
  return rng;
}
