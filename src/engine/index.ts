/**
 * Project N.O.M.A.D. rules engine.
 *
 * Plain TypeScript, no React, no store imports — the UI passes state and
 * config in and gets new state back. Keep it that way: it's what lets the
 * same rules run in a headless balance simulator later.
 */

export * from './types';
export * as combat from './combat';
export * as deck from './deck';
export * as ship from './ship';
export * as loot from './loot';
export * as board from './board';
export * as game from './game';
export * as ai from './ai';
export { createRng, DIE_SIDES } from './rng';
export type { Rng } from './rng';
export { makeContent, partOf, cardOf } from './content';
export type { Content } from './content';
export type { Deck } from './deck';
export type { LootChoice } from './loot';
export type { Loadout } from './game';
