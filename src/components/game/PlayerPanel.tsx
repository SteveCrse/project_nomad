import { motion } from 'motion/react';
import type { PlayerState, Ship, ShipSlot, SlotIndex } from '@engine/types';
import { DownsTracker } from '@/components/ds';
import { dragSource, useDropZone, type DragPayload } from '@/components/fx/drag';
import { ShipGrid } from './ShipGrid';
import { ModuleTile } from './ModuleTile';
import { shieldColor } from '@/lib/palette';
import { cockpitStats, fxKey, scrapCapacityFor, sizeReadout } from '@/lib/combatView';
import { useConfig } from '@/store/configStore';

/** How the seat's own ship takes part in what it's doing this down. */
export interface PanelControls {
  /** Modules that can be picked for the action in hand. */
  armed: SlotIndex[];
  /** Modules something can go to — a reroute's destinations. */
  open: SlotIndex[];
  selected: SlotIndex | null;
  /** Planned ⚡ change per module, while a reroute is being built. */
  deltas: Record<number, number>;
  onSlotClick: (slot: SlotIndex) => void;
  /** Dragging ⚡ between modules, while rerouting. */
  drag: {
    source: (slot: SlotIndex) => boolean;
    accepts: (from: SlotIndex, to: SlotIndex) => boolean;
    onDrop: (from: SlotIndex, to: SlotIndex) => void;
  } | null;
}

interface PlayerPanelProps {
  player: PlayerState;
  /** This seat holds the turn. */
  active?: boolean;
  /** Someone holds the turn and it isn't this seat — knocked back. */
  waiting?: boolean;
  /** Downs spent this turn, while it holds the turn. */
  downsUsed?: number;
  /** The enemy is aiming at this seat. */
  aggro?: boolean;
  /** The ship to draw — a reroute in the works shows its plan. */
  ship?: Ship;
  controls?: PanelControls;
}

/**
 * One seat: the cockpit gauge (the ship dies with it), downs, scrap, and the
 * ship on its grid, front up — facing the enemy across the table. The seat
 * the enemy is aiming at — the aggressor — is flagged; seats waiting for
 * their turn are greyed back so the one acting stands out.
 */
export function PlayerPanel({ player, active, waiting, downsUsed, aggro, ship, controls }: PlayerPanelProps) {
  const config = useConfig();
  const shown = ship ?? player.ship;
  const cockpit = cockpitStats(player.ship);
  const pct = cockpit.max > 0 ? Math.round((cockpit.energy / cockpit.max) * 100) : 0;
  const size = sizeReadout(player.ship, config);
  const side = { kind: 'player' as const, id: player.id };

  return (
    <motion.div
      data-seat={player.id}
      layout="position"
      animate={{
        opacity: waiting ? 0.5 : player.destroyed ? 0.45 : 1,
        filter: waiting ? 'grayscale(0.85)' : 'grayscale(0)',
        y: active ? -4 : 0,
      }}
      transition={{ duration: 0.3 }}
      className={`box-border flex flex-none flex-col border-2 bg-surface-panel shadow-raised ${
        active ? 'border-accent-primary shadow-[0_0_0_3px_rgb(159_217_160/0.35),0_2px_0_rgb(0_0_0/0.3)]' : 'border-border-strong'
      }`}
    >
      <div className="h-1.5" style={{ background: player.accent }} />
      <div className="flex flex-col gap-1.5 px-2.5 pt-2 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-display text-[15px] font-bold">{player.label}</div>
          <div className="text-[14px] tracking-[0.02em] text-putty-700">{player.ship.name}</div>
          {player.destroyed && (
            <span className="font-mono text-[10px] tracking-[0.1em] text-toggle-red-500">COCKPIT DESTROYED</span>
          )}
          {active && !player.destroyed && (
            <span className="bg-accent-primary px-1 font-mono text-[10px] tracking-[0.1em] text-n-900">YOUR TURN</span>
          )}
          {aggro && !player.destroyed && (
            <motion.span
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="border border-toggle-red-500 bg-toggle-red-500 px-1 font-mono text-[9px] tracking-[0.1em] text-cream-100"
              title="The enemy's attacks go to the player who attacked last"
            >
              ◎ AGGRO
            </motion.span>
          )}
        </div>

        <div className="flex items-center gap-2.5 font-mono text-[11px] text-putty-700">
          <span title="Cockpit ⚡ — at 0 the next hit destroys the ship">
            COCKPIT <span className="text-n-900">{cockpit.energy}/{cockpit.max}⚡</span>
          </span>
          <span title="Ship size under the rule in play">{size.text}</span>
          <span>SCRAP {player.scrapDeck.length}/{scrapCapacityFor(player, config)}</span>
          <span>HAND {player.hand.length}</span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="h-2 flex-1 overflow-hidden border border-putty-600 bg-crt-glass">
            <motion.div className="h-full" animate={{ width: `${pct}%`, background: shieldColor(pct) }} transition={{ duration: 0.4 }} />
          </div>
          {active && downsUsed !== undefined && (
            <>
              <DownsTracker current={downsUsed} total={config.downCount} size="sm" />
              <div className="font-mono text-[11px] text-putty-700">
                {downsUsed}/{config.downCount}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-center pt-1">
          <ShipGrid
            ship={shown}
            facing="up"
            size="sm"
            renderSlot={(slot) => (
              <SeatModule
                playerId={player.id}
                slot={slot}
                fx={fxKey(side, slot.index)}
                controls={controls}
                actual={player.ship.slots[slot.index]?.energy ?? slot.energy}
              />
            )}
          />
        </div>
      </div>
    </motion.div>
  );
}

function SeatModule({
  playerId,
  slot,
  fx,
  controls,
  actual,
}: {
  playerId: string;
  slot: ShipSlot;
  fx: string;
  controls: PanelControls | undefined;
  actual: number;
}) {
  const drag = controls?.drag ?? null;
  const zone = useDropZone(
    `seat:${playerId}:${slot.index}`,
    drag
      ? {
          accepts: (p: DragPayload) => p.kind === 'reroute' && drag.accepts(p.slot, slot.index),
          onDrop: (p: DragPayload) => {
            if (p.kind === 'reroute') drag.onDrop(p.slot, slot.index);
          },
        }
      : null,
  );
  const armed = !!controls?.armed.includes(slot.index);
  const open = !!controls?.open.includes(slot.index);
  const selected = controls?.selected === slot.index;
  const clickable = !!controls && (armed || open || selected);
  const source = !!drag && drag.source(slot.index);
  const delta = controls?.deltas[slot.index];

  return (
    <div {...zone.props} className="h-full w-full">
      <ModuleTile
        slot={slot}
        variant="compact"
        armed={armed && !selected}
        selected={selected}
        hint={zone.over ? 'over' : zone.active || (open && !zone.dragging) ? 'ok' : null}
        dim={!!controls && !armed && !open && !selected && !slot.destroyed}
        fxKey={fx}
        {...(delta !== undefined ? { delta } : {})}
        title={delta ? `${actual}⚡ now → ${slot.energy}⚡ with the reroute` : undefined}
        {...dragSource(source ? { kind: 'reroute', slot: slot.index } : null, () => (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-crt-green-700 bg-crt-green-500 shadow-[0_0_12px_rgb(159_217_160/0.9)]" />
          </div>
        ))}
        {...(clickable ? { onClick: () => controls!.onSlotClick(slot.index) } : {})}
      />
    </div>
  );
}
