import { useState } from 'react';
import type { Cell, CardId, GameConfig, GameState, PlayerId, PlayerState, ShipSlot } from '@engine/types';
import { game, ship as shipEngine } from '@engine';
import { CONTENT, getPart } from '@data';
import type { DragPayload } from '@/components/fx/drag';
import { useGameStore } from '@/store/gameStore';

/**
 * Building ships on the table: the draft, laying a ship out, putting the
 * leftover tokens on it, and rebuilding from the scrap deck.
 *
 * Every seat's ship lies at its seat the whole time, so there is no "current
 * ship" — each rule here is asked per seat. A card is moved by dragging it, or
 * by clicking it (it's then *in hand*) and clicking where it goes; the engine
 * decides every time whether it may land there.
 */
export interface TableBuild {
  drafting: boolean;
  rebuilding: boolean;
  /** The cockpit round is still being dealt out. */
  cockpitRound: boolean;
  /** The draft is over: leftover tokens go on the ships. */
  energyPhase: boolean;
  /** The seat on the clock in the draft. */
  drafter: PlayerId | null;
  /** The card (or token) picked up with a click, waiting for a place to go. */
  inHand: DragPayload | null;
  /** Pick something up with a click; the same thing again puts it back. */
  pick: (payload: DragPayload | null) => void;
  /** The card the seat on the clock carried from the spread and set down at its seat: not drafted until it says so. */
  placed: Placed | null;
  /** Draft the card set down, where it lies. */
  draftPlaced: () => void;
  /** Carry the card set down back to the middle. */
  unplace: () => void;
  /** A seat has a ship on the table (not so before its cockpit is drafted). */
  hasShip: (player: PlayerState) => boolean;
  canEdit: (player: PlayerState) => boolean;
  /** Why the seat on the clock can't take this card off the spread; null when it can. */
  draftError: (cardId: CardId) => string | null;
  cellAccepts: (player: PlayerState, p: DragPayload, cell: Cell) => boolean;
  cellDrop: (player: PlayerState, p: DragPayload, cell: Cell) => void;
  slotAccepts: (player: PlayerState, p: DragPayload, slot: ShipSlot) => boolean;
  slotDrop: (player: PlayerState, p: DragPayload, slot: ShipSlot) => void;
  /** The empty place a seat's cockpit goes, in the cockpit round. */
  berthAccepts: (player: PlayerState, p: DragPayload) => boolean;
  berthDrop: (player: PlayerState, p: DragPayload) => void;
  /** Beside the ship: drafted cards not fitted yet, or the scrap deck at a rebuild. */
  rackAccepts: (player: PlayerState, p: DragPayload) => boolean;
  rackDrop: (player: PlayerState, p: DragPayload) => void;
  /** A seat's pile of energy tokens. */
  purseAccepts: (player: PlayerState, p: DragPayload) => boolean;
  purseDrop: (player: PlayerState, p: DragPayload) => void;
  /** A seat itself, for the Item cards a Loot step turned up. */
  seatAccepts: (player: PlayerState, p: DragPayload) => boolean;
  seatDrop: (player: PlayerState, p: DragPayload) => void;
}

/** A card off the draft spread, set down at a seat: on a cell of its ship, on its cockpit's place, or beside the ship. */
export interface Placed {
  cardId: CardId;
  /** Where it lay in the spread. */
  at: number;
  player: PlayerId;
  where: Cell | 'berth' | 'rack';
  /** Picking it up again carries this. */
  payload: DragPayload;
}

const same = (a: DragPayload | null, b: DragPayload | null): boolean => JSON.stringify(a) === JSON.stringify(b);

export function useTableBuild(state: GameState, config: GameConfig): TableBuild {
  const store = useGameStore();
  const [held, setHeld] = useState<DragPayload | null>(null);
  const [set, setSet] = useState<(Omit<Placed, 'payload'> & { stamp: string }) | null>(null);

  const setup = state.setup;
  const drafting = state.phase === 'setup' && !!setup;
  const rebuilding = state.phase === 'rearrange';
  const cockpitRound = drafting && setup!.round === 0 && !setup!.complete;
  const energyPhase = drafting && !!setup!.complete;
  const drafter = drafting ? game.nextDrafter(state) : null;
  const seat = (id: PlayerId) => state.party.players.find((p) => p.id === id);

  const hasShip = (player: PlayerState) => !(cockpitRound && !setup!.picked.includes(player.id));
  const canEdit = (player: PlayerState) => (drafting && !cockpitRound && hasShip(player)) || rebuilding;
  const draftError = (cardId: CardId) => (drafter ? game.pickError(CONTENT, config, state, drafter, cardId) : 'Nobody is picking.');

  /** What's in hand has to still be there: the state moves on under it. */
  const live = (p: DragPayload | null): boolean => {
    if (!p) return false;
    switch (p.kind) {
      case 'table':
        return drafting && setup!.table[p.at] === p.cardId && !!drafter;
      case 'hold':
        return drafting && seat(p.player)?.carriedParts[p.at] === p.cardId;
      case 'scrap':
        return rebuilding && seat(p.player)?.scrapDeck[p.at] === p.cardId;
      case 'grid': {
        const owner = seat(p.player);
        return !!owner && canEdit(owner) && owner.ship.slots[p.slot]?.partId === p.cardId;
      }
      case 'token':
        return energyPhase && (seat(p.player)?.tokens ?? 0) > 0;
      default:
        return false;
    }
  };
  const inHand = live(held) ? held : null;
  const done = () => setHeld(null);

  // A card set down stays set down only while the same seat is on the same pick.
  const stamp = drafting ? `${setup!.round}:${setup!.picked.length}:${drafter}` : '';
  const placed: Placed | null =
    set && set.stamp === stamp && set.player === drafter && setup!.table[set.at] === set.cardId
      ? { ...set, payload: { kind: 'table', cardId: set.cardId, at: set.at } }
      : null;
  /** Dropping a card of the spread at a seat sets it down there; the Draft button takes it. */
  const place = (player: PlayerState, p: DragPayload, where: Placed['where']) => {
    if (p.kind === 'table') setSet({ cardId: p.cardId, at: p.at, player: player.id, where, stamp });
  };

  const fitsAt = (player: PlayerState, cardId: CardId, cell: Cell): boolean => {
    const part = getPart(cardId);
    return (
      !!part &&
      part.role !== 'COCKPIT' &&
      shipEngine.hasRoomFor(CONTENT, player.ship, cardId, config.shipSizeRule) &&
      shipEngine.canPlaceAt(CONTENT, player.ship, cardId, cell)
    );
  };
  const cockpitAt = (player: PlayerState) => shipEngine.cockpitIndex(player.ship);

  return {
    drafting,
    rebuilding,
    cockpitRound,
    energyPhase,
    drafter,
    inHand,
    pick: (payload) => {
      store.clearError();
      setHeld(payload && !same(payload, inHand) ? payload : null);
    },
    placed,
    draftPlaced: () => {
      if (!placed) return;
      store.draftCard(placed.cardId, typeof placed.where === 'object' ? placed.where : undefined);
      setSet(null);
      done();
    },
    unplace: () => {
      setSet(null);
      done();
    },
    hasShip,
    canEdit,
    draftError,

    cellAccepts: (player, p, cell) => {
      if (!canEdit(player)) return false;
      switch (p.kind) {
        case 'grid':
          return p.player === player.id && shipEngine.canMoveTo(CONTENT, player.ship, p.slot, cell);
        case 'table':
          return player.id === drafter && !draftError(p.cardId) && fitsAt(player, p.cardId, cell);
        case 'hold':
          return drafting && p.player === player.id && player.carriedParts.includes(p.cardId) && fitsAt(player, p.cardId, cell);
        case 'scrap':
          return rebuilding && p.player === player.id && player.scrapDeck.includes(p.cardId) && fitsAt(player, p.cardId, cell);
        default:
          return false;
      }
    },
    cellDrop: (player, p, cell) => {
      if (p.kind === 'grid') store.moveModule(player.id, p.slot, cell);
      else if (p.kind === 'table') place(player, p, cell);
      else if (p.kind === 'hold') store.assemblePart(player.id, p.cardId, cell);
      else if (p.kind === 'scrap') store.fitFromScrap(player.id, p.cardId, cell);
      done();
    },

    slotAccepts: (player, p, slot) => {
      if (!canEdit(player)) return false;
      if (p.kind === 'grid') return p.player === player.id && p.slot !== slot.index && shipEngine.canMoveTo(CONTENT, player.ship, p.slot, slot);
      if (p.kind === 'token') return energyPhase && p.player === player.id && !game.energyError(CONTENT, config, state, player.id, slot.index, 1);
      if (p.kind === 'scrap') {
        return rebuilding && p.player === player.id && slot.index === cockpitAt(player) && getPart(p.cardId)?.role === 'COCKPIT';
      }
      return false;
    },
    slotDrop: (player, p, slot) => {
      if (p.kind === 'grid') store.moveModule(player.id, p.slot, slot);
      else if (p.kind === 'token') store.placeEnergy(player.id, slot.index, 1);
      else if (p.kind === 'scrap') store.fitFromScrap(player.id, p.cardId, null);
      // A token stays in hand while there are more: one click a marker.
      if (p.kind !== 'token' || player.tokens <= 1) done();
    },

    berthAccepts: (player, p) => cockpitRound && p.kind === 'table' && player.id === drafter && !draftError(p.cardId),
    berthDrop: (player, p) => {
      place(player, p, 'berth');
      done();
    },

    rackAccepts: (player, p) => {
      if (p.kind === 'table') return drafting && !cockpitRound && player.id === drafter && !draftError(p.cardId);
      if (p.kind === 'grid') return p.player === player.id && canEdit(player) && p.slot !== cockpitAt(player);
      return false;
    },
    rackDrop: (player, p) => {
      if (p.kind === 'table') place(player, p, 'rack');
      else if (p.kind === 'grid') {
        if (rebuilding) store.stowToScrap(player.id, p.slot);
        else store.returnPart(player.id, p.slot);
      }
      done();
    },

    purseAccepts: (player, p) =>
      p.kind === 'untoken' && p.player === player.id && !game.energyError(CONTENT, config, state, player.id, p.slot, -1),
    purseDrop: (player, p) => {
      if (p.kind === 'untoken') store.placeEnergy(player.id, p.slot, -1);
    },

    seatAccepts: (player, p) => p.kind === 'reward' && state.prompt?.kind === 'reward' && !player.destroyed,
    seatDrop: (player, p) => {
      if (p.kind === 'reward') store.claimReward(player.id);
    },
  };
}
