type Tone = 'accent' | 'danger' | 'teal';

const TONE: Record<Tone, string> = {
  accent: 'var(--accent-primary)',
  danger: 'var(--status-danger)',
  teal: 'var(--accent-secondary)',
};

interface StatGaugeProps {
  label: string;
  value: number;
  max: number;
  tone?: Tone;
  /** Override the fill colour, e.g. hull bars that shift green → amber → red. */
  fill?: string;
  className?: string;
}

export function StatGauge({
  label,
  value,
  max,
  tone = 'accent',
  fill,
  className = '',
}: StatGaugeProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`flex flex-col gap-1 font-body ${className}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] tracking-label text-text-secondary uppercase">{label}</span>
        <span className="type-mono-sm text-text-primary">
          {value} / {max}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-sm border border-border-default bg-surface-inset">
        <div
          className="h-full transition-[width] duration-200 ease-snap"
          style={{ width: `${pct}%`, background: fill ?? TONE[tone] }}
        />
      </div>
    </div>
  );
}
