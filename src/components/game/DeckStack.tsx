interface DeckStackProps {
  label: string;
  /** Accent rule under the label, coloured per deck. */
  accent: string;
  caption: string;
}

/** A face-down deck on the table. */
export function DeckStack({ label, accent, caption }: DeckStackProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-[110px] w-[92px] flex-col items-center justify-center gap-1.5 border-2 border-n-950 bg-n-900 shadow-deck">
        <div className="px-1 text-center font-display text-[12px] leading-tight font-bold text-cream-100">
          {label}
        </div>
        <div className="h-0.5 w-11" style={{ background: accent }} />
      </div>
      <div className="font-mono text-[11px] text-putty-700">{caption}</div>
    </div>
  );
}

/** Discard is an outline, not a stack. */
export function DiscardStack({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-[110px] w-[92px] items-center justify-center border-2 border-dashed border-putty-600 text-center font-mono text-[10px] tracking-[0.1em] text-putty-600">
        {'DIS­CARD'}
      </div>
      <div className="font-mono text-[11px] text-putty-700">{count}</div>
    </div>
  );
}

/**
 * The loot bag: which rarity tiers are currently in the draw pool.
 * Tiers above `maxRarity` are dimmed — they're out of the bag until a
 * checkpoint raises the ceiling.
 */
export function LootBag({ maxRarity, colors }: { maxRarity: number; colors: string[] }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-25 w-25 flex-col items-center justify-center gap-1.5 rounded-full border-2 border-border-strong bg-putty-100 shadow-raised">
        <div className="font-mono text-[10px] tracking-[0.1em] text-putty-700">LOOT BAG</div>
        <div className="flex gap-1">
          {colors.map((color, i) => (
            <div
              key={i}
              className="h-[11px] w-[11px] rounded-full"
              style={{
                background: i < maxRarity ? color : 'transparent',
                border: i < maxRarity ? 'none' : '1px solid var(--putty-500)',
              }}
            />
          ))}
        </div>
      </div>
      <div className="font-mono text-[11px] text-putty-700">MAX TIER {maxRarity}</div>
    </div>
  );
}
