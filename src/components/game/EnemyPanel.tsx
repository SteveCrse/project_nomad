import { ENEMIES_BY_ID, SEED_ENEMY } from '@data';
import { StatGauge } from '@/components/ds';
import { ModuleTile } from './ModuleTile';
import { useConfig } from '@/store/configStore';
import { effectiveThreshold, scaledEnemyHp } from '@engine/types';

/**
 * The enemy ship on the table. Hull scales with player count and the
 * threshold honours any per-enemy override, both straight off the config —
 * this is the clearest place to watch the tuning knobs bite.
 */
export function EnemyPanel() {
  const config = useConfig();
  const statBlock = ENEMIES_BY_ID[SEED_ENEMY.statBlockId];
  if (!statBlock) return null;

  const hpMax = scaledEnemyHp(config, statBlock.hpPool);
  const hp = Math.min(SEED_ENEMY.hp, hpMax);
  const threshold = effectiveThreshold(config, statBlock.id, statBlock.convThreshold);
  const partCount = SEED_ENEMY.slots.filter((s) => s.partId).length;

  return (
    <div className="flex items-stretch gap-5 border-2 border-border-strong bg-surface-panel px-4 py-3 shadow-raised">
      <div className="flex w-[236px] flex-col gap-2">
        <div className="font-display text-[14px] font-bold">{statBlock.name.toUpperCase()}</div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-putty-700">
          <span>ENEMY · {partCount} PARTS</span>
          <span className="text-toggle-red-500">THRESHOLD {threshold}</span>
        </div>
        <StatGauge label="Hull" value={hp} max={hpMax} tone="danger" className="w-[220px]" />
        <div className="flex items-center gap-2">
          <span className="text-[12px] tracking-label text-text-secondary uppercase">Downs</span>
          <div className="flex gap-1.5">
            {Array.from({ length: config.downCount }, (_, i) => (
              <div
                key={i}
                className="h-4 w-4 border-2 border-border-strong"
                style={{
                  background:
                    i < SEED_ENEMY.downsUsed ? 'var(--toggle-red-500)' : 'var(--crt-glass)',
                }}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] text-putty-700">
            {SEED_ENEMY.downsUsed}/{config.downCount}
          </span>
        </div>
      </div>

      <div className="w-0.5 bg-putty-400" />

      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${SEED_ENEMY.gridCols}, 96px)`,
          gridAutoRows: '74px',
        }}
      >
        {SEED_ENEMY.slots.map((slot, i) => (
          <ModuleTile key={i} slot={slot} variant="compact" />
        ))}
      </div>
    </div>
  );
}
