import type { Card, EffectTiming, ModuleRole } from '@engine/types';
import { printedLines } from '@engine';
import { artUrl } from '@/lib/art';
import { ROLE_COLOR, cardTitleLine, rarityColor, rarityInk } from '@/lib/palette';

/**
 * When a printed line happens, as a chip.
 *
 * ACT costs a down (and whatever ⚡ the line says); PAS is on for as long as
 * the card is fitted; EVT resolves the moment the card is drawn. It's the
 * first question a player asks of any line on a card, so it goes first. A
 * module can carry both kinds at once — that's the point of dropping the
 * active/passive split on the card itself.
 */
const TIMING_CHIP: Record<EffectTiming, { label: string; color: string; title: string }> = {
  active: { label: 'ACT', color: 'var(--role-wpn)', title: 'costs a down to fire' },
  passive: { label: 'PAS', color: 'var(--role-shd)', title: 'always on while fitted' },
  event: { label: 'EVT', color: 'var(--role-rds)', title: 'resolves when this card is drawn' },
};

/**
 * The card as printed.
 *
 * The header band is the rarity: its colour *and* its wording ("LEGENDARY
 * WEAPON ITEM"), so tier, role and deck all read off one line. The footer says
 * what kind of thing this is in play — a module's max ⚡, an item's one use, or
 * simply EVENT. The number of copies in the deck is deck data, not card data,
 * and isn't printed at all.
 */
export function CardTile({ card }: { card: Card }) {
  const role: ModuleRole = card.kind === 'event' ? 'OTH' : card.role;
  const isCockpit = card.kind === 'part' && card.role === 'COCKPIT';
  const art = artUrl(card.art);
  const lines = printedLines(card);

  // Under the name: whatever else identifies the card. A cockpit's capacity is
  // half of what it is, and an event's subtype is authored.
  const subtitle = isCockpit
    ? `${card.slots ?? 0} SLOTS`
    : card.kind === 'event'
      ? card.subtype
      : '';

  return (
    <div className="box-border flex h-[302px] w-[214px] flex-col overflow-hidden border-2 border-n-900 bg-cream-100 shadow-card">
      <div
        className="flex-none truncate px-2 py-[5px] font-mono text-[10px] font-bold tracking-label uppercase"
        style={{ background: rarityColor(card.rarity), color: rarityInk(card.rarity) }}
      >
        {cardTitleLine(card)}
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
            style={{ color: ROLE_COLOR[role], borderColor: ROLE_COLOR[role] }}
          >
            {role}
          </span>
          {subtitle && (
            <span className="truncate font-body text-[12px] tracking-[0.06em] text-n-600 uppercase">
              {subtitle}
            </span>
          )}
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

        <Footer card={card} />
      </div>
    </div>
  );
}

/**
 * The bottom strip, which is where the three decks part company.
 *
 * A module holds charge, so it prints the most it can hold. An item is spent
 * the moment it resolves. An event just happens.
 */
function Footer({ card }: { card: Card }) {
  const strip = 'mt-auto flex flex-none items-baseline border-t border-cream-300 pt-1';

  if (card.kind === 'item') {
    return (
      <div className={`${strip} justify-center`} title="items leave play once they resolve">
        <span className="font-mono text-[10px] tracking-[0.16em] text-putty-600">SINGLE USE</span>
      </div>
    );
  }

  if (card.kind === 'event') {
    return (
      <div className={`${strip} justify-center`} title="resolves on the step it is drawn">
        <span className="font-mono text-[10px] tracking-[0.16em] text-putty-600">EVENT</span>
      </div>
    );
  }

  if (card.energyCapacity === null || card.energyCapacity === undefined) return null;
  return (
    <div
      className={`${strip} justify-end gap-1`}
      title="the most ⚡ this module’s own pool holds"
    >
      <span className="font-mono text-[9px] tracking-[0.1em] text-putty-600">MAX</span>
      <span className="font-mono text-[13px] text-n-800">{card.energyCapacity}⚡</span>
    </div>
  );
}
