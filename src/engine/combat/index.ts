/**
 * Combat — the 1st-down system.
 *
 * A seat gets `downCount` downs. Destroying a module with the 1st-down icon
 * ends its turn and hands it to the next seat — the enemy never gets a look
 * in; running out of downs hands it to the enemy instead. Either way the turn
 * waits for the seat to end it, so nothing flips over before the table has
 * seen what happened. The enemy plays its downs off one action deck each,
 * restarts at Down 1 whenever it earns a 1st down of its own, and gives the
 * turn back to the seat after the one that failed.
 *
 * Every attack is a d6 against the energy on the module firing it, and every
 * hit takes energy off the module it lands on — energy is hit chance and HP at
 * once. A module at 0 has nothing to spend; one more hit destroys it; destroying the
 * cockpit destroys the ship.
 *
 * Everything that happens is also recorded as a `TableEvent` — every die
 * rolled, every hit, every ⚡ moved — so the table can be shown it rather than
 * just handed the result.
 */

export { sideKey, sameSide, playerSide, enemySide, playerOf, livingParticipants, currentSide, shipOf, sideName, aggroTarget, withShip, diceRule } from './sides';
export { actionError } from './legality';
export { moduleName } from './strike';
export { resolveDown } from './resolve';
export { passToNextSeat, beginEnemyTurn, seatAfter, playerDown, endPlayerTurn, startCombat } from './turns';
export { enemyDown } from './enemy';
export type { EnemyPlanner } from './enemy';
