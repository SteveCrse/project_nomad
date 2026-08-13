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
import { activeEffects, combat, hasVariableDice, ship as shipEngine } from '@engine';
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

      const manual = activeEffects(part).some((e) => e.type === 'manual');
      const needsModuleTarget = !!part.targetsModule;
      const action: DownAction = {
        type: 'activate-module',
        slot: slot.index,
        ...(choice.target ? { target: choice.target } : {}),
        ...(needsModuleTarget && choice.targetSlot !== undefined && choice.targetSlot !== null
          ? { targetSlot: choice.targetSlot }
          : {}),
        ...(hasVariableDice(part) ? { diceCount: choice.diceCount ?? 1 } : {}),
        ...(manual && choice.manualDamage ? { manualDamage: choice.manualDamage } : {}),
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
        spent: slot.usedThisDownSet,
        offensive: shipEngine.isOffensive(part),
        needsModuleTarget,
        manual,
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
      // The cockpit has its own row in the action bar — its generator is the
      // way it recharges, so it isn't listed among the chargeable shields.
      if (!part || part.role !== 'SHD' || part.partType === 'cockpit') return null;
      const action: DownAction = { type: 'charge-shield', slot: slot.index, amount: 1 };
      return { slot: slot.index, part, error: combat.actionError(CONTENT, battle, config, side, action) };
    })
    .filter((o): o is { slot: SlotIndex; part: PartCard; error: string | null } => o !== null);
}

export interface CockpitOptions {
  part: PartCard;
  /** Printed ⚔ of the basic attack. */
  power: number;
  /** ⚡ one down of the basic generator puts back. */
  generation: number;
  charge: number;
  capacity: number;
  attack: { action: DownAction; error: string | null };
  generate: { action: DownAction; error: string | null };
}

/**
 * The two downs every ship always has: the cockpit's basic attack and its
 * basic generator.
 *
 * Both are free of ⚡ by design — with no HP pool, the cockpit is the ship's
 * weapon of last resort *and* its last shield, so a seat stripped down to bare
 * metal still has something to do with a down.
 */
export function cockpitOptions(
  state: GameState,
  config: GameConfig,
  side: SideRef,
  choice: TargetChoice,
): CockpitOptions | null {
  const battle = battleOf(state);
  if (!battle) return null;
  const ship = combat.shipOf(battle, side);
  if (!ship) return null;
  const cockpit = shipEngine.cockpitOf(CONTENT, ship);
  if (!cockpit) return null;

  const attack: DownAction = {
    type: 'cockpit-attack',
    ...(choice.target ? { target: choice.target } : {}),
  };
  const generate: DownAction = { type: 'cockpit-generate' };

  return {
    part: cockpit.part,
    power: shipEngine.cockpitPower(CONTENT, ship),
    generation: shipEngine.cockpitGeneration(CONTENT, ship),
    charge: shipEngine.cockpitCharge(CONTENT, ship),
    capacity: shipEngine.cockpitCapacity(CONTENT, ship),
    attack: { action: attack, error: combat.actionError(CONTENT, battle, config, side, attack) },
    generate: { action: generate, error: combat.actionError(CONTENT, battle, config, side, generate) },
  };
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
