import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Cell, CardId, ShipSlot, SlotIndex } from '@engine/types';
import { game, ship as shipEngine } from '@engine';
import type { DragPayload } from '@/components/fx/drag';
import { scrapCapacityFor } from '@/lib/combatView';
import { departFrom } from '@/lib/fly';
import { CONTENT, getPart } from '@data';
import { useConfig } from '@/store/configStore';
import { useGame, useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';
import { DraftBar, DraftTable } from './shipBuilder/DraftPanel';
import { RebuildBar, BuilderStats } from './shipBuilder/RebuildBar';
import { GridEditor } from './shipBuilder/GridEditor';
import { EnergyPool, CardRack } from './shipBuilder/Rack';
import { SelectedPanel } from './shipBuilder/SelectedPanel';

/**
 * Ship Builder: the draft at the start of a run, and rebuilding at the end of
 * a mission.
 *
 * A ship is a grid around its cockpit: the rows above it are the front, its
 * own row its sides, the rows below its back. Weapons never go in front of the
 * cockpit, nothing goes in front of a shield, every module has to be attached,
 * and cards print limits of their own — so where a module may go is the
 * builder's main job. Pick a card up and every cell it may land on lights up.
 *
 * The draft is paid for in energy tokens. Whatever a seat doesn't spend, it
 * puts on its modules as starting ⚡ once the draft is over.
 */

export function ShipBuilderView() {
  const state = useGame();
  const config = useConfig();
  const builderPlayerId = useUiStore((s) => s.builderPlayerId);
  const setBuilderPlayer = useUiStore((s) => s.setBuilderPlayer);
  const selectPart = useUiStore((s) => s.selectPart);
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const store = useGameStore();
  const [selectedSlot, setSelectedSlot] = useState<SlotIndex | null>(null);

  const drafting = state?.phase === 'setup';
  const rebuilding = state?.phase === 'rearrange';
  const onTheClock = state && drafting ? game.nextDrafter(state) : null;
  const table = drafting ? (state?.setup?.table ?? []) : [];
  // The view sits with the seat on the clock, so the table is always picked
  // onto the ship you're looking at.
  const follow = drafting ? (onTheClock ?? state?.setup?.lastPickedBy ?? null) : null;

  // When the pick moves on, hold the view a beat on the ship the card just
  // landed on before following the next seat.
  const followed = useRef<string | null>(null);
  useEffect(() => {
    if (!follow) return;
    const first = followed.current === null;
    followed.current = follow;
    if (first) return setBuilderPlayer(follow);
    const timer = setTimeout(() => setBuilderPlayer(follow), 700);
    return () => clearTimeout(timer);
  }, [follow, setBuilderPlayer]);

  if (!state) {
    return <div className="p-4 text-[15px] text-putty-700">Start a run to build a ship.</div>;
  }

  const player = state.party.players.find((p) => p.id === builderPlayerId) ?? state.party.players[0];
  if (!player) return null;

  const setup = state.setup;
  const canEdit = drafting || rebuilding;
  const picking = drafting && player.id === onTheClock;
  const cockpitRound = drafting && setup?.round === 0 && !setup.complete;
  const energyPhase = drafting && !!setup?.complete;
  const ship = player.ship;
  const cockpitAt = shipEngine.cockpitIndex(ship);

  // ---------------------------------------------------------------- rules

  const fitsAt = (cardId: CardId, cell: Cell): boolean => {
    const part = getPart(cardId);
    return (
      !!part &&
      part.role !== 'COCKPIT' &&
      shipEngine.hasRoomFor(CONTENT, ship, cardId, config.shipSizeRule) &&
      shipEngine.canPlaceAt(CONTENT, ship, cardId, cell)
    );
  };

  /** May this land on an empty cell? */
  const cellAccepts = (p: DragPayload, cell: Cell): boolean => {
    if (!canEdit || cockpitRound) return false;
    switch (p.kind) {
      case 'grid':
        return shipEngine.canMoveTo(CONTENT, ship, p.slot, cell);
      case 'table':
        return picking && !game.pickError(CONTENT, config, state, player.id, p.cardId) && fitsAt(p.cardId, cell);
      case 'hold':
        return drafting && player.carriedParts.includes(p.cardId) && fitsAt(p.cardId, cell);
      case 'scrap':
        return rebuilding && player.scrapDeck.includes(p.cardId) && fitsAt(p.cardId, cell);
      default:
        return false;
    }
  };

  const cellDrop = (p: DragPayload, cell: Cell) => {
    if (p.kind === 'grid') store.moveModule(player.id, p.slot, cell);
    else if (p.kind === 'table') store.draftCard(p.cardId, cell);
    else if (p.kind === 'hold') store.assemblePart(player.id, p.cardId, cell);
    else if (p.kind === 'scrap') store.fitFromScrap(player.id, p.cardId, cell);
    selectPart(null);
    setSelectedSlot(null);
  };

  /** May this land on a module that's already there? Swaps, tokens, a new cockpit. */
  const slotAccepts = (p: DragPayload, slot: ShipSlot): boolean => {
    if (!canEdit || cockpitRound) return false;
    if (p.kind === 'grid') return shipEngine.canMoveTo(CONTENT, ship, p.slot, slot);
    if (p.kind === 'token') return energyPhase && !game.energyError(CONTENT, config, state, player.id, slot.index, 1);
    if (p.kind === 'scrap') return rebuilding && slot.index === cockpitAt && getPart(p.cardId)?.role === 'COCKPIT';
    return false;
  };

  const slotDrop = (p: DragPayload, slot: ShipSlot) => {
    if (p.kind === 'grid') store.moveModule(player.id, p.slot, slot);
    else if (p.kind === 'token') store.placeEnergy(player.id, slot.index, 1);
    else if (p.kind === 'scrap') store.fitFromScrap(player.id, p.cardId, null);
    setSelectedSlot(null);
  };

  // Clicking a card arms it the way picking it up does: the cells it may go
  // to light up, and clicking one puts it there.
  const armed: DragPayload | null = !selectedPartId
    ? null
    : picking && table.includes(selectedPartId)
      ? { kind: 'table', cardId: selectedPartId }
      : drafting && player.carriedParts.includes(selectedPartId)
        ? { kind: 'hold', cardId: selectedPartId }
        : rebuilding && player.scrapDeck.includes(selectedPartId)
          ? { kind: 'scrap', cardId: selectedPartId }
          : canEdit && selectedSlot !== null && selectedSlot !== cockpitAt && ship.slots[selectedSlot]?.partId === selectedPartId
            ? { kind: 'grid', slot: selectedSlot, cardId: selectedPartId }
            : null;

  const onTake = (cardId: CardId) => {
    departFrom(`card:${cardId}`, document.querySelector(`[data-table-card="${cardId}"]`)?.getBoundingClientRect());
    store.draftCard(cardId);
    selectPart(null);
  };

  return (
    <div className="flex min-h-0 flex-1 gap-5">
      <div className="flex min-w-0 flex-1 flex-col overflow-auto pr-1">
        {drafting && <DraftBar state={state} />}
        <AnimatePresence initial={false}>
          {drafting && table.length > 0 && (
            <motion.div
              key="table"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex-none overflow-hidden"
            >
              <DraftTable state={state} table={table} picking={picking} onTake={onTake} />
            </motion.div>
          )}
        </AnimatePresence>
        {rebuilding && <RebuildBar state={state} />}

        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <div className="font-display text-[20px] font-bold">{drafting ? 'ASSEMBLY' : 'SHIP BUILDER'}</div>
          <div className="flex gap-1.5">
            {state.party.players.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setBuilderPlayer(p.id);
                  setSelectedSlot(null);
                }}
                className={[
                  'relative cursor-pointer border px-2.5 py-[5px] font-mono text-[11px] transition-colors duration-150',
                  p.id === player.id
                    ? 'border-n-900 bg-n-900 text-cream-100'
                    : 'border-putty-500 bg-putty-100 text-putty-700 hover:border-n-900',
                ].join(' ')}
              >
                <span className="mr-1.5 inline-block h-2 w-2" style={{ background: p.accent }} />
                {p.label}
                {p.id === onTheClock ? ' ◂ PICKS' : ''}
                {drafting && setup?.done.includes(p.id) && !setup.complete ? ' · DONE' : ''}
                {energyPhase && p.tokens > 0 ? ` · ${p.tokens}⚡` : ''}
              </button>
            ))}
          </div>
          <BuilderStats player={player} config={config} drafting={drafting} />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={player.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
          >
            <GridEditor
              player={player}
              canEdit={canEdit && !cockpitRound}
              cockpitRound={cockpitRound}
              energyPhase={energyPhase}
              armed={armed}
              cellAccepts={cellAccepts}
              cellDrop={cellDrop}
              slotAccepts={slotAccepts}
              slotDrop={slotDrop}
              selectedSlot={selectedSlot}
              onSelectSlot={(slot) => {
                const id = ship.slots[slot]?.partId ?? null;
                const same = slot === selectedSlot;
                setSelectedSlot(same ? null : slot);
                selectPart(same ? null : id);
              }}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex w-[300px] flex-none flex-col gap-3.5 overflow-auto">
        {energyPhase && <EnergyPool player={player} />}
        {drafting ? (
          <CardRack
            id="hold"
            title="DRAFT HOLD"
            count={`${player.carriedParts.length}`}
            cards={player.carriedParts}
            empty="Drafted modules that aren’t on the ship yet. Drag one off the ship to pull it back."
            kind="hold"
            canDrag={!cockpitRound}
            zone={{
              accepts: (p) =>
                (p.kind === 'table' && picking && !game.pickError(CONTENT, config, state, player.id, p.cardId)) ||
                (p.kind === 'grid' && p.slot !== cockpitAt),
              onDrop: (p) => {
                if (p.kind === 'table') store.draftCard(p.cardId);
                else if (p.kind === 'grid') store.returnPart(player.id, p.slot);
                setSelectedSlot(null);
              },
            }}
          />
        ) : (
          <CardRack
            id="scrap"
            title="SCRAP DECK"
            count={`${player.scrapDeck.length}/${scrapCapacityFor(player, config)}`}
            cards={player.scrapDeck}
            empty={
              rebuilding
                ? 'Empty. Drag modules here to stow them.'
                : 'Empty. Modules land here when you abandon a ship, or salvage the boss.'
            }
            kind="scrap"
            canDrag={rebuilding}
            zone={
              rebuilding
                ? {
                    accepts: (p) => p.kind === 'grid' && p.slot !== cockpitAt,
                    onDrop: (p) => {
                      if (p.kind === 'grid') store.stowToScrap(player.id, p.slot);
                      setSelectedSlot(null);
                    },
                  }
                : null
            }
          />
        )}
        <SelectedPanel state={state} player={player} selectedSlot={selectedSlot} onDone={() => setSelectedSlot(null)} />
      </div>
    </div>
  );
}
