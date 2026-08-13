import type {
  Battle,
  DownAction,
  EnergyTransfer,
  GameConfig,
  GameState,
  PartCard,
  PlayerState,
  Ship,
  SideRef,
  SlotIndex,
} from '@engine/types';
import { combat, ship as shipEngine } from '@engine';
import { CONTENT, getPart } from '@data';

/**
 * View-side derivations for the combat surface.
 *
 * The engine owns legality; this module only asks it questions on behalf of
 * the UI so buttons can be disabled with the engine's own reason attached.
 */

export const battleOf = (state: GameState): Battle | null =>
  state.combat ? { party: state.party, combat: state.combat } : null;

export interface ModuleOption {
  slot: SlotIndex;
  part: PartCard;
  action: DownAction;
  /** null when the module can be fired right now. */
  error: string | null;
  energyCost: number;
  apCost: number;
  /** Fired already in this set of downs. */
  spent: boolean;
  offensive: boolean;
  /** The player has to pick an enemy module for this one. */
  needsModuleTarget: boolean;
  manual: boolean;
}

export interface TargetChoice {
  target?: SideRef;
  targetSlot?: SlotIndex;
  diceCount?: number;
  manualDamage?: number;
}

/** Every module on the active seat's ship, with the engine's verdict on each. */
export function moduleOptions(
  state: GameState,
  config: GameConfig,
  side: SideRef,
  choice: TargetChoice,
): ModuleOption[] {
  const battle = battleOf(state);
  if (!battle) return [];
  const ship = combat.shipOf(battle, side);
  if (!ship) return [];

  return ship.slots
    .map((slot): ModuleOption | null => {
      const part = getPart(slot.partId);
      if (!part || part.partType === 'cockpit') return null;

      const effect = shipEngine.effectOf(part);
      const needsModuleTarget = !!part.targetsModule;
      const action: DownAction = {
        type: 'activate-module',
        slot: slot.index,
        ...(choice.target ? { target: choice.target } : {}),
        ...(needsModuleTarget && choice.targetSlot !== undefined && choice.targetSlot !== null
          ? { targetSlot: choice.targetSlot }
          : {}),
        ...(part.dice?.count === 'variable' ? { diceCount: choice.diceCount ?? 1 } : {}),
        ...(effect.kind === 'manual' && choice.manualDamage ? { manualDamage: choice.manualDamage } : {}),
      };

      const error =
        part.partType === 'passive-module'
          ? 'passive — always on'
          : combat.actionError(CONTENT, battle, config, side, action);

      return {
        slot: slot.index,
        part,
        action,
        error,
        energyCost: shipEngine.energyCostOf(part, config, choice.diceCount),
        apCost: part.apCost ?? 0,
        spent: slot.usedThisDownSet,
        offensive: shipEngine.isOffensive(part),
        needsModuleTarget,
        manual: effect.kind === 'manual',
      };
    })
    .filter((o): o is ModuleOption => o !== null);
}

/** Shield modules with room, for the charge-shield action. */
export function shieldOptions(
  state: GameState,
  config: GameConfig,
  side: SideRef,
): { slot: SlotIndex; part: PartCard; error: string | null }[] {
  const battle = battleOf(state);
  if (!battle) return [];
  const ship = combat.shipOf(battle, side);
  if (!ship) return [];
  return ship.slots
    .map((slot) => {
      const part = getPart(slot.partId);
      if (!part || part.role !== 'SHD') return null;
      const action: DownAction = { type: 'charge-shield', slot: slot.index, amount: 1 };
      return { slot: slot.index, part, error: combat.actionError(CONTENT, battle, config, side, action) };
    })
    .filter((o): o is { slot: SlotIndex; part: PartCard; error: string | null } => o !== null);
}

export function activePlayer(state: GameState): PlayerState | undefined {
  const side = state.combat ? combat.currentSide(state.combat) : undefined;
  if (side?.kind !== 'player') return undefined;
  return state.party.players.find((p) => p.id === side.id);
}

export const sideLabelOf = (state: GameState, side: SideRef | undefined): string => {
  const battle = battleOf(state);
  if (!battle || !side) return '—';
  return combat.sideName(battle, side);
};

/** Downs readout for a side. */
export function downsOf(state: GameState, side: SideRef | undefined) {
  if (!state.combat || !side) return undefined;
  return combat.downsFor(state.combat, side);
}

export const livingEnemies = (state: GameState) =>
  state.combat ? combat.livingEnemies(state.combat) : [];

/** Adjacency chains on a ship, for the builder readout. */
export function adjacencyFor(player: PlayerState) {
  return shipEngine.findAdjacencyBonuses(CONTENT, player.ship);
}

export const scrapCapacityFor = (player: PlayerState, config: GameConfig): number =>
  config.scrapCap + shipEngine.scrapCapBonus(CONTENT, player.ship);

/**
 * What a pool will hold once the legs already queued for this reroute pass
 * land — a leg drains whatever its source is holding *at its turn in the
 * order*, so a generator feeding a redistributor raises what the
 * redistributor can pass on.
 */
export function projectedEnergy(
  ship: Ship,
  transfers: EnergyTransfer[],
  slot: SlotIndex,
): number {
  let energy = ship.slots[slot]?.energy ?? 0;
  for (const t of transfers) {
    if (t.to === slot) energy += t.amount;
    if (t.from === slot) energy -= t.amount;
  }
  return Math.max(0, energy);
}
