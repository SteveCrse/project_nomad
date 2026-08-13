import type { EnemyInstance, SlotIndex } from '@engine/types';
import { ship as shipEngine } from '@engine';
import { StatGauge } from '@/components/ds';
import { ModuleTile } from './ModuleTile';
import { CONTENT } from '@data';
import { useConfig } from '@/store/configStore';

interface EnemyPanelProps {
  enemy: EnemyInstance;
  active?: boolean;
  targeted?: boolean;
  downs?: { used: number; total: number; damageThisSet: number; threshold: number };
  onSelect?: () => void;
  onSlotClick?: (slot: SlotIndex) => void;
  targetSlot?: SlotIndex | null;
}

/**
 * An enemy ship on the table. Cockpit shield, threshold and downs are the
 * three numbers a playtester watches: the threshold is what the party has to
 * beat in one set to keep the turn, the downs strip is how close the enemy is
 * to chaining another one, and the cockpit gauge is how close it is to being
 * a wreck — once it reads 0, the next hit that gets through ends it.
 */
export function EnemyPanel({
  enemy,
  active,
  targeted,
  downs,
  onSelect,
  onSlotClick,
  targetSlot,
}: EnemyPanelProps) {
  const config = useConfig();
  const dead = enemy.ship.destroyed;
  const used = downs?.used ?? enemy.downsUsed;
  const total = downs?.total ?? enemy.downCount ?? config.downCount;
  const partCount = enemy.ship.slots.filter(
    (s) => s.partId && s.partId !== enemy.ship.cockpitId,
  ).length;
  const cockpitCharge = shipEngine.cockpitCharge(CONTENT, enemy.ship);
  const cockpitCap = shipEngine.cockpitCapacity(CONTENT, enemy.ship);
  const shields = shipEngine.shieldPool(CONTENT, enemy.ship);

  return (
    <div
      className={`flex flex-none items-stretch gap-5 border-2 bg-surface-panel px-4 py-3 shadow-raised ${
        active ? 'border-toggle-red-500' : targeted ? 'border-accent-primary' : 'border-border-strong'
      } ${dead ? 'opacity-50' : ''} ${onSelect ? 'cursor-pointer' : ''}`}
      onClick={onSelect}
    >
      <div className="flex w-[236px] flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <div className="font-display text-[14px] font-bold">{enemy.name.toUpperCase()}</div>
          {enemy.isBoss && (
            <span className="font-mono text-[10px] tracking-[0.1em] text-amber-700">BOSS</span>
          )}
          {dead && (
            <span className="font-mono text-[10px] tracking-[0.1em] text-putty-700">WRECK</span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-putty-700">
          <span>{partCount} PARTS</span>
          <span title="Every charged absorber, cockpit included">SHIELDS {shields}⚡</span>
          <span className="text-toggle-red-500">THRESHOLD {enemy.convThreshold}</span>
        </div>
        <StatGauge
          label="Cockpit ⚡"
          value={cockpitCharge}
          max={cockpitCap}
          tone="danger"
          className="w-[220px]"
        />
        <div className="flex items-center gap-2">
          <span className="text-[12px] tracking-label text-text-secondary uppercase">Downs</span>
          <div className="flex gap-1.5">
            {Array.from({ length: total }, (_, i) => (
              <div
                key={i}
                className="h-4 w-4 border-2 border-border-strong"
                style={{ background: i < used ? 'var(--toggle-red-500)' : 'var(--crt-glass)' }}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] text-putty-700">
            {used}/{total}
          </span>
        </div>
        {downs && (
          <div className="font-mono text-[11px] text-putty-700">
            SET DMG{' '}
            <span
              style={{
                color:
                  downs.damageThisSet >= downs.threshold
                    ? 'var(--toggle-red-500)'
                    : 'var(--n-900)',
              }}
            >
              {downs.damageThisSet}
            </span>
            /{downs.threshold} TO CONVERT
          </div>
        )}
      </div>

      <div className="w-0.5 bg-putty-400" />

      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${enemy.ship.gridCols}, 96px)`,
          gridAutoRows: '68px',
        }}
      >
        {enemy.ship.slots.map((slot) => (
          <ModuleTile
            key={slot.index}
            slot={slot}
            variant="compact"
            targeted={targetSlot === slot.index}
            {...(onSlotClick ? { onClick: () => onSlotClick(slot.index) } : {})}
          />
        ))}
      </div>
    </div>
  );
}
