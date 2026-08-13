import { useState } from 'react';
import { ENEMIES } from '@data';
import { Toggle } from '@/components/ds';
import { RARITY_COLOR } from '@/lib/palette';
import { useConfigStore } from '@/store/configStore';
import {
  CONFIG_SECTIONS,
  type BooleanConfigKey,
  type ConfigField,
  type NumericField,
} from '@/store/configFields';
import { useUiStore } from '@/store/uiStore';

/**
 * The persistent config sidebar — a live editor over the Zustand config store.
 *
 * Every control writes straight into `GameConfig`, which is the same object
 * the engine will consume. Not player-facing.
 */
export function ConfigSidebar() {
  const configOpen = useUiStore((s) => s.configOpen);
  const toggleConfig = useUiStore((s) => s.toggleConfig);

  if (!configOpen) {
    return (
      <button
        onClick={toggleConfig}
        className="flex w-7 flex-none cursor-pointer flex-col items-center gap-2.5 border-l-2 border-console-bg-deep bg-console-bg pt-3 font-mono text-console-accent"
      >
        <span className="text-[11px]">‹‹</span>
        <span className="text-[10px] tracking-[0.18em] [writing-mode:vertical-rl]">CONFIG</span>
      </button>
    );
  }

  return (
    <div className="flex w-80 min-h-0 flex-none flex-col border-l-2 border-console-bg-deep bg-console-bg font-mono text-console-text">
      <div className="flex flex-none items-center gap-2 border-b border-console-line bg-console-bg-deep px-3 py-2.5">
        <span className="text-[11px] tracking-console text-console-accent">CONFIG · TUNING</span>
        <span className="text-[10px] text-console-faint">not player-facing</span>
        <button
          onClick={toggleConfig}
          className="ml-auto cursor-pointer border border-console-border px-1.5 py-0.5 text-[10px] text-[#A8AF8C] hover:border-console-accent hover:text-console-accent"
        >
          HIDE ››
        </button>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2.5">
        {CONFIG_SECTIONS.map((section, i) => (
          <div key={section.id}>
            {i > 0 && <Divider />}
            <SectionTitle>{section.title}</SectionTitle>
            {section.fields.map((field) => (
              <FieldRow key={field.key} field={field} />
            ))}
            {section.id === 'combat' && <EnemyThresholds />}
            {section.id === 'board' && <RarityBar />}
          </div>
        ))}

        <Divider />
        <SectionTitle>Log</SectionTitle>
        <CombatLogPlaceholder />
      </div>

      <Footer />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] tracking-console text-console-dim uppercase">
      ▾ {children}
    </div>
  );
}

function Divider() {
  return <div className="my-3 h-px bg-console-line" />;
}

function FieldRow({ field }: { field: ConfigField }) {
  return field.kind === 'boolean' ? (
    <BooleanRow fieldKey={field.key} label={field.label} hint={field.hint} />
  ) : (
    <NumericRow field={field} />
  );
}

function NumericRow({ field }: { field: NumericField }) {
  const value = useConfigStore((s) => s.config[field.key]);
  const bump = useConfigStore((s) => s.bump);
  const setNumber = useConfigStore((s) => s.setNumber);
  const shown = value.toFixed(field.precision ?? 0);

  if (field.control === 'slider') {
    return (
      <div className="pb-1.5">
        <div className="flex items-center gap-2 py-[3px]">
          <span className="flex-1 text-[12px]">{field.label}</span>
          <span className="text-[13px] text-console-accent">{shown}</span>
        </div>
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          onChange={(e) => setNumber(field.key, Number(e.target.value))}
          className="my-0.5 h-3.5 w-full"
          aria-label={field.label}
        />
        {field.hint && <Hint>{field.hint}</Hint>}
      </div>
    );
  }

  return (
    <div className="pb-0.5">
      <div className="flex items-center gap-2 py-[3px]">
        <span className="flex-1 text-[12px]">{field.label}</span>
        <StepButton onClick={() => bump(field.key, -field.step)} label={`decrease ${field.label}`}>
          −
        </StepButton>
        <span className="w-[34px] text-center text-[13px] text-console-accent">{shown}</span>
        <StepButton onClick={() => bump(field.key, field.step)} label={`increase ${field.label}`}>
          +
        </StepButton>
      </div>
      {field.hint && <Hint>{field.hint}</Hint>}
    </div>
  );
}

function BooleanRow({
  fieldKey,
  label,
  hint,
}: {
  fieldKey: BooleanConfigKey;
  label: string;
  hint?: string;
}) {
  const value = useConfigStore((s) => s.config[fieldKey]);
  const setBoolean = useConfigStore((s) => s.setBoolean);
  return (
    <div className="pb-0.5">
      <div className="flex items-center gap-2 py-[3px]">
        <span className="flex-1 text-[12px]">{label}</span>
        <Toggle on={value} onChange={(next) => setBoolean(fieldKey, next)} label={label} console />
      </div>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="pt-0.5 pb-1 text-[10px] text-console-faint">{children}</div>;
}

function StepButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-5 cursor-pointer border border-console-border text-center text-[12px] hover:border-console-accent hover:text-console-accent"
    >
      {children}
    </button>
  );
}

/**
 * Per-enemy conversion threshold overrides. Blank = fall back to the stat
 * block's authored value, shown greyed so it's obvious which are overridden.
 */
function EnemyThresholds() {
  const overrides = useConfigStore((s) => s.config.enemyConvThresholds);
  const setEnemyThreshold = useConfigStore((s) => s.setEnemyThreshold);

  return (
    <div className="pt-1.5">
      <div className="pb-1 text-[10px] tracking-console text-console-dim">conv_threshold · per enemy</div>
      {ENEMIES.map((enemy) => {
        const override = overrides[enemy.id];
        const value = override ?? enemy.convThreshold;
        const isOverridden = override !== undefined;
        return (
          <div key={enemy.id} className="flex items-center gap-2 py-[3px]">
            <span
              className="flex-1 truncate text-[11px]"
              title={`${enemy.name}${enemy.isBoss ? ' (boss)' : ''} · hp ${enemy.hpPool}`}
            >
              {enemy.id}
            </span>
            <StepButton
              onClick={() => setEnemyThreshold(enemy.id, Math.max(1, value - 1))}
              label={`decrease ${enemy.id} threshold`}
            >
              −
            </StepButton>
            <span
              className="w-[34px] text-center text-[13px]"
              style={{ color: isOverridden ? 'var(--console-accent)' : 'var(--console-dim)' }}
            >
              {value}
            </span>
            <StepButton
              onClick={() => setEnemyThreshold(enemy.id, value + 1)}
              label={`increase ${enemy.id} threshold`}
            >
              +
            </StepButton>
            <button
              onClick={() => setEnemyThreshold(enemy.id, null)}
              disabled={!isOverridden}
              aria-label={`reset ${enemy.id} threshold`}
              className="w-5 cursor-pointer border border-console-border text-center text-[11px] disabled:cursor-default disabled:opacity-30"
            >
              ↺
            </button>
          </div>
        );
      })}
      <Hint>↺ clears the override and falls back to the stat block</Hint>
    </div>
  );
}

/** Which rarity tiers are currently in the bag. */
function RarityBar() {
  const maxRarity = useConfigStore((s) => s.config.maxRarityNow);
  return (
    <div className="pt-1.5">
      <div className="my-1.5 flex gap-[3px]">
        {RARITY_COLOR.map((color, i) => (
          <div
            key={i}
            className="h-4 flex-1 border"
            style={{
              background: i < maxRarity ? color : 'var(--console-off)',
              borderColor: i < maxRarity ? color : 'var(--console-border)',
            }}
          />
        ))}
      </div>
      <div className="text-[10px] text-console-faint">
        C · U · R · UR · L — tiers above max are out of the bag
      </div>
    </div>
  );
}

/** Placeholder until combat resolution exists to write real entries. */
function CombatLogPlaceholder() {
  const downCount = useConfigStore((s) => s.config.downCount);
  return (
    <div className="text-[11px] leading-[1.5] text-console-dim">
      <div>[r4] P2 cast 3🎲 → 1,1,4</div>
      <div>
        [r4] Laser Array dealt <span className="text-toggle-red-300">20⚔️</span>
      </div>
      <div>
        [r4] enemy down 1/{downCount}
      </div>
      <div>
        [r3] P3 hull 12/60 — <span className="text-toggle-red-300">critical</span>
      </div>
      <div className="pt-1 text-console-faint">awaiting engine/combat</div>
    </div>
  );
}

function Footer() {
  const reset = useConfigStore((s) => s.reset);
  const exportJson = useConfigStore((s) => s.exportJson);
  const [copied, setCopied] = useState(false);

  const copyJson = async () => {
    const json = exportJson();
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked (insecure context, denied permission) — still give
      // the playtester the payload.
      console.info(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <div className="flex flex-none gap-2 border-t border-console-line bg-console-bg-deep px-3 py-2.5">
      <FooterButton onClick={reset}>RESET DEFAULTS</FooterButton>
      <FooterButton onClick={copyJson}>{copied ? 'COPIED ✓' : 'EXPORT JSON'}</FooterButton>
    </div>
  );
}

function FooterButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 cursor-pointer border border-console-border py-1.5 text-center text-[11px] tracking-[0.08em] text-console-text hover:border-console-accent hover:text-console-accent"
    >
      {children}
    </button>
  );
}
