import { Tabs } from '@/components/ds';
import { TABS, useUiStore } from '@/store/uiStore';
import { useGame, useGameStore } from '@/store/gameStore';
import { combat } from '@engine';

export function TopBar() {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const configOpen = useUiStore((s) => s.configOpen);
  const toggleConfig = useUiStore((s) => s.toggleConfig);
  const state = useGame();
  const seed = useGameStore((s) => s.seed);

  const side = state?.combat ? combat.currentSide(state.combat) : undefined;
  const battle = state?.combat ? { party: state.party, combat: state.combat } : null;
  const turn = battle && side ? combat.sideName(battle, side) : (state?.phase ?? '—');

  return (
    <div className="flex h-14 flex-none items-center gap-6 border-b-2 border-border-strong bg-surface-panel px-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
      <div className="flex items-baseline gap-2.5">
        <div className="font-display text-[17px] font-extrabold tracking-[0.04em]">N.O.M.A.D.</div>
        <div className="font-mono text-[11px] text-putty-700">TEST TOOL v0.5</div>
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} />

      <div className="ml-auto flex items-center gap-3.5">
        <div className="flex items-center gap-3.5 border border-border-strong bg-crt-glass px-3 py-[5px] font-mono text-[11px] text-crt-white">
          <Readout label="SEED" value={seed || '—'} />
          <Readout label="SECTOR" value={state?.sector ?? '—'} />
          <Readout label="ROUND" value={state?.combat?.round ?? 0} />
          <Readout label="TURN" value={turn.toUpperCase()} />
        </div>

        <button
          onClick={toggleConfig}
          className="flex cursor-pointer items-center gap-2 border border-border-strong bg-crt-glass px-3 py-1.5 font-mono text-[11px] tracking-[0.1em] text-crt-white hover:bg-crt-glass-raised"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: configOpen ? 'var(--console-accent)' : 'var(--console-faint)' }}
          />
          <span>CONFIG {configOpen ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      {label} <span className="text-crt-green-500">{value}</span>
    </span>
  );
}
