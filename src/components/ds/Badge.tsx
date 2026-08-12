import type { ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'teal' | 'danger' | 'warning';

const TONE: Record<Tone, string> = {
  neutral: 'bg-putty-100 text-text-secondary border-border-default',
  accent: 'bg-crt-glass text-crt-green-500 border-crt-green-700',
  teal: 'bg-steel-300 text-steel-700 border-steel-500',
  danger: 'bg-crt-glass text-toggle-red-300 border-status-danger',
  warning: 'bg-crt-glass text-amber-300 border-status-warning',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-[3px] font-body text-[12px] font-bold tracking-label uppercase ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
