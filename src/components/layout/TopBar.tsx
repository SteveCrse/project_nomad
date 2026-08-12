import { SEED_TABLE } from '@data';
import { Tabs } from '@/components/ds';
import { TABS, useUiStore } from '@/store/uiStore';

export function TopBar() {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const configOpen = useUiStore((s) => s.configOpen);
  const toggleConfig = useUiStore((s) => s.toggleConfig);

  return (
    <div className="flex h-14 flex-none items-center gap-6 border-b-2 border-border-strong bg-surface-panel px-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
      <div className="flex items-baseline gap-2.5">
        <div className="font-display text-[17px] font-extrabold tracking-[0.04em]">N.O.M.A.D.</div>
        <div className="font-mono text-[11px] text-putty-700">TEST TOOL v0.4</div>
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} />

      <div className="ml-auto flex items-center gap-3.5">
        <div className="flex items-center gap-3.5 border border-border-strong bg-crt-glass px-3 py-[5px] font-mono text-[11px] text-crt-white">
          <Readout label="SEED" value={SEED_TABLE.seed} />
          <Readout label="SECTOR" value={SEED_TABLE.sector} />
          <Readout label="ROUND" value={SEED_TABLE.round} />
          <Readout label="TURN" value={SEED_TABLE.turn} />
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
