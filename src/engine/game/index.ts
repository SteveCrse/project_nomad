import type { Loadout } from '../types/game';

export {
  assemblePart,
  autoDraft,
  autoEnergy,
  draftCard,
  draftedModules,
  energyError,
  moveModule,
  nextDrafter,
  passDraft,
  pickError,
  placeEnergy,
  returnPart,
  startMission,
} from './draft';

/**
 * The run orchestrator: the piece that turns the subsystems into an actual
 * playable round.
 *
 * Everything is a pure `(state, …) → state` step so the Zustand store is a
 * thin shell and a headless sweep can drive the same functions in a loop.
 */

export type { Loadout };

export { newRun, setSplit, nextMission } from './setup';
export { moveOptions, activeSide, isPlayerTurn } from './nodes';
export { moveTo, continueRun, takeDown, endTurn, enemyStep } from './flow';
export { resolveLoot, claimReward, resolveEvent, closePrompt } from './rewards';
export { salvage, fitFromScrap, stowToScrap } from './salvage';
