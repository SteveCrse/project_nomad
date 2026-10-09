import type { Cell, PlayerId, PlayerState, ShipSlot, SlotIndex } from '@engine/types';
import { ship as shipEngine } from '@engine';
import { ModuleTile } from '@/components/game/ModuleTile';
import { ShipGrid } from '@/components/game/ShipGrid';
import { dragSource, useDropZone, type DragPayload } from '@/components/fx/drag';
import { ROLE_COLOR, ROLE_LABEL } from '@/lib/palette';
import { fxKey } from '@/lib/combatView';
import { CONTENT } from '@data';
import { useGameStore } from '@/store/gameStore';

/**
 * The ship's grid, editable. Around it is a ring of open cells — every cell a
 * module could be attached to. Pick a card up (or click it) and the ones it
 * may legally land on light up; drop a module on another and they swap.
 */
export function GridEditor({
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
