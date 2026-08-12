import type { SeedShip } from '@data';
import { DownsTracker } from '@/components/ds';
import { ModuleTile } from './ModuleTile';
import { hullColor } from '@/lib/palette';
import { useConfig } from '@/store/configStore';

/**
 * One seat's readout: hull, downs, AP, scrap, and the ship's module grid.
 * Downs and the scrap denominator come from the live config, so the sidebar
 * visibly drives the HUD.
 */
export function PlayerPanel({ player }: { player: SeedShip }) {
  const config = useConfig();
  const pct = Math.round((player.hp / player.hpMax) * 100);
  const atRisk = player.downsUsed >= config.downCount - 1;

  return (
    <div className="w-[520px] box-border border-2 border-border-strong bg-surface-panel shadow-raised">
      <div className="h-1" style={{ background: player.accent }} />
      <div className="px-2.5 pt-2 pb-2.5">
        <div className="mb-2 flex items-center gap-2.5">
          <div className="font-display text-[14px] font-bold">{player.label}</div>
          <div className="text-[14px] tracking-[0.02em] text-putty-700">{player.shipName}</div>
          <div className="ml-auto flex items-center gap-3 font-mono text-[12px]">
            <span>
              HULL{' '}
              <span className="text-n-900">
                {player.hp}/{player.hpMax}
              </span>
            </span>
            <span className="text-putty-700">
              AP {player.ap}/{config.maxAp}
            </span>
            <span className="text-putty-700">
              SCRAP {player.scrapCount}/{config.scrapCap}
            </span>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2.5">
          <div className="h-2.5 flex-1 overflow-hidden border border-putty-600 bg-crt-glass">
            <div className="h-full" style={{ width: `${pct}%`, background: hullColor(pct) }} />
          </div>
          <DownsTracker current={player.downsUsed} total={config.downCount} size="sm" />
          <div
            className="font-mono text-[11px]"
            style={{ color: atRisk ? 'var(--toggle-red-500)' : 'var(--putty-700)' }}
          >
            {player.downsUsed}/{config.downCount}
          </div>
        </div>

        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${player.gridCols}, minmax(0, 1fr))`,
            gridAutoRows: '66px',
          }}
        >
          {player.slots.map((slot, i) => (
            <ModuleTile key={i} slot={slot} variant="compact" />
          ))}
        </div>
      </div>
    </div>
  );
}
