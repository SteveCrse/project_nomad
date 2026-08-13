import { useEffect, useState } from 'react';
import type { CardId, GameState, PlayerId, PlayerState, SlotIndex } from '@engine/types';
import { game, renderText, ship as shipEngine } from '@engine';
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
 * one card comes off the Parts deck at a time, and the mission doesn't start
 * until the table says the ships are done.
 */

/** What's currently in hand, whether by drag or by click-to-place. */
type Held =
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

  const [drag, setDrag] = useState<Held | null>(null);

  const drafting = state?.phase === 'setup';
  const onTheClock = state && drafting ? game.nextDrafter(state) : null;
  const lastDrawn = drafting ? (state?.setup?.lastDrawn ?? null) : null;
  // The view sits with whoever drew last so the card is seen landing in their
  // hold; before the first draw there's nobody, so open on the seat up next.
  const follow = drafting ? (state?.setup?.lastDrawnBy ?? onTheClock) : null;

  useEffect(() => {
    if (follow) setBuilderPlayer(follow);
  }, [follow, setBuilderPlayer]);

  // Whatever just came off the deck lands in the inspector — that reveal is
  // the point of drawing one card at a time.
  useEffect(() => {
    if (lastDrawn) selectPart(lastDrawn);
  }, [lastDrawn, selectPart]);

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
  const clicked: Held | null = !selectedPartId
    ? null
    : drafting && player.carriedParts.includes(selectedPartId)
      ? { kind: 'hold', cardId: selectedPartId }
      : player.scrapDeck.includes(selectedPartId)
        ? { kind: 'scrap', cardId: selectedPartId }
        : null;
  const held = drag ?? clicked;

  const canLandOn = (index: SlotIndex): boolean => {
    if (!held || !canEdit) return false;
    const slot = player.ship.slots[index];
    if (!slot || slot.partId === player.ship.cockpitId) return false;
    if (held.kind === 'grid') {
      if (held.slot === index) return false;
      // The module being moved can't be what anchors its own destination.
      return !!slot.partId || shipEngine.canAttachAt(player.ship, index, held.slot);
    }
    return !!slot.partId || shipEngine.canAttachAt(player.ship, index);
  };

  const landOn = (index: SlotIndex) => {
    if (!held || !canLandOn(index)) return;
    if (held.kind === 'grid') moveModule(player.id, held.slot, index);
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
                {drafting ? ` · ${game.drawsLeftFor(state, p.id)}▾` : ''}
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

/**
 * The draft's own control strip: whose draw it is, what's left, and the one
 * button that ends setup.
 */
function DraftBar({ state, onTheClock }: { state: GameState; onTheClock: PlayerId | null }) {
  const drawStartingPart = useGameStore((s) => s.drawStartingPart);
  const drawAllStartingParts = useGameStore((s) => s.drawAllStartingParts);
  const startMission = useGameStore((s) => s.startMission);
  const config = useConfig();

  const seat = state.party.players.find((p) => p.id === onTheClock);
  const left = onTheClock ? game.drawsLeftFor(state, onTheClock) : 0;
  const drawn = getPart(state.setup?.lastDrawn ?? null);
  const drawer = state.party.players.find((p) => p.id === state.setup?.lastDrawnBy);

  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-3 border-2 border-border-strong bg-crt-glass px-3 py-2.5">
      <span className="font-mono text-[10px] tracking-console text-crt-green-500">
        SETUP · {seat ? 'DRAFT' : 'ASSEMBLE'}
      </span>

      {seat ? (
        <>
          <span className="text-[15px] text-crt-white">
            {drawn && drawer ? (
              <>
                <span className="font-display font-bold">{drawer.label}</span> drew {drawn.name}.{' '}
              </>
            ) : (
              <>Parts deck is shuffled. {config.startingPartsDraws} draws each.{' '}</>
            )}
            <span className="text-putty-400">
              {seat.label} is up — {left} left.
            </span>
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => drawStartingPart()}>
              Draw for {seat.label}
            </Button>
            <Button size="sm" variant="secondary" onClick={drawAllStartingParts}>
              Draw the rest
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="text-[15px] text-crt-white">
            Draws are spent. Drag the hold onto the grid — parts attach next to what's already
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
  const filled = player.ship.slots.filter((s) => s.partId).length;
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
      <span>
        SLOTS {filled}/{player.ship.slots.length}
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

  return (
    <div className="flex flex-col gap-3.5 border-2 border-border-strong bg-surface-panel p-[18px] shadow-raised">
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${player.ship.gridCols}, minmax(0, 1fr))`,
          gridAutoRows: '104px',
        }}
      >
        {player.ship.slots.map((slot) => {
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
                held && !ok && !isCockpit
                  ? 'Parts have to attach next to something already fitted'
                  : undefined
              }
              draggable={canEdit && !!slot.partId && !isCockpit}
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
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 border-2 border-n-900" />
              COCKPIT
            </div>
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
        <div className="grid grid-cols-2 gap-2">
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
      <div className="grid grid-cols-2 gap-2">
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
  const noRoom = shipEngine.firstAttachableSlot(player.ship) < 0;

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
            {selected.partType === 'cockpit' ? (
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
                  COST <span className="text-crt-green-500">{selected.energyCost ?? '—'}⚡</span>
                </span>
                <span>
                  POOL <span className="text-crt-green-500">{selected.energyCapacity ?? '—'}</span>
                </span>
              </>
            )}
            <span>
              TIER <span style={{ color: 'var(--rarity-3)' }}>{selected.rarity}</span>
            </span>
          </div>
          <div className="text-[15px] leading-[1.35] text-crt-white">{renderText(selected)}</div>
          {selected.oncePerSet && (
            <div className="font-mono text-[11px] text-amber-300">ONE SHOT PER SET OF DOWNS</div>
          )}
          {selected.status && (
            <div className="text-[13px] text-amber-300">{renderText(selected, selected.status)}</div>
          )}
        </div>
      ) : (
        <div className="text-[14px] text-putty-700">
          Drag a part onto the grid, or click one and then click the position it goes in.
        </div>
      )}

      {selectedPartId && (inHold || inScrap) && canEdit && (
        <div className="mt-2.5 flex flex-col gap-2">
          {selected?.partType === 'cockpit' && inHold ? (
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
              title={noRoom ? 'No free position touches the ship' : undefined}
              onClick={() =>
                act(() =>
                  inHold
                    ? assemblePart(player.id, selectedPartId, -1)
                    : rearrange(player.id, selectedPartId, -1),
                )
              }
            >
              Attach at the first free position
            </Button>
          )}
        </div>
      )}

      {onGrid && (
        <div className="mt-2.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => act(() => returnPart(player.id, onGrid.index))}
          >
            Pull back into the hold
          </Button>
        </div>
      )}
    </div>
  );
}
