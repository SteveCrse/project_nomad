import { useEffect, useRef } from 'react';
import type { LogEntry, LogTone } from '@engine/types';

const TONE: Record<LogTone, string> = {
  info: 'var(--crt-white)',
  damage: 'var(--toggle-red-300)',
  convert: 'var(--crt-green-500)',
  system: 'var(--console-dim)',
  loot: 'var(--amber-300)',
};

/**
 * The run transcript, CRT-styled. It's the primary playtest artefact: every
 * roll, every conversion and every refusal ends up here in order.
 */
export function LogPanel({ log, className = '' }: { log: LogEntry[]; className?: string }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [log.length]);

  return (
    <div
      className={`flex min-h-0 flex-col border-2 border-border-strong bg-crt-glass ${className}`}
    >
      <div className="flex items-baseline justify-between border-b border-console-border px-2.5 py-1.5">
        <span className="font-mono text-[10px] tracking-console text-crt-green-500">
          RUN TRANSCRIPT
        </span>
        <span className="font-mono text-[10px] text-console-dim">{log.length} LINES</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2.5 py-2">
        {log.length === 0 && (
          <div className="font-mono text-[11px] text-console-dim">No entries yet.</div>
        )}
        {log.map((entry) => (
          <div key={entry.id} className="flex gap-2 py-[1px] font-mono text-[11px] leading-[1.35]">
            <span className="w-8 flex-none text-right text-console-faint">
              {entry.round > 0 ? `R${entry.round}` : '··'}
            </span>
            {entry.actor && (
              <span className="w-[92px] flex-none truncate text-console-dim">{entry.actor}</span>
            )}
            <span className="min-w-0 flex-1" style={{ color: TONE[entry.tone] }}>
              {entry.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
