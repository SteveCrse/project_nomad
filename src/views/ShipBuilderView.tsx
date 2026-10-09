import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Cell, CardId, GameConfig, GameState, PartCard, PlayerId, PlayerState, ShipSlot, SlotIndex } from '@engine/types';
import { game, powerCostOf, printedLines, ship as shipEngine } from '@engine';
import { Button } from '@/components/ds';
import { ModuleTile } from '@/components/game/ModuleTile';
import { ShipGrid } from '@/components/game/ShipGrid';
import { FirstDownBadge } from '@/components/game/FirstDownBadge';
import { TIMING_CHIP } from '@/components/game/CardTile';
import { dragSource, useDragStore, useDropZone, type DragPayload } from '@/components/fx/drag';
import { ROLE_COLOR, ROLE_LABEL } from '@/lib/palette';
import { cockpitStats, fxKey, scrapCapacityFor, sizeReadout } from '@/lib/combatView';
import { departFrom } from '@/lib/fly';
import { CONTENT, getPart } from '@data';
import { useConfig } from '@/store/configStore';
import { useGame, useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

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

// -------------------------------------------------------------------- draft

/**
 * The draft's control strip: which round, the snake order with the seat on
 * the clock, what every seat has left to spend, and the buttons that end it.
 */
function DraftBar({ state }: { state: GameState }) {
  const config = useConfig();
  const draftAll = useGameStore((s) => s.draftAll);
  const passDraft = useGameStore((s) => s.passDraft);
  const startMission = useGameStore((s) => s.startMission);
  const setup = state.setup!;
  const onTheClock = game.nextDrafter(state);
  const seat = state.party.players.find((p) => p.id === onTheClock);
  const label = (id: PlayerId) => state.party.players.find((p) => p.id === id)?.label ?? id;
  const canPass = !!seat && setup.round > 0;
  const canStart = setup.complete || setup.round > 0;
  const unplaced = state.party.players.reduce((sum, p) => sum + (setup.complete ? p.tokens : 0), 0);

  return (
    <div className="mb-3 flex flex-none flex-wrap items-center gap-3 border-2 border-border-strong bg-crt-glass px-3 py-2.5">
      <span className="font-mono text-[10px] tracking-console text-crt-green-500">
        SETUP ·{' '}
        {setup.complete
          ? 'PLACE ENERGY'
          : setup.round === 0
            ? 'COCKPIT ROUND'
            : `MODULE ROUND ${setup.round}/${config.draftRounds}`}
      </span>

      {!setup.complete && (
        <div className="flex items-center gap-1 font-mono text-[11px] text-crt-white">
          <span className="text-putty-400">ORDER {setup.round % 2 === 0 ? '→' : '←'}</span>
          {setup.order.map((id) => (
            <motion.span
              key={id}
              layout
              className={[
                'border px-1.5 py-px transition-colors duration-200',
                id === onTheClock
                  ? 'border-crt-green-500 text-crt-green-500'
                  : setup.picked.includes(id)
                    ? 'border-putty-600 text-putty-500 line-through'
                    : 'border-putty-600 text-crt-white',
              ].join(' ')}
            >
              {label(id)}
              {setup.passed.includes(id) ? ' · PASS' : ''}
            </motion.span>
          ))}
        </div>
      )}

      <span className="text-[15px] text-crt-white">
        {setup.complete
          ? 'Draft over. Drag modules to rearrange, and put your leftover tokens on them as starting ⚡ — drag a token onto a module, or use + / −.'
          : seat
            ? setup.round === 0
              ? `${seat.label} takes a cockpit.`
              : `${seat.label} buys a module or passes — ${seat.tokens} token(s) left. Every token not spent is starting ⚡.`
            : 'Dealing…'}
      </span>

      <div className="ml-auto flex gap-2">
        {canPass && (
          <Button size="sm" variant="secondary" onClick={passDraft} title="Skip this round and keep the tokens for starting energy">
            Pass
          </Button>
        )}
        {!setup.complete && (
          <Button size="sm" variant="secondary" onClick={draftAll}>
            Draft the rest
          </Button>
        )}
        <Button
          size="sm"
          className={setup.complete && unplaced === 0 ? 'attention' : ''}
          onClick={startMission}
          disabled={!canStart}
          title={
            !canStart
              ? 'Everyone needs a cockpit first'
              : unplaced > 0
                ? `${unplaced} token(s) still unplaced — they’re lost if you start now`
                : 'Anything still on the table goes back to its deck'
          }
        >
          Start the mission{unplaced > 0 ? ` · ${unplaced}⚡ unplaced` : ''}
        </Button>
      </div>
    </div>
  );
}

/**
 * The face-up spread: seats still drafting + 1 cards, dealt onto the table.
 * Anything the seat on the clock can't afford is dimmed, with the reason on
 * hover.
 */
function DraftTable({
  state,
  table,
  picking,
  onTake,
}: {
  state: GameState;
  table: CardId[];
  picking: boolean;
  onTake: (cardId: CardId) => void;
}) {
  const config = useConfig();
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const onTheClock = game.nextDrafter(state);
  const seat = state.party.players.find((p) => p.id === onTheClock);
  const selected = selectedPartId && table.includes(selectedPartId) ? selectedPartId : null;
  const why = (cardId: CardId) =>
    onTheClock ? game.pickError(CONTENT, config, state, onTheClock, cardId) : 'nobody is picking';
  const selectedError = selected ? why(selected) : null;
  const round = state.setup?.round ?? 0;
  // Copies of a card are told apart by how many of it lie further along: the
  // engine takes the first copy, so this keeps every other card's key steady.
  const after = (i: number) => table.slice(i + 1).filter((id) => id === table[i]).length;

  return (
    <div className="mb-3 flex flex-col gap-2 border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="font-display text-[13px] font-bold">ON THE TABLE</div>
        <div className="font-mono text-[12px] text-putty-700">{table.length}</div>
        <div className="text-[14px] text-putty-700">
          {round === 0
            ? 'Take a cockpit — it sets your attack, your energy and how big your ship can get. Cockpits are free.'
            : 'Buy a module with energy tokens — drag it onto a cell of your ship, or click it and Take it.'}
        </div>
        {seat && round > 0 && <TokenRow count={seat.tokens} />}
        {selected && picking && (
          <div className="ml-auto">
            <Button size="sm" disabled={!!selectedError} title={selectedError ?? undefined} onClick={() => onTake(selected)}>
              Take {getPart(selected)?.name ?? selected}
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pt-1 pb-2">
        <AnimatePresence mode="popLayout">
          {table.map((cardId, i) => {
            const n = after(i);
            const error = why(cardId);
            const part = getPart(cardId);
            const payload: DragPayload | null = picking && !error ? { kind: 'table', cardId } : null;
            return (
              <motion.div
                key={`${round}:${cardId}:${n}`}
                layout
                initial={{ opacity: 0, y: -40, rotate: -10, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24, delay: i * 0.07 } }}
                exit={{ opacity: 0, scale: 0.7, y: 20, transition: { duration: 0.2 } }}
                className="flex w-[104px] flex-none flex-col gap-1"
              >
                <div className="h-[140px]" data-table-card={cardId}>
                  <ModuleTile
                    slot={{ partId: cardId }}
                    variant="scrap"
                    selected={cardId === selectedPartId}
                    hint={picking && error ? 'blocked' : null}
                    title={error ?? undefined}
                    {...dragSource(payload, () => <ModuleTile slot={{ partId: cardId }} variant="scrap" />)}
                    onClick={() => selectPart(cardId === selectedPartId ? null : cardId)}
                  />
                </div>
                {part && <CostLine part={part} config={config} />}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A row of energy tokens — what a seat has left to spend. */
function TokenRow({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1" title={`${count} energy token(s) left`}>
      <AnimatePresence initial={false}>
        {Array.from({ length: count }, (_, i) => (
          <motion.span
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0, y: -10 }}
            className="block h-3 w-3 rounded-full border border-crt-green-700 bg-crt-green-500"
          />
        ))}
      </AnimatePresence>
      <span className="ml-1 font-mono text-[11px] text-putty-700">{count}⚡</span>
    </div>
  );
}

/** What a card costs: tokens for a module; a cockpit is free, and prints its limit. */
function CostLine({ part, config }: { part: PartCard; config: GameConfig }) {
  const text =
    part.role === 'COCKPIT'
      ? config.shipSizeRule === 'slots'
        ? `FREE · ${part.slots ?? 0} SLOTS`
        : config.shipSizeRule === 'budget'
          ? `FREE · ◆${part.powerRating ?? 0} BUDGET`
          : 'FREE'
      : `COSTS ${powerCostOf(part)} TOKEN${powerCostOf(part) === 1 ? '' : 'S'}`;
  return <div className="text-center font-mono text-[10px] text-putty-700">{text}</div>;
}

/** Standing in for the prompt while the ship is rebuilt. */
function RebuildBar({ state }: { state: GameState }) {
  const closePrompt = useGameStore((s) => s.closePrompt);
  const error = useGameStore((s) => s.error);
  const missionEnd = state.prompt?.kind === 'rearrange' && state.prompt.reason === 'mission-end';
  return (
    <div className="mb-3 flex flex-none flex-wrap items-center gap-3 border-2 border-border-strong bg-crt-glass px-3 py-2.5">
      <span className="font-mono text-[10px] tracking-console text-crt-green-500">
        {missionEnd ? 'MISSION END · REBUILD' : 'REARRANGEMENT POINT'}
      </span>
      <span className="text-[15px] text-crt-white">
        Build from what you fly and your scrap deck: drag modules on and off the grid, move them around, or drop a
        cockpit from the scrap deck onto yours to install it.
      </span>
      {error && <span className="font-mono text-[11px] text-toggle-red-300">{error}</span>}
      <div className="ml-auto">
        <Button size="sm" onClick={closePrompt}>
          {missionEnd ? 'End mission' : 'Push on'}
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- grid

function BuilderStats({ player, config, drafting }: { player: PlayerState; config: GameConfig; drafting: boolean }) {
  const size = sizeReadout(player.ship, config);
  const cockpit = cockpitStats(player.ship);
  const part = cockpit.part;
  return (
    <div className="ml-auto flex flex-wrap gap-2.5 font-mono text-[12px] text-putty-700">
      <span title="The cockpit is the ship: attack, generate output, ⚡">
        COCKPIT {part?.power ?? 0}⚔ · +{part?.genPerDown ?? 0}⚡ · {cockpit.energy}/{cockpit.max}⚡
      </span>
      <span title="Ship size under the rule in play" className={size.over ? 'text-toggle-red-500' : undefined}>
        {size.text}
      </span>
      {drafting && <span>TOKENS {player.tokens}</span>}
    </div>
  );
}

/**
 * The ship's grid, editable. Around it is a ring of open cells — every cell a
 * module could be attached to. Pick a card up (or click it) and the ones it
 * may legally land on light up; drop a module on another and they swap.
 */
function GridEditor({
  player,
  canEdit,
  cockpitRound,
  energyPhase,
  armed,
  cellAccepts,
  cellDrop,
  slotAccepts,
  slotDrop,
  selectedSlot,
  onSelectSlot,
}: {
  player: PlayerState;
  canEdit: boolean;
  cockpitRound: boolean;
  energyPhase: boolean;
  armed: DragPayload | null;
  cellAccepts: (p: DragPayload, cell: Cell) => boolean;
  cellDrop: (p: DragPayload, cell: Cell) => void;
  slotAccepts: (p: DragPayload, slot: ShipSlot) => boolean;
  slotDrop: (p: DragPayload, slot: ShipSlot) => void;
  selectedSlot: SlotIndex | null;
  onSelectSlot: (slot: SlotIndex) => void;
}) {
  const ship = player.ship;
  const errors = shipEngine.layoutErrors(CONTENT, ship);
  const side = { kind: 'player' as const, id: player.id };

  return (
    <div className="flex flex-col gap-3 border-2 border-border-strong bg-surface-panel p-[18px] shadow-raised">
      {cockpitRound ? (
        <div className="py-8 text-center text-[15px] text-putty-700">
          Cockpit round — every seat takes a cockpit first. The ship is built around it.
        </div>
      ) : (
        <div className="flex justify-center overflow-auto py-2">
          <div className="flex flex-col items-center gap-1">
            <div className="font-mono text-[9px] tracking-[0.24em] text-putty-600">▲ FRONT · TOWARDS THE ENEMY</div>
            <ShipGrid
              ship={ship}
              facing="up"
              size="lg"
              renderSlot={(slot) => (
                <GridModule
                  player={player}
                  slot={slot}
                  canEdit={canEdit}
                  energyPhase={energyPhase}
                  selected={selectedSlot === slot.index}
                  accepts={(p) => slotAccepts(p, slot)}
                  onDrop={(p) => slotDrop(p, slot)}
                  onSelect={() => onSelectSlot(slot.index)}
                  fx={fxKey(side, slot.index)}
                />
              )}
              {...(canEdit
                ? {
                    renderEmpty: (cell: Cell) => (
                      <OpenCell
                        playerId={player.id}
                        cell={cell}
                        armed={armed}
                        accepts={(p) => cellAccepts(p, cell)}
                        onDrop={(p) => cellDrop(p, cell)}
                      />
                    ),
                  }
                : {})}
            />
            <div className="font-mono text-[9px] tracking-[0.24em] text-putty-600">BACK ▼</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex min-w-[260px] flex-1 flex-col gap-1.5 border border-border-strong bg-crt-glass px-3 py-2.5">
          <div className="font-mono text-[10px] tracking-console text-crt-green-500">
            LAYOUT · {errors.length === 0 ? 'LEGAL' : `${errors.length} PROBLEM(S)`}
          </div>
          <div className="text-[14px] leading-[1.35] text-crt-white">
            {errors.length > 0
              ? errors.join(' ')
              : 'Front is up. Weapons sit beside or behind the cockpit; nothing sits in front of a shield, and a shield covers everything behind it in its column. Every module touches the ship, and ⚡ only reroutes between modules that touch.'}
          </div>
        </div>

        <div className="w-[260px] border border-putty-600 bg-putty-100 px-3 py-2.5 shadow-raised">
          <div className="mb-2 font-mono text-[10px] tracking-console text-putty-700">ROLE KEY</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[14px]">
            {(Object.keys(ROLE_COLOR) as (keyof typeof ROLE_COLOR)[]).map((role) => (
              <div key={role} className="flex items-center gap-1.5">
                <span className="h-3 w-3" style={{ background: ROLE_COLOR[role] }} />
                {ROLE_LABEL[role]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A module on the grid: something to pick up, to drop onto, and — after the draft — to charge. */
function GridModule({
  player,
  slot,
  canEdit,
  energyPhase,
  selected,
  accepts,
  onDrop,
  onSelect,
  fx,
}: {
  player: PlayerState;
  slot: ShipSlot;
  canEdit: boolean;
  energyPhase: boolean;
  selected: boolean;
  accepts: (p: DragPayload) => boolean;
  onDrop: (p: DragPayload) => void;
  onSelect: () => void;
  fx: string;
}) {
  const placeEnergy = useGameStore((s) => s.placeEnergy);
  const zone = useDropZone(`slot:${player.id}:${slot.x},${slot.y}`, canEdit ? { accepts, onDrop } : null);
  const cockpit = slot.partId === player.ship.cockpitId;
  const payload: DragPayload | null = canEdit && !cockpit ? { kind: 'grid', slot: slot.index, cardId: slot.partId } : null;

  return (
    <div {...zone.props} className="h-full w-full">
      <ModuleTile
        slot={slot}
        variant="large"
        selected={selected && !zone.dragging}
        hint={zone.over ? 'over' : zone.active ? 'ok' : null}
        fxKey={fx}
        flyKey={`card:${slot.partId}`}
        title={cockpit ? 'The cockpit is the ship — it stays where it is. Install another from the scrap deck at a rebuild.' : undefined}
        {...dragSource(payload, () => <ModuleTile slot={slot} variant="large" />)}
        onClick={onSelect}
      >
        {energyPhase && (
          <div className="absolute right-0.5 bottom-4 flex gap-0.5">
            {(['-', '+'] as const).map((sign) => (
              <button
                key={sign}
                className="h-5 w-5 cursor-pointer border border-n-900 bg-cream-100 font-mono text-[12px] leading-none font-bold shadow-raised hover:bg-crt-green-300 disabled:cursor-not-allowed disabled:opacity-30"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  placeEnergy(player.id, slot.index, sign === '+' ? 1 : -1);
                }}
                title={sign === '+' ? 'Put a token on it' : 'Take a token back off'}
              >
                {sign === '+' ? '+' : '−'}
              </button>
            ))}
          </div>
        )}
      </ModuleTile>
    </div>
  );
}

/** An open cell next to the ship. Lights up when what's held may land here. */
function OpenCell({
  playerId,
  cell,
  armed,
  accepts,
  onDrop,
}: {
  playerId: PlayerId;
  cell: Cell;
  armed: DragPayload | null;
  accepts: (p: DragPayload) => boolean;
  onDrop: (p: DragPayload) => void;
}) {
  const zone = useDropZone(`cell:${playerId}:${cell.x},${cell.y}`, { accepts, onDrop });
  const clickable = !zone.dragging && !!armed && accepts(armed);
  const lit = zone.active || clickable;
  return (
    <div
      {...zone.props}
      onClick={() => clickable && armed && onDrop(armed)}
      title={clickable ? 'Put it here' : undefined}
      className={[
        'box-border h-full w-full border-2 border-dashed transition-[background-color,border-color,opacity,transform] duration-150',
        zone.over
          ? 'scale-[1.04] border-accent-primary bg-crt-green-300/60'
          : lit
            ? 'cursor-pointer border-accent-primary bg-putty-100'
            : zone.dragging || armed
              ? 'border-putty-400 opacity-30'
              : 'border-putty-400/70 opacity-60',
      ].join(' ')}
    />
  );
}

// ------------------------------------------------------------------- racks

/** Leftover tokens, waiting to go on the ship as starting ⚡. */
function EnergyPool({ player }: { player: PlayerState }) {
  const autoEnergy = useGameStore((s) => s.autoEnergy);
  const error = useGameStore((s) => s.error);
  const dragging = useDragStore((s) => s.payload?.kind === 'token');
  return (
    <div className={`border-2 bg-crt-glass p-3 shadow-raised transition-colors ${dragging ? 'border-crt-green-500' : 'border-border-strong'}`}>
      <div className="mb-1 flex items-baseline justify-between">
        <div className="font-display text-[13px] font-bold text-crt-white">STARTING ENERGY</div>
        <div className="font-mono text-[12px] text-crt-green-500">{player.tokens} LEFT</div>
      </div>
      <div className="mb-2 text-[13px] leading-[1.3] text-putty-400">
        Tokens you didn’t spend. Drag one onto a module — up to its max — or use the module’s + and −.
      </div>
      <div className="mb-2 flex min-h-6 flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {Array.from({ length: player.tokens }, (_, i) => (
            <motion.div
              key={i}
              layout
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="h-6 w-6 cursor-grab rounded-full border-2 border-crt-green-700 bg-crt-green-500 shadow-[0_0_8px_rgb(159_217_160/0.6)] active:cursor-grabbing"
              {...dragSource({ kind: 'token' }, () => (
                <div className="h-6 w-6 rounded-full border-2 border-crt-green-700 bg-crt-green-500 shadow-[0_0_12px_rgb(159_217_160/0.9)]" />
              ))}
            />
          ))}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={player.tokens === 0} onClick={() => autoEnergy(player.id)}>
          Spread them for me
        </Button>
        {error && <span className="font-mono text-[11px] text-toggle-red-300">{error}</span>}
      </div>
    </div>
  );
}

/** The hold (setup) or the scrap deck (everywhere else): cards off the ship. */
function CardRack({
  id,
  title,
  count,
  cards,
  empty,
  kind,
  canDrag,
  zone,
}: {
  id: string;
  title: string;
  count: string;
  cards: CardId[];
  empty: string;
  kind: 'hold' | 'scrap';
  canDrag: boolean;
  zone: { accepts: (p: DragPayload) => boolean; onDrop: (p: DragPayload) => void } | null;
}) {
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const drop = useDropZone(id, zone);

  return (
    <div
      {...drop.props}
      className={`border-2 bg-surface-panel p-3 shadow-raised transition-[border-color,background-color] duration-150 ${
        drop.over ? 'border-accent-primary bg-crt-green-300/30' : drop.active ? 'border-accent-primary' : 'border-border-strong'
      }`}
    >
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="font-display text-[13px] font-bold">{title}</div>
        <div className="font-mono text-[12px] text-putty-700">{count}</div>
      </div>
      {cards.length === 0 ? (
        <div className="text-[14px] text-putty-700">{drop.active ? 'Drop it here.' : empty}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: '128px' }}>
          <AnimatePresence initial={false} mode="popLayout">
            {cards.map((cardId, i) => (
              <motion.div key={`${cardId}-${i}`} layout exit={{ opacity: 0, scale: 0.8 }}>
                <ModuleTile
                  slot={{ partId: cardId }}
                  variant="scrap"
                  selected={cardId === selectedPartId}
                  flyKey={`card:${cardId}`}
                  {...dragSource(canDrag ? { kind, cardId } : null, () => <ModuleTile slot={{ partId: cardId }} variant="scrap" />)}
                  onClick={() => selectPart(cardId === selectedPartId ? null : cardId)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/** The inspector, plus whatever can be done with the selected card right now. */
function SelectedPanel({
  state,
  player,
  selectedSlot,
  onDone,
}: {
  state: GameState;
  player: PlayerState;
  selectedSlot: SlotIndex | null;
  onDone: () => void;
}) {
  const config = useConfig();
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const assemblePart = useGameStore((s) => s.assemblePart);
  const returnPart = useGameStore((s) => s.returnPart);
  const fitFromScrap = useGameStore((s) => s.fitFromScrap);
  const stowToScrap = useGameStore((s) => s.stowToScrap);
  const selected = getPart(selectedPartId);

  const drafting = state.phase === 'setup';
  const rebuilding = state.phase === 'rearrange';
  const inHold = !!selectedPartId && drafting && player.carriedParts.includes(selectedPartId);
  const inScrap = !!selectedPartId && player.scrapDeck.includes(selectedPartId);
  const gridSlot = selectedSlot !== null && player.ship.slots[selectedSlot]?.partId === selectedPartId ? selectedSlot : null;
  const isCockpitSlot = gridSlot !== null && gridSlot === shipEngine.cockpitIndex(player.ship);

  const room = !!selectedPartId && shipEngine.hasRoomFor(CONTENT, player.ship, selectedPartId, config.shipSizeRule);
  const spot = !!selectedPartId && !!shipEngine.bestCell(CONTENT, player.ship, selectedPartId);
  const fits = !!selectedPartId && selected?.role !== 'COCKPIT' && room && spot;
  const size = sizeReadout(player.ship, config);
  const whyNot = !room
    ? `No room — ${size.text.toLowerCase()}`
    : !spot
      ? 'Nowhere on the ship it may sit — check the layout rules'
      : undefined;

  const act = (fn: () => void) => {
    fn();
    selectPart(null);
    onDone();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
      <div className="mb-2.5 flex items-center gap-2 font-display text-[13px] font-bold">
        SELECTED · {selected ? selected.name.toUpperCase() : 'NONE'}
        {selected?.firstDown && <FirstDownBadge />}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selectedPartId ?? 'none'}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {selected ? (
            <div className="flex flex-col gap-2 border border-border-strong bg-crt-glass p-2.5">
              <div className="flex flex-wrap gap-3.5 font-mono text-[12px] text-crt-white">
                <span>
                  MAX <span className="text-crt-green-500">{selected.energyCapacity}⚡</span>
                </span>
                {selected.role === 'COCKPIT' ? (
                  <>
                    <span>
                      ATK <span className="text-crt-green-500">{selected.power ?? 0}⚔</span>
                    </span>
                    <span>
                      GEN <span className="text-crt-green-500">+{selected.genPerDown ?? 0}⚡</span>
                    </span>
                    {config.shipSizeRule === 'slots' && (
                      <span>
                        SLOTS <span className="text-crt-green-500">{selected.slots ?? 0}</span>
                      </span>
                    )}
                    {config.shipSizeRule === 'budget' && (
                      <span>
                        RATING <span className="text-crt-green-500">◆{selected.powerRating ?? 0}</span>
                      </span>
                    )}
                  </>
                ) : (
                  <span>
                    COST <span className="text-crt-green-500">{powerCostOf(selected)} TOKENS</span>
                  </span>
                )}
                <span>
                  TIER <span style={{ color: 'var(--rarity-3)' }}>{selected.rarity}</span>
                </span>
              </div>
              {printedLines(selected).map((line, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className="mt-0.5 flex-none font-mono text-[10px] tracking-[0.08em]"
                    style={{ color: TIMING_CHIP[line.timing].color }}
                  >
                    {TIMING_CHIP[line.timing].label}
                  </span>
                  <span className="text-[15px] leading-[1.35] text-crt-white">{line.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[14px] text-putty-700">
              Drag a card onto a lit cell of the ship, or click it and then click the cell it goes in.
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-2.5 flex flex-col gap-2">
        {selectedPartId && inHold && (
          <Button size="sm" disabled={!fits} title={whyNot} onClick={() => act(() => assemblePart(player.id, selectedPartId, null))}>
            Fit where it fits best
          </Button>
        )}
        {selectedPartId && inScrap && rebuilding && (
          <Button
            size="sm"
            disabled={selected?.role !== 'COCKPIT' && !fits}
            onClick={() => act(() => fitFromScrap(player.id, selectedPartId, null))}
            title={selected?.role === 'COCKPIT' ? 'The old cockpit goes into the scrap deck in its place' : whyNot}
          >
            {selected?.role === 'COCKPIT' ? 'Install as cockpit' : 'Fit where it fits best'}
          </Button>
        )}
        {gridSlot !== null && !isCockpitSlot && drafting && (
          <Button size="sm" variant="secondary" onClick={() => act(() => returnPart(player.id, gridSlot))}>
            Pull back into the hold
          </Button>
        )}
        {gridSlot !== null && !isCockpitSlot && rebuilding && (
          <Button size="sm" variant="secondary" onClick={() => act(() => stowToScrap(player.id, gridSlot))}>
            Stow in the scrap deck
          </Button>
        )}
      </div>
    </div>
  );
}
