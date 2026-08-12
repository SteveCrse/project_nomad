interface DownsTrackerProps {
  /** Downs spent in the current set. */
  current: number;
  total: number;
  /** Hit the threshold — this side takes a fresh set instead of passing. */
  converted?: boolean;
  /** Small squares for the table HUD, large numbered boxes elsewhere. */
  size?: 'sm' | 'md';
}

export function DownsTracker({
  current,
  total,
  converted = false,
  size = 'md',
}: DownsTrackerProps) {
  const boxes = Array.from({ length: total }, (_, i) => i);
  const spent = (i: number) => i < current;
  // Last down of the set — red, because failing to convert passes the turn.
  const critical = current >= total - 1;

  if (size === 'sm') {
    return (
      <div className="flex gap-1">
        {boxes.map((i) => (
          <div
            key={i}
            className="h-4 w-4 border-2 border-border-strong"
            style={{
              background: spent(i)
                ? critical
                  ? 'var(--toggle-red-500)'
                  : 'var(--amber-500)'
                : 'var(--crt-glass)',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 font-body">
      <div className="flex justify-between">
        <span className="text-[12px] tracking-label text-text-secondary uppercase">Downs</span>
        {converted && <span className="type-mono-sm text-accent-primary-text">CONVERTED</span>}
      </div>
      <div className="flex gap-1.5">
        {boxes.map((i) => (
          <div
            key={i}
            className={[
              'flex h-7 w-7 items-center justify-center rounded-sm border-2 border-border-strong',
              'type-mono-sm',
              spent(i) ? 'bg-accent-primary text-n-950' : 'bg-surface-inset text-text-muted',
            ].join(' ')}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
