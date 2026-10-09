import { useState } from 'react';
import type { Card, ModuleRole, PartCard } from '@engine/types';
import type { PrintedTiming } from '@engine';
import { ACTION_LABEL, attackOf, outputOf, powerCostOf, printedLines } from '@engine';
import { artUrl } from '@/lib/art';
import { ROLE_COLOR, cardTitleLine, rarityColor, rarityInk } from '@/lib/palette';
import {
  artHint,
  costHint,
  firstDownHint,
  flavorHint,
  footerHint,
  lineHint,
  nameHint,
  rarityHint,
  sizeHint,
  statsHint,
  type CardHint,
} from '@/lib/cardHints';
import { EnergyChits } from './EnergyChits';
import { FirstDownBadge } from './FirstDownBadge';

/**
 * When a printed line happens, as a chip.
 *
 * ACT costs a down; PAS is on while the module stands; EVT resolves the
 * moment the card is drawn; LAY is where the module may sit; ENM is what the
 * enemy does with the card face up.
 */
export const TIMING_CHIP: Record<PrintedTiming, { label: string; color: string }> = {
  active: { label: 'ACT', color: 'var(--role-wpn)' },
  passive: { label: 'PAS', color: 'var(--role-shd)' },
  event: { label: 'EVT', color: 'var(--role-rds)' },
  layout: { label: 'LAY', color: 'var(--amber-700)' },
  enemy: { label: 'ENM', color: 'var(--toggle-red-700)' },
};

/**
 * The card as printed.
 *
 * The header band is the rarity: its colour *and* its wording ("RARE WEAPON
 * MODULE"), so tier, role and deck all read off one line — and a legendary's
 * band runs a foil sweep. A part prints its max ⚡ as chits (hit chance and HP
 * at once), a 1st-down icon if destroying it earns one, and a footer of the
 * numbers combat reads. The number of copies in the deck is deck data, not
 * card data, and isn't printed at all.
 *
 * With `explain` on, every element answers what it is: the gallery is where a
 * card is read for the first time, so hovering any part of it says both the
 * general rule and this card's version of it.
 */
export function CardTile({ card, explain }: { card: Card; explain?: boolean }) {
  const [hint, setHint] = useState<{ hint: CardHint; x: number; y: number } | null>(null);

  const role: ModuleRole = card.kind === 'event' || card.kind === 'action' ? 'OTH' : card.role;
  const part = card.kind === 'part' ? card : null;
  const legendary = card.rarity >= 5 && card.kind !== 'action';
  const art = artUrl(card.art);
  const lines = printedLines(card);

  /** Hover handlers for one element of the card. Regions never nest. */
  const region = (h: CardHint) =>
    explain
      ? {
          onMouseEnter: (e: React.MouseEvent) => setHint({ hint: h, x: e.clientX, y: e.clientY }),
          onMouseMove: (e: React.MouseEvent) =>
            setHint((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur)),
          onMouseLeave: () => setHint(null),
        }
      : {};
  const lit = explain ? 'hover:bg-cream-200' : '';

  return (
    <div
      className={`relative box-border flex h-[302px] w-[214px] flex-col overflow-hidden border-2 border-n-900 bg-cream-100 shadow-card ${
        legendary ? 'holo-face' : ''
      }`}
    >
      <div
        {...region(rarityHint(card))}
        className={`flex-none truncate px-2 py-[5px] font-mono text-[10px] font-bold tracking-label uppercase ${
          legendary ? 'holo-band' : ''
        }`}
        style={
          card.kind === 'action'
            ? { background: 'var(--toggle-red-700)', color: 'var(--cream-100)' }
            : legendary
              ? { color: 'var(--cream-100)' }
              : { background: rarityColor(card.rarity), color: rarityInk(card.rarity) }
        }
      >
        {cardTitleLine(card)}
      </div>

      {art && (
        <img
          {...region(artHint(card))}
          src={art}
          alt=""
          className="h-[74px] w-full flex-none border-b-2 border-n-900 object-cover"
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-[6px] px-2.5 pt-[8px] pb-1.5">
        <div className="flex items-start gap-1.5">
          <div
            {...region(nameHint(card))}
            className={`min-w-0 flex-1 font-display text-[14px] leading-[1.15] font-bold text-pretty ${lit}`}
          >
            {card.name}
          </div>
          {part?.firstDown && (
            <span {...region(firstDownHint(part))} className={lit}>
              <FirstDownBadge size="md" />
            </span>
          )}
        </div>

        {/* Max ⚡ as the chits that sit on it at the table: hit chance and HP. */}
        {part && (
          <div {...region(footerHint(part))} className={`flex items-center gap-1.5 ${lit}`}>
            <span className="flex-none font-mono text-[9px] tracking-[0.1em] text-putty-600">⚡ MAX</span>
            <EnergyChits energy={0} capacity={part.energyCapacity} chit={8} max={14} preview />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-[5px] overflow-hidden">
          {lines.map((line, i) => {
            const chip = TIMING_CHIP[line.timing];
            return (
              <div key={i} {...region(lineHint(card, line))} className={`flex items-start gap-1.5 ${lit}`}>
                <span
                  className="mt-px flex-none border px-[4px] py-px font-mono text-[9px] leading-[1.4] tracking-[0.08em]"
                  style={{ color: chip.color, borderColor: chip.color }}
                >
                  {chip.label}
                </span>
                <span className="text-[13px] leading-[1.25] text-pretty text-n-800">{line.text}</span>
              </div>
            );
          })}

          {card.flavor && (
            <div {...region(flavorHint(card))} className={`text-[12px] leading-[1.2] text-n-600 italic ${lit}`}>
              {card.flavor}
            </div>
          )}
        </div>

        <Footer card={card} region={region} lit={lit} roleColor={ROLE_COLOR[role]} />
      </div>

      {hint && <HintBubble hint={hint.hint} x={hint.x} y={hint.y} />}
    </div>
  );
}

/**
 * The bottom strip, which is where the decks part company.
 *
 * A module prints what combat reads off it — attack, output, power cost — and
 * a cockpit adds the numbers that size a ship. An item is spent the moment it
 * resolves. An event just happens. An enemy action names its action.
 */
function Footer({
  card,
  region,
  lit,
  roleColor,
}: {
  card: Card;
  region: (hint: CardHint) => Record<string, unknown>;
  lit: string;
  roleColor: string;
}) {
  const strip = 'mt-auto flex flex-none items-baseline border-t border-cream-300 pt-1';

  if (card.kind === 'item' || card.kind === 'event') {
    return (
      <div {...region(footerHint(card))} className={`${strip} justify-center ${lit}`}>
        <span className="font-mono text-[10px] tracking-[0.16em] text-putty-600">
          {card.kind === 'item' ? 'SINGLE USE' : 'EVENT'}
        </span>
      </div>
    );
  }

  if (card.kind === 'action') {
    return (
      <div {...region(footerHint(card))} className={`${strip} justify-between ${lit}`}>
        <span className="font-mono text-[10px] tracking-[0.16em] text-putty-600">ENEMY DOWN</span>
        <span className="font-mono text-[11px] font-bold text-toggle-red-700">{ACTION_LABEL[card.action].toUpperCase()}</span>
      </div>
    );
  }

  return <PartFooter card={card} region={region} lit={lit} roleColor={roleColor} strip={strip} />;
}

function PartFooter({
  card,
  region,
  lit,
  roleColor,
  strip,
}: {
  card: PartCard;
  region: (hint: CardHint) => Record<string, unknown>;
  lit: string;
  roleColor: string;
  strip: string;
}) {
  const attack = attackOf(card);
  const output = outputOf(card);
  const stats = [attack > 0 ? `${attack}⚔` : '', output > 0 ? `+${output}⚡` : ''].filter(Boolean).join(' · ');

  if (card.role === 'COCKPIT') {
    return (
      <div className={`${strip} justify-between gap-1`}>
        <span {...region(sizeHint(card))} className={`truncate font-mono text-[10px] tracking-[0.06em] text-n-700 ${lit}`}>
          {card.slots ?? 0} SLOTS · ◆{card.powerRating ?? 0}
        </span>
        <span {...region(statsHint(card))} className={`font-mono text-[11px] text-n-800 ${lit}`}>
          {stats || '—'}
        </span>
      </div>
    );
  }

  return (
    <div className={`${strip} justify-between gap-1`}>
      <span className="font-mono text-[9px] tracking-[0.1em]" style={{ color: roleColor }}>
        {card.role}
      </span>
      {stats && (
        <span {...region(statsHint(card))} className={`font-mono text-[11px] text-n-800 ${lit}`}>
          {stats}
        </span>
      )}
      <span {...region(costHint(card))} className={`font-mono text-[11px] text-n-800 ${lit}`} title="power cost">
        ◆{powerCostOf(card)}
      </span>
    </div>
  );
}

/** The hover explanation, following the pointer. */
function HintBubble({ hint, x, y }: { hint: CardHint; x: number; y: number }) {
  // Fixed to the viewport and flipped near the right/bottom edges, so a card
  // at the end of a gallery row explains itself on screen rather than off it.
  const flipX = x > window.innerWidth - 300;
  const flipY = y > window.innerHeight - 160;
  return (
    <div
      className="pointer-events-none fixed z-50 w-[264px] border-2 border-border-strong bg-crt-glass px-2.5 py-2 shadow-raised"
      style={{
        left: flipX ? x - 274 : x + 14,
        top: flipY ? y - 12 : y + 16,
        transform: flipY ? 'translateY(-100%)' : undefined,
      }}
    >
      <div className="mb-1 font-mono text-[10px] tracking-console text-crt-green-500 uppercase">{hint.title}</div>
      <div className="text-[13px] leading-[1.35] text-crt-white">{hint.body}</div>
    </div>
  );
}
