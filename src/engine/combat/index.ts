import type { CombatState, DownAction, DownResult, DownsState, SideRef } from '../types/combat';
import type { GameConfig } from '../types/config';
import type { Rng } from '../rng';

/**
 * Combat resolution — the symmetric downs system.
 *
 * Both sides run the same loop: spend up to `downCount` downs, and if the
 * damage dealt across that set reaches the opposing threshold, take a fresh
 * set instead of passing the turn.
 *
 * Nothing here is implemented yet — this pass only fixes the shape of the API
 * so the UI and data files can be built against it.
 */

/** Open a fresh set of downs for a side. */
export function startDownSet(_config: GameConfig, _side: SideRef, _threshold: number): DownsState {
  throw new Error('engine/combat: startDownSet not implemented');
}

/** Resolve a single down: apply the action, roll any dice, tally damage. */
export function resolveDown(
  _state: CombatState,
  _config: GameConfig,
  _action: DownAction,
  _rng: Rng,
): DownResult {
  throw new Error('engine/combat: resolveDown not implemented');
}

/** Has this side hit its threshold within the current set? */
export function checkConversion(_downs: DownsState): boolean {
  throw new Error('engine/combat: checkConversion not implemented');
}

/** Advance to the next set of downs, or pass the turn. */
export function advanceTurn(_state: CombatState, _config: GameConfig): CombatState {
  throw new Error('engine/combat: advanceTurn not implemented');
}

/** Apply damage to a side's HP pool, after shields. */
export function applyDamage(_state: CombatState, _target: SideRef, _amount: number): CombatState {
  throw new Error('engine/combat: applyDamage not implemented');
}
