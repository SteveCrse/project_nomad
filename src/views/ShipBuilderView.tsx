import { useEffect, useState } from 'react';
import type { CardId, GameState, PlayerId, PlayerState, SlotIndex } from '@engine/types';
import { cardCost, game, printedLines, ship as shipEngine } from '@engine';
import { Button } from '@/components/ds';
import { ModuleTile } from '@/components/game/ModuleTile';
import { ROLE_COLOR, ROLE_LABEL } from '@/lib/palette';
import { adjacencyFor, scrapCapacityFor } from '@/lib/combatView';
import { CONTENT, getPart } from '@data';
import { useConfig } from '@/store/configStore';
import { useGame, useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Ship Builder: where a ship gets assembled, both at the start of a run and at
 * every rearrangement point after it.
 *
 * The grid is laid out by hand — drag a part off the hold onto a position,
 * drag modules around to reorder them — because adjacency pays. A chain feeds
 * itself, and ⚡ only ever moves between neighbours, so where a generator sits
 * relative to a gun is the whole decision.
 *
 * During setup the grid is fed by the draft hold rather than the Scrap Deck:
 * the whole pool is dealt face up at run start, the seats take turns picking
 * off it, and the mission doesn't start until the table says the ships are done.
 */

/** What's currently in hand, whether by drag or by click-to-place. */
type Held =
  | { kind: 'pool'; cardId: CardId }
  | { kind: 'hold'; cardId: CardId }
  | { kind: 'scrap'; cardId: CardId }
  | { kind: 'grid'; slot: SlotIndex; cardId: CardId };

/**
 * What's being dragged lives in React state, not the drag payload — `dragover`
 * can't read `dataTransfer`, and the drop rules have to be answered while the
 * part is still in the air. The payload is set anyway because some browsers
 * won't start a drag without one.
 */
function startDrag(e: React.DragEvent) {
  e.dataTransfer.setData('text/plain', '');
  e.dataTransfer.effectAllowed = 'move';
}

export function ShipBuilderView() {
  const state = useGame();
  const builderPlayerId = useUiStore((s) => s.builderPlayerId);
  const setBuilderPlayer = useUiStore((s) => s.setBuilderPlayer);
  const selectPart = useUiStore((s) => s.selectPart);
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const assemblePart = useGameStore((s) => s.assemblePart);
  const returnPart = useGameStore((s) => s.returnPart);
  const moveModule = useGameStore((s) => s.moveModule);
  const rearrange = useGameStore((s) => s.rearrange);
  const draftCard = useGameStore((s) => s.draftCard);

  const [drag, setDrag] = useState<Held | null>(null);

  const drafting = state?.phase === 'setup';
  const onTheClock = state && drafting ? game.nextDrafter(state) : null;
  const pool = drafting ? (state?.setup?.pool ?? []) : [];
  // The view sits with the seat on the clock, so the pool is always picked into
  // the hold you're looking at; once the table is empty it stays with whoever
  // took the last card and everyone assembles.
  const follow = drafting ? (onTheClock ?? state?.setup?.lastPickedBy ?? null) : null;

  useEffect(() => {
    if (follow) setBuilderPlayer(follow);
  }, [follow, setBuilderPlayer]);

  if (!state) {
    return <div className="p-4 text-[15px] text-putty-700">Start a run to build a ship.</div>;
  }

  const player =
    state.party.players.find((p) => p.id === builderPlayerId) ?? state.party.players[0];
  if (!player) return null;

  const canEdit =
    drafting ||
    state.phase === 'rearrange' ||
    state.phase === 'map' ||
    state.phase === 'victory';

  // Clicking a card in a pool arms it the same way dragging it does, so both
  // routes to a position behave identically.
  const picking = drafting && player.id === onTheClock;
  const clicked: Held | null = !selectedPartId
    ? null
    : picking && pool.includes(selectedPartId)
      ? { kind: 'pool', cardId: selectedPartId }
      : drafting && player.carriedParts.includes(selectedPartId)
        ? { kind: 'hold', cardId: selectedPartId }
        : player.scrapDeck.includes(selectedPartId)
          ? { kind: 'scrap', cardId: selectedPartId }
          : null;
  const held = drag ?? clicked;

  const canLandOn = (index: SlotIndex): boolean => {
    if (!held || !canEdit) return false;
    // A card is only ever taken off the table by the seat on the clock, even
    // when it's dropped straight onto a position.
    if (held.kind === 'pool' && !picking) return false;
    const slot = player.ship.slots[index];
    if (!slot) return false;
    // Moving something already on the grid — the cockpit included. Landing on
    // an occupied position swaps; landing on an empty one has to touch the
    // hull and leave nothing adrift.
    if (held.kind === 'grid') return shipEngine.canMoveTo(player.ship, held.slot, index);
    // A part coming off a rack can't take the cockpit's position, and only
    // fits if the cockpit still has a slot spare.
    if (slot.partId) return slot.partId !== player.ship.cockpitId;
    return (
      shipEngine.canAttachAt(player.ship, index) &&
      shipEngine.hasFreeCapacity(CONTENT, player.ship)
    );
  };

  const landOn = (index: SlotIndex) => {
    if (!held || !canLandOn(index)) return;
    if (held.kind === 'grid') moveModule(player.id, held.slot, index);
    else if (held.kind === 'pool') draftCard(held.cardId, index);
    else if (held.kind === 'hold') assemblePart(player.id, held.cardId, index);
    else rearrange(player.id, held.cardId, index);
    setDrag(null);
    selectPart(null);
  };

  /** Dropping a fitted module back onto the hold pulls it off the ship. */
  const landInHold = () => {
    if (drag?.kind === 'grid' && drafting) returnPart(player.id, drag.slot);
    setDrag(null);
  };

  const onSlotClick = (index: SlotIndex, partId: CardId | null) => {
    if (held && canLandOn(index)) {
      landOn(index);
      return;
    }
    selectPart(partId);
  };

  return (
    <div className="flex min-h-0 flex-1 gap-5" onDragEnd={() => setDrag(null)}>
      <div className="flex min-w-0 flex-1 flex-col">
        {drafting && <DraftBar state={state} onTheClock={onTheClock} />}
        {drafting && pool.length > 0 && (
          <DraftPool
            pool={pool}
            picking={picking}
            onPickUp={setDrag}
            onTake={(cardId) => {
              draftCard(cardId);
              setDrag(null);
              selectPart(null);
            }}
          />
        )}
        {state.prompt?.kind === 'rearrange' && <RearrangeBar reason={state.prompt.reason} />}

        <div className="mb-3.5 flex items-baseline gap-3">
          <div className="font-display text-[20px] font-bold">
            {drafting ? 'ASSEMBLY' : 'SHIP BUILDER'}
          </div>
          <div className="flex gap-1.5">
            {state.party.players.map((p) => (
              <button
                key={p.id}
                onClick={() => setBuilderPlayer(p.id)}
                className={[
                  'cursor-pointer border px-2.5 py-[5px] font-mono text-[11px]',
                  p.id === player.id
                    ? 'border-n-900 bg-n-900 text-cream-100'
                    : 'border-putty-500 bg-putty-100 text-putty-700 hover:border-n-900',
                ].join(' ')}
              >
                {p.label}
                {drafting
                  ? ` · ${draftedBy(state, p)}${p.id === onTheClock ? ' ◂ PICKS' : ''}`
                  : ''}
              </button>
            ))}
          </div>
          <BuilderStats player={player} />
        </div>

        <Grid
          player={player}
          canEdit={canEdit}
          held={held}
          dragging={!!drag}
          canLandOn={canLandOn}
          onSlotClick={onSlotClick}
          onPickUp={setDrag}
          onLand={landOn}
        />
      </div>

      <div className="flex w-[300px] flex-none flex-col gap-3.5">
        {drafting ? (
          <HoldPanel
            player={player}
            onPickUp={setDrag}
            onDropIn={landInHold}
            accepting={drag?.kind === 'grid'}
          />
        ) : (
          <ScrapPanel state={state} player={player} onPickUp={setDrag} />
        )}
        <SelectedPanel state={state} player={player} canEdit={canEdit} />
      </div>
    </div>
  );
}

/** Cards this seat has taken off the table, wherever they've ended up. */
function draftedBy(state: GameState, player: PlayerState): number {
  const anchored = state.setup?.anchored.includes(player.id) ? 1 : 0;
  return player.carriedParts.length + shipEngine.moduleCount(player.ship) + anchored;
}

/**
 * The draft's own control strip: whose pick it is, what's still on the table,
 * and the one button that ends setup.
 *
 * That button is live from the first pick onwards — the party can call the
 * draft whenever it likes and leave the rest of the spread on the table.
 */
function DraftBar({ state, onTheClock }: { state: GameState; onTheClock: PlayerId | null }) {
  const draftAll = useGameStore((s) => s.draftAll);
  const startMission = useGameStore((s) => s.startMission);
  const config = useConfig();

  const seat = state.party.players.find((p) => p.id === onTheClock);
  const left = state.setup?.pool.length ?? 0;
  const picked = getPart(state.setup?.lastPicked ?? null);
  const picker = state.party.players.find((p) => p.id === state.setup?.lastPickedBy);

  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-3 border-2 border-border-strong bg-crt-glass px-3 py-2.5">
      <span className="font-mono text-[10px] tracking-console text-crt-green-500">
        SETUP · {seat ? 'DRAFT' : 'ASSEMBLE'}
      </span>

      {seat ? (
        <>
          <span className="text-[15px] text-crt-white">
            {picked && picker ? (
              <>
                <span className="font-display font-bold">{picker.label}</span> took {picked.name}.{' '}
              </>
            ) : (
              <>
                {left} part(s) dealt face up — {config.startingPartsDraws} per seat.{' '}
              </>
            )}
            <span className="text-putty-400">
              {seat.label} picks — {left} still on the table.
            </span>
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="secondary" onClick={draftAll}>
              Draft the rest
            </Button>
            <Button size="sm" onClick={startMission} title="Leave the rest of the spread behind">
              Start the mission
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="text-[15px] text-crt-white">
            The table is empty. Drag the hold onto the grid — parts attach next to what's already
            fitted — then roll out.
          </span>
          <div className="ml-auto">
            <Button size="sm" onClick={startMission}>
              Start the mission
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The spread: every card dealt at run start, face up, until it's taken.
 *
 * Any of them is a legal pick for the seat on the clock — the whole point of
 * dealing up front is that a seat can read the table before committing. Click
 * to inspect and take, or drag a card straight onto a grid position.
 */
function DraftPool({
  pool,
  picking,
  onPickUp,
  onTake,
}: {
  pool: CardId[];
  picking: boolean;
  onPickUp: (held: Held) => void;
  onTake: (cardId: CardId) => void;
}) {
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const selected = selectedPartId && pool.includes(selectedPartId) ? selectedPartId : null;

  return (
    <div className="mb-3.5 flex flex-none flex-col gap-2 border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
      <div className="flex items-baseline gap-3">
        <div className="font-display text-[13px] font-bold">ON THE TABLE</div>
        <div className="font-mono text-[12px] text-putty-700">{pool.length}</div>
        <div className="text-[14px] text-putty-700">
          {picking
            ? 'Take any card — click one to read it, or drag it straight onto the grid.'
            : 'Waiting on the seat that holds the pick.'}
        </div>
        {selected && picking && (
          <div className="ml-auto">
            <Button size="sm" onClick={() => onTake(selected)}>
              Take {getPart(selected)?.name ?? selected}
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {pool.map((cardId, i) => (
          // The tile fills its box, so the strip sets the card size itself.
          <div key={`${cardId}-${i}`} className="h-[128px] w-[96px] flex-none">
            <ModuleTile
              slot={{ partId: cardId }}
              variant="scrap"
              selected={cardId === selectedPartId}
              draggable={picking}
              onDragStart={(e) => {
                if (!picking) return;
                startDrag(e);
                onPickUp({ kind: 'pool', cardId });
              }}
              onClick={() => selectPart(cardId === selectedPartId ? null : cardId)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Standing in for the prompt while the grid is being laid out. */
function RearrangeBar({ reason }: { reason: string }) {
  const closePrompt = useGameStore((s) => s.closePrompt);
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-3 border-2 border-border-strong bg-crt-glass px-3 py-2.5">
      <span className="font-mono text-[10px] tracking-console text-crt-green-500">
        REARRANGEMENT POINT
      </span>
      <span className="text-[15px] text-crt-white">
        Slot hoarded modules and move what's already fitted. Modules swapped out go back into the
        Scrap Deck.
      </span>
      <div className="ml-auto">
        <Button size="sm" onClick={closePrompt}>
          {reason === 'mission-end' ? 'End mission' : 'Push on'}
        </Button>
      </div>
    </div>
  );
}

function BuilderStats({ player }: { player: PlayerState }) {
  const fitted = shipEngine.moduleCount(player.ship);
  const capacity = shipEngine.moduleCapacity(CONTENT, player.ship);
  const stored = player.ship.slots.reduce((sum, s) => sum + s.energy, 0);
  const cockpitCharge = shipEngine.cockpitCharge(CONTENT, player.ship);
  const cockpitCap = shipEngine.cockpitCapacity(CONTENT, player.ship);
  return (
    <div className="ml-auto flex gap-2.5 font-mono text-[12px] text-putty-700">
      <span title="The cockpit's own shield — the last charge before the ship is wrecked">
        COCKPIT {cockpitCharge}/{cockpitCap}⚡ · {shipEngine.cockpitPower(CONTENT, player.ship)}⚔
      </span>
      <span title="Every charged absorber, cockpit included">
        SHIELDS {shipEngine.shieldPool(CONTENT, player.ship)}
      </span>
      <span title="Modules fitted against the cockpit's slot count — the cockpit itself doesn't take one">
        SLOTS {fitted}/{capacity}
      </span>
      <span>⚡ {stored} STORED</span>
    </div>
  );
}

function Grid({
  player,
  canEdit,
  held,
  dragging,
  canLandOn,
  onSlotClick,
  onPickUp,
  onLand,
}: {
  player: PlayerState;
  canEdit: boolean;
  held: Held | null;
  dragging: boolean;
  canLandOn: (index: SlotIndex) => boolean;
  onSlotClick: (index: SlotIndex, partId: CardId | null) => void;
  onPickUp: (held: Held) => void;
  onLand: (index: SlotIndex) => void;
}) {
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const bonuses = adjacencyFor(player);
  const full = !shipEngine.hasFreeCapacity(CONTENT, player.ship);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 border-2 border-border-strong bg-surface-panel p-[18px] shadow-raised">
      {/*
       * The grid is the ship's own shape: every part fitted, plus one open
       * position on each of its free sides and nothing beyond that. Cells
       * outside that ring stay in the array (the geometry is index
       * arithmetic) but print as empty space, so what's on screen is the hull
       * and where it can grow.
       */}
      <div className="min-h-0 flex-1 overflow-auto">
      <div
        className="grid w-fit gap-2"
        style={{
          gridTemplateColumns: `repeat(${player.ship.gridCols}, 96px)`,
          gridAutoRows: '134px',
        }}
      >
        {player.ship.slots.map((slot) => {
          const open = shipEngine.canAttachAt(player.ship, slot.index);
          if (!slot.partId && !open) return <div key={slot.index} aria-hidden />;

          const isCockpit = slot.partId === player.ship.cockpitId;
          const ok = canLandOn(slot.index);
          return (
            <ModuleTile
              key={slot.index}
              slot={slot}
              variant="large"
              selected={!!slot.partId && slot.partId === selectedPartId && !held}
              hint={held ? (ok ? 'ok' : dragging ? 'blocked' : null) : null}
              title={
                held && !ok
                  ? isCockpit && held.kind !== 'grid'
                    ? 'The cockpit holds this position — drag the cockpit itself to move it'
                    : full && !slot.partId
                      ? "Every one of the cockpit's slots is filled — swap onto a module instead"
                      : 'Parts attach next to what is already fitted, and the ship stays in one piece'
                  : undefined
              }
              draggable={canEdit && !!slot.partId}
              onDragStart={(e) => {
                if (!slot.partId) return;
                startDrag(e);
                onPickUp({ kind: 'grid', slot: slot.index, cardId: slot.partId });
              }}
              onDragOver={(e) => {
                if (ok) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                onLand(slot.index);
              }}
              onClick={() => onSlotClick(slot.index, slot.partId)}
            />
          );
        })}
      </div>
      </div>

      <div className="flex items-stretch gap-3">
        <div className="flex flex-1 flex-col gap-1.5 border border-border-strong bg-crt-glass px-3 py-2.5">
          <div className="font-mono text-[10px] tracking-console text-crt-green-500">
            ADJACENCY BONUS · {bonuses.length > 0 ? 'ACTIVE' : 'NONE'}
          </div>
          <div className="text-[15px] leading-[1.35] text-crt-white">
            {bonuses.length > 0
              ? bonuses.map((b) => b.description).join(' ')
              : 'No unbroken GEN→RDS→WPN chain on this grid. Put a redistributor between a generator and a weapon.'}
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

/** Parts drafted off the Parts deck and not yet fitted. */
function HoldPanel({
  player,
  onPickUp,
  onDropIn,
  accepting,
}: {
  player: PlayerState;
  onPickUp: (held: Held) => void;
  onDropIn: () => void;
  accepting: boolean;
}) {
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);

  return (
    <div
      onDragOver={(e) => {
        if (accepting) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropIn();
      }}
      className={`border-2 bg-surface-panel p-3 shadow-raised ${
        accepting ? 'border-accent-primary' : 'border-border-strong'
      }`}
    >
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="font-display text-[13px] font-bold">DRAFT HOLD</div>
        <div className="font-mono text-[12px] text-putty-700">{player.carriedParts.length}</div>
      </div>

      {player.carriedParts.length === 0 ? (
        <div className="text-[14px] text-putty-700">
          {accepting
            ? 'Drop a module here to pull it off the ship.'
            : 'Nothing in the hold. Draw a part, or every part drawn is already fitted.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: '128px' }}>
          {player.carriedParts.map((cardId, i) => (
            <ModuleTile
              key={`${cardId}-${i}`}
              slot={{ partId: cardId }}
              variant="scrap"
              selected={cardId === selectedPartId}
              draggable
              onDragStart={(e) => {
                startDrag(e);
                onPickUp({ kind: 'hold', cardId });
              }}
              onClick={() => selectPart(cardId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScrapPanel({
  state,
  player,
  onPickUp,
}: {
  state: GameState;
  player: PlayerState;
  onPickUp: (held: Held) => void;
}) {
  const config = useConfig();
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const capacity = scrapCapacityFor(player, config);
  const canEdit = state.phase === 'rearrange' || state.phase === 'map' || state.phase === 'victory';

  return (
    <div className="border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="font-display text-[13px] font-bold">SCRAP DECK</div>
        <div className="font-mono text-[12px] text-putty-700">
          {player.scrapDeck.length}/{capacity}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: '128px' }}>
        {Array.from({ length: capacity }, (_, i) => {
          const cardId = player.scrapDeck[i] ?? null;
          return (
            <ModuleTile
              key={i}
              slot={{ partId: cardId }}
              variant="scrap"
              selected={!!cardId && cardId === selectedPartId}
              draggable={canEdit && !!cardId}
              onDragStart={(e) => {
                if (!cardId) return;
                startDrag(e);
                onPickUp({ kind: 'scrap', cardId });
              }}
              onClick={() => selectPart(cardId)}
            />
          );
        })}
      </div>
      {!canEdit && player.scrapDeck.length > 0 && (
        <div className="pt-2 text-[13px] text-putty-700">
          Hoarded modules go in at a rearrangement point.
        </div>
      )}
    </div>
  );
}

/** The inspector, plus whatever can be done with the selected card right now. */
function SelectedPanel({
  state,
  player,
  canEdit,
}: {
  state: GameState;
  player: PlayerState;
  canEdit: boolean;
}) {
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const assemblePart = useGameStore((s) => s.assemblePart);
  const installCockpit = useGameStore((s) => s.installCockpit);
  const returnPart = useGameStore((s) => s.returnPart);
  const rearrange = useGameStore((s) => s.rearrange);
  const selected = getPart(selectedPartId);

  const drafting = state.phase === 'setup';
  const inHold = !!selectedPartId && drafting && player.carriedParts.includes(selectedPartId);
  const inScrap = !!selectedPartId && player.scrapDeck.includes(selectedPartId);
  const onGrid =
    drafting && !!selectedPartId && selectedPartId !== player.ship.cockpitId
      ? player.ship.slots.find((s) => s.partId === selectedPartId)
      : undefined;
  const noRoom =
    shipEngine.bestAttachSlot(player.ship) < 0 ||
    !shipEngine.hasFreeCapacity(CONTENT, player.ship);
  const stuck = !!onGrid && !shipEngine.canDetach(player.ship, onGrid.index);

  const act = (fn: () => void) => {
    fn();
    selectPart(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
      <div className="mb-2.5 font-display text-[13px] font-bold">
        SELECTED · {selected ? selected.name.toUpperCase() : 'NONE'}
      </div>

      {selected ? (
        <div className="flex flex-col gap-2 border border-border-strong bg-crt-glass p-2.5">
          <div className="flex flex-wrap gap-3.5 font-mono text-[12px] text-crt-white">
            {selected.role === 'COCKPIT' ? (
              <>
                <span>
                  SLOTS <span className="text-crt-green-500">{selected.slots ?? 0}</span>
                </span>
                <span>
                  ATTACK <span className="text-crt-green-500">{selected.power ?? 0}⚔</span>
                </span>
                <span>
                  SHIELD <span className="text-crt-green-500">{selected.energyCapacity ?? 0}⚡</span>
                </span>
                <span>
                  GEN <span className="text-crt-green-500">+{selected.genPerDown ?? 0}⚡/DOWN</span>
                </span>
              </>
            ) : (
              <>
                <span>
                  COST <span className="text-crt-green-500">{cardCost(selected)}⚡</span>
                </span>
                <span>
                  MAX <span className="text-crt-green-500">{selected.energyCapacity ?? '—'}⚡</span>
                </span>
              </>
            )}
            <span>
              TIER <span style={{ color: 'var(--rarity-3)' }}>{selected.rarity}</span>
            </span>
          </div>
          {printedLines(selected).map((line, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex-none font-mono text-[10px] tracking-[0.08em] text-putty-600">
                {line.timing === 'active' ? 'ACT' : 'PAS'}
              </span>
              <span className="text-[15px] leading-[1.35] text-crt-white">{line.text}</span>
            </div>
          ))}
          {selected.oncePerSet && (
            <div className="font-mono text-[11px] text-amber-300">ONE SHOT PER SET OF DOWNS</div>
          )}
        </div>
      ) : (
        <div className="text-[14px] text-putty-700">
          Drag a part onto the grid, or click one and then click the position it goes in.
        </div>
      )}

      {selectedPartId && (inHold || inScrap) && canEdit && (
        <div className="mt-2.5 flex flex-col gap-2">
          {selected?.role === 'COCKPIT' && inHold ? (
            <Button
              size="sm"
              onClick={() => act(() => installCockpit(player.id, selectedPartId))}
              title="Re-anchor the ship on this cockpit"
            >
              Install as cockpit · {selected.slots ?? 0} slots
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={noRoom}
              title={
                noRoom
                  ? shipEngine.hasFreeCapacity(CONTENT, player.ship)
                    ? 'No free position touches the ship'
                    : "Every one of the cockpit's slots is filled"
                  : undefined
              }
              onClick={() =>
                act(() =>
                  inHold
                    ? assemblePart(player.id, selectedPartId, -1)
                    : rearrange(player.id, selectedPartId, -1),
                )
              }
            >
              Attach where it fits
            </Button>
          )}
        </div>
      )}

      {onGrid && (
        <div className="mt-2.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={stuck}
            title={
              stuck
                ? 'Taking this out would leave the modules hanging off it adrift — move them first'
                : undefined
            }
            onClick={() => act(() => returnPart(player.id, onGrid.index))}
          >
            Pull back into the hold
          </Button>
        </div>
      )}
    </div>
  );
}
