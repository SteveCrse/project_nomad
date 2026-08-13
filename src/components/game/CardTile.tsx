import type { Card, EffectTiming, ModuleRole } from '@engine/types';
import { printedLines } from '@engine';
import { artUrl } from '@/lib/art';
import { KIND_COLOR, ROLE_COLOR, rarityColor, rarityName } from '@/lib/palette';

const PART_SUBTYPE: Record<string, string> = {
  cockpit: 'Cockpit',
  'active-module': 'Active Module',
  'passive-module': 'Passive Module',
};

/**
 * When a printed line happens, as a chip.
 *
 * ACT costs a down (and whatever ⚡ the line says); PAS is on for as long as
 * the card is fitted; EVT resolves the moment the card is drawn. It's the
 * first question a player asks of any line on a card, so it goes first.
 */
const TIMING_CHIP: Record<EffectTiming, { label: string; color: string; title: string }> = {
  active: { label: 'ACT', color: 'var(--role-wpn)', title: 'costs a down to fire' },
  passive: { label: 'PAS', color: 'var(--role-shd)', title: 'always on while fitted' },
  event: { label: 'EVT', color: 'var(--role-rds)', title: 'resolves when this card is drawn' },
};

/**
 * The card as printed.
 *
 * Rarity is the **frame**: a coloured border round the whole card, readable
 * across a table at a glance and without spending a line of the face on it.
 * The number of copies in the deck is deck data, not card data, and isn't
 * printed at all — a player never needs it.
 */
export function CardTile({ card }: { card: Card }) {
  const kindColor = KIND_COLOR[card.kind] ?? 'var(--role-gen)';
  const role: ModuleRole = card.kind === 'event' ? 'OTH' : card.role;
  const roleColor = ROLE_COLOR[role];

  const subtype =
    card.kind === 'part'
      ? (PART_SUBTYPE[card.partType] ?? 'Module')
      : card.kind === 'item'
        ? 'Item'
        : card.subtype;

  // A cockpit's slot count is the other half of what it is, and there's no
  // stat row left to print it in.
  const slots = card.kind === 'part' && card.partType === 'cockpit' ? card.slots : undefined;
  // How much charge this module can hold: its max ⚡, printed in the corner.
  const maxEnergy = card.kind === 'part' ? card.energyCapacity : null;
  const art = artUrl(card.art);
  const lines = printedLines(card);

  return (
    <div
      className="box-border w-[222px] p-[4px] shadow-card"
      style={{ background: rarityColor(card.rarity) }}
      title={`${rarityName(card.rarity)}`}
    >
      <div className="box-border flex h-[302px] w-full flex-col overflow-hidden border-2 border-n-900 bg-cream-100">
        <div
          className="flex items-center justify-between px-2 py-[5px] font-mono text-[10px] font-bold tracking-label"
          style={{ background: kindColor, color: card.kind === 'item' ? '#F4EEDC' : '#0D0F0C' }}
        >
          <span>{card.kind.toUpperCase()}</span>
          <span>{rarityName(card.rarity)}</span>
        </div>

        {art && (
          <img
            src={art}
            alt=""
            className="h-[74px] w-full flex-none border-b-2 border-n-900 object-cover"
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-[6px] px-2.5 pt-[8px] pb-1.5">
          <div className="font-display text-[14px] leading-[1.15] font-bold text-pretty">
            {card.name}
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className="border px-[5px] py-px font-mono text-[9px] tracking-[0.1em]"
              style={{ color: roleColor, borderColor: roleColor }}
            >
              {role}
            </span>
            <span className="font-body text-[12px] tracking-[0.06em] text-n-600 uppercase">
              {subtype}
              {slots !== undefined && ` · ${slots} SLOTS`}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-[5px] overflow-hidden">
            {lines.map((line, i) => {
              const chip = TIMING_CHIP[line.timing];
              return (
                <div key={i} className="flex items-start gap-1.5">
                  <span
                    title={chip.title}
                    className="mt-px flex-none border px-[4px] py-px font-mono text-[9px] leading-[1.4] tracking-[0.08em]"
                    style={{ color: chip.color, borderColor: chip.color }}
                  >
                    {chip.label}
                  </span>
                  <span className="text-[13px] leading-[1.25] text-pretty text-n-800">
                    {line.text}
                  </span>
                </div>
              );
            })}

            {card.flavor && (
              <div className="text-[12px] leading-[1.2] text-n-600 italic">{card.flavor}</div>
            )}
          </div>

          {maxEnergy !== null && maxEnergy !== undefined && (
            <div
              className="mt-auto flex flex-none items-baseline justify-end gap-1 border-t border-cream-300 pt-1"
              title="the most ⚡ this module’s own pool holds"
            >
              <span className="font-mono text-[9px] tracking-[0.1em] text-putty-600">MAX</span>
              <span className="font-mono text-[13px] text-n-800">{maxEnergy}⚡</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
