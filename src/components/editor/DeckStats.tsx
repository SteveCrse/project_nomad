import type { Card } from '@engine/types';
import { attackOf, cardCost, cardWarnings } from '@engine';
import { RARITY_NAME, rarityColor } from '@/lib/palette';

/**
 * The numbers a balance pass is actually looking for, over whatever the
 * filters currently show.
 *
 * Copies, not card entries: what a run draws from is the expanded pile, so a
 * card with four copies is four times the deck. Cockpit share matters for the
 * same reason — the Parts deck delimits enemy ships on the next cockpit drawn,
 * so it sets how big an enemy spawns.
 */
export function DeckStats({ cards }: { cards: Card[] }) {
  const copies = cards.reduce((sum, c) => sum + c.amount, 0);
  const parts = cards.filter((c) => c.kind === 'part');
  const partCopies = parts.reduce((sum, c) => sum + c.amount, 0);
  const cockpitCopies = parts
    .filter((c) => c.role === 'COCKPIT')
    .reduce((sum, c) => sum + c.amount, 0);

  // ⚔️ bought per ⚡ spent — the cleanest cross-card read on a weapon's rate.
  const guns = cards.filter((c) => cardCost(c) > 0 && attackOf(c) > 0);
  const efficiency =
    guns.length > 0
      ? guns.reduce((sum, c) => sum + attackOf(c) / cardCost(c), 0) / guns.length
      : 0;

  const flagged = cards.filter((c) => cardWarnings(c).length > 0).length;

  const byRarity = [1, 2, 3, 4, 5].map((rarity) => ({
    rarity,
    copies: cards.filter((c) => c.rarity === rarity).reduce((sum, c) => sum + c.amount, 0),
  }));
  const maxTier = Math.max(1, ...byRarity.map((r) => r.copies));

  return (
    <div className="flex flex-none flex-wrap items-center gap-x-5 gap-y-1.5 border-2 border-t-0 border-n-900 bg-putty-100 px-3 py-1.5 font-mono text-[11px] text-putty-800">
      <Stat label="CARDS" value={String(cards.length)} />
      <Stat label="COPIES" value={String(copies)} />
      <Stat
        label="COCKPITS"
        value={cockpitCopies > 0 ? `1 IN ${(partCopies / cockpitCopies).toFixed(1)}` : '—'}
        title="parts drawn per cockpit — the rules doc assumes about one in five"
      />
      <Stat
        label="⚔️ PER ⚡"
        value={efficiency > 0 ? efficiency.toFixed(2) : '—'}
        title="average attack bought per ⚡ of cost, across every card with both"
      />
      {flagged > 0 && (
        <Stat label="FLAGGED" value={String(flagged)} tone="text-toggle-red-500" title="cards with a warning" />
      )}

      <div className="flex items-end gap-1.5">
        {byRarity.map((tier) => (
          <div
            key={tier.rarity}
            className="flex flex-col items-center gap-0.5"
            title={`${RARITY_NAME[tier.rarity - 1]} · ${tier.copies} copies`}
          >
            <div
              className="w-6"
              style={{
                height: Math.max(2, Math.round((tier.copies / maxTier) * 16)),
                background: rarityColor(tier.rarity),
              }}
            />
            <span className="text-[9px] text-putty-700">{tier.copies}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  title,
  tone = 'text-n-900',
}: {
  label: string;
  value: string;
  title?: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5" title={title}>
      <span className="text-[10px] tracking-[0.1em] text-putty-700">{label}</span>
      <span className={`text-[13px] ${tone}`}>{value}</span>
    </div>
  );
}
