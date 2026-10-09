/**
 * The 1st-down icon: the marker on a module whose destruction earns the
 * attacker a 1st down. A small chevron "1ST" chip, so it reads the same on a
 * 66px combat tile as on a printed card.
 */
export function FirstDownBadge({ size = 'sm', title }: { size?: 'xs' | 'sm' | 'md'; title?: string }) {
  const text = size === 'xs' ? 'text-[7px] px-[2px]' : size === 'sm' ? 'text-[8px] px-[3px]' : 'text-[10px] px-[4px]';
  return (
    <span
      title={title ?? '1st-down icon — destroying this earns a 1st down'}
      className={`inline-flex flex-none items-center border font-mono leading-[1.35] font-bold tracking-[0.06em] ${text}`}
      style={{ background: 'var(--amber-300)', borderColor: 'var(--amber-700)', color: 'var(--n-900)' }}
    >
      1ST
    </span>
  );
}
