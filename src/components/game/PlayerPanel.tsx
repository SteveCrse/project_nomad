import type { EnergyTransfer, PlayerState, SlotIndex } from '@engine/types';
import { playerThreshold } from '@engine/types';
import { DownsTracker } from '@/components/ds';
import { ModuleTile } from './ModuleTile';
import { hullColor } from '@/lib/palette';
import { useConfig } from '@/store/configStore';

interface PlayerPanelProps {
  player: PlayerState;
  /** This seat holds the turn. */
  active?: boolean;
  /** Downs spent / total in the current set, straight from the fight. */
  downs?: { used: number; total: number; damageThisSet: number; threshold: number; conversions: number };
  /** Slots the seat could fire right now, for the armed outline. */
  armedSlots?: SlotIndex[];
  compact?: boolean;
  onSlotClick?: (slot: SlotIndex) => void;
  selectedSlot?: SlotIndex | null;
  /** Legs queued for this down's reroute pass, marked on the grid. */
  rerouteLinks?: EnergyTransfer[];
}

/**
 * One seat's readout: hull, downs, ⚡, scrap, and the ship's module grid.
 * In combat it also carries the set's damage-vs-threshold tally — the number
 * that decides whether the seat converts or hands the turn over.
 */
export function PlayerPanel({
  player,
  active,
  downs,
  armedSlots = [],
  compact,
  onSlotClick,
  selectedSlot,
  rerouteLinks = [],
}: PlayerPanelProps) {
  const config = useConfig();
  const linked = new Set(rerouteLinks.flatMap((t) => [t.from, t.to]));
  const pct = player.ship.hpMax > 0 ? Math.round((player.ship.hp / player.ship.hpMax) * 100) : 0;
  const used = downs?.used ?? player.downsUsed;
  const total = downs?.total ?? config.downCount;
  const atRisk = used >= total - 1;
  const ownThreshold = playerThreshold(config, player.thresholdBonus);

  return (
    <div
      className={`box-border border-2 bg-surface-panel shadow-raised ${
        active ? 'border-accent-primary' : 'border-border-strong'
      } ${player.destroyed ? 'opacity-55' : ''} ${compact ? 'w-[420px]' : 'w-[520px]'}`}
    >
      <div className="h-1" style={{ background: player.accent }} />
      <div className="px-2.5 pt-2 pb-2.5">
        <div className="mb-2 flex items-center gap-2.5">
          <div className="font-display text-[14px] font-bold">{player.label}</div>
          <div className="text-[14px] tracking-[0.02em] text-putty-700">{player.ship.name}</div>
          {player.destroyed && (
            <span className="font-mono text-[10px] tracking-[0.1em] text-toggle-red-500">
              DESTROYED
            </span>
          )}
          {active && !player.destroyed && (
            <span className="font-mono text-[10px] tracking-[0.1em] text-accent-primary-text">
              ACTIVE
            </span>
          )}
          <div className="ml-auto flex items-center gap-3 font-mono text-[12px]">
            <span>
              HULL{' '}
              <span className="text-n-900">
                {player.ship.hp}/{player.ship.hpMax}
              </span>
            </span>
            <span className="text-putty-700">⚡ {player.energy}</span>
            <span className="text-putty-700">SCRAP {player.scrapDeck.length}</span>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2.5">
          <div className="h-2.5 flex-1 overflow-hidden border border-putty-600 bg-crt-glass">
            <div className="h-full" style={{ width: `${pct}%`, background: hullColor(pct) }} />
          </div>
          <DownsTracker current={used} total={total} size="sm" />
          <div
            className="font-mono text-[11px]"
            style={{ color: atRisk ? 'var(--toggle-red-500)' : 'var(--putty-700)' }}
          >
            {used}/{total}
          </div>
        </div>

        <div className="mb-2 flex items-center gap-3 font-mono text-[11px] text-putty-700">
          <span>
            SET DMG{' '}
            <span
              style={{
                color:
                  downs && downs.damageThisSet >= downs.threshold
                    ? 'var(--crt-green-700)'
                    : 'var(--n-900)',
              }}
            >
              {downs?.damageThisSet ?? player.damageThisDownSet}
            </span>
            /{downs?.threshold ?? '—'}
          </span>
          <span>OWN THRESHOLD {ownThreshold}</span>
          {player.powerPenalty > 0 && (
            <span className="text-toggle-red-500">−{player.powerPenalty}⚔ PER ATTACK</span>
          )}
          {(downs?.conversions ?? 0) > 0 && (
            <span className="text-crt-green-700">×{(downs?.conversions ?? 0) + 1} SETS</span>
          )}
        </div>

        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${player.ship.gridCols}, minmax(0, 1fr))`,
            gridAutoRows: compact ? '58px' : '66px',
          }}
        >
          {player.ship.slots.map((slot) => (
            <ModuleTile
              key={slot.index}
              slot={slot}
              variant="compact"
              armed={armedSlots.includes(slot.index)}
              selected={selectedSlot === slot.index}
              hint={linked.has(slot.index) ? 'ok' : null}
              {...(onSlotClick ? { onClick: () => onSlotClick(slot.index) } : {})}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
