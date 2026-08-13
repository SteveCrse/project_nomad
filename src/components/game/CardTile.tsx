import { useState } from 'react';
import type { Card, EffectTiming, ModuleRole } from '@engine/types';
import { printedLines } from '@engine';
import { artUrl } from '@/lib/art';
import { ROLE_COLOR, cardTitleLine, rarityColor, rarityInk } from '@/lib/palette';
import {
  artHint,
  cockpitStatsHint,
  flavorHint,
  footerHint,
  lineHint,
  nameHint,
  oncePerSetHint,
  rarityHint,
  slotsHint,
  type CardHint,
} from '@/lib/cardHints';
import { EnergyChits } from './EnergyChits';

/**
 * When a printed line happens, as a chip.
 *
 * ACT costs a down (and whatever ⚡ the line says); PAS is on for as long as
 * the card is fitted; EVT resolves the moment the card is drawn. It's the
 * first question a player asks of any line on a card, so it goes first. A
 * module can carry both kinds at once — that's the point of dropping the
 * active/passive split on the card itself.
 */
const TIMING_CHIP: Record<EffectTiming, { label: string; color: string }> = {
  active: { label: 'ACT', color: 'var(--role-wpn)' },
  passive: { label: 'PAS', color: 'var(--role-shd)' },
  event: { label: 'EVT', color: 'var(--role-rds)' },
};

/**
 * The card as printed.
 *
 * The header band is the rarity: its colour *and* its wording ("LEGENDARY
 * WEAPON ITEM"), so tier, role and deck all read off one line — and a
 * legendary's band runs a foil sweep, because the rarest card in the deck
 * should be obvious across a table. The footer says what kind of thing this is
 * in play — a module's ⚡ pool as chits, an item's one use, or simply EVENT.
 * The number of copies in the deck is deck data, not card data, and isn't
 * printed at all.
 *
 * With `explain` on, every element answers what it is: the gallery is where a
 * card is read for the first time, so hovering any part of it says both the
 * general rule and this card's version of it.
 */
export function CardTile({ card, explain }: { card: Card; explain?: boolean }) {
  const [hint, setHint] = useState<{ hint: CardHint; x: number; y: number } | null>(null);

  const role: ModuleRole = card.kind === 'event' ? 'OTH' : card.role;
  const isCockpit = card.kind === 'part' && card.role === 'COCKPIT';
  const legendary = card.rarity >= 5;
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
          legendary
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
        <div
          {...region(nameHint(card))}
          className={`font-display text-[14px] leading-[1.15] font-bold text-pretty ${lit}`}
        >
          {card.name}
        </div>

        {/* A module's own pool, as the chits that sit on it at the table. */}
        {card.kind === 'part' && (card.energyCapacity ?? 0) > 0 && (
          <div {...region(footerHint(card))} className={`flex items-center gap-1.5 ${lit}`}>
            <span className="flex-none font-mono text-[9px] tracking-[0.1em] text-putty-600">
              POOL
            </span>
            <EnergyChits energy={0} capacity={card.energyCapacity ?? 0} chit={8} max={14} preview />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-[5px] overflow-hidden">
          {lines.map((line, i) => {
            const chip = TIMING_CHIP[line.timing];
            return (
              <div
                key={i}
                {...region(lineHint(card, line))}
                className={`flex items-start gap-1.5 ${lit}`}
              >
                <span
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

          {card.kind === 'part' && card.oncePerSet && (
            <div
              {...region(oncePerSetHint(card))}
              className={`font-mono text-[9px] tracking-[0.08em] text-amber-700 ${lit}`}
            >
              ONE SHOT PER SET OF DOWNS
            </div>
          )}

          {card.flavor && (
            <div
              {...region(flavorHint(card))}
              className={`text-[12px] leading-[1.2] text-n-600 italic ${lit}`}
            >
              {card.flavor}
            </div>
          )}
        </div>

        <Footer
          card={card}
          region={region}
          lit={lit}
          roleColor={ROLE_COLOR[role]}
          isCockpit={isCockpit}
        />
      </div>

      {hint && <HintBubble hint={hint.hint} x={hint.x} y={hint.y} />}
    </div>
  );
}

/**
 * The bottom strip, which is where the three decks part company.
 *
 * A module holds charge, so it prints the most it can hold — and a cockpit
 * prints the two numbers that make it a ship, its slot count and its basics.
 * An item is spent the moment it resolves. An event just happens.
 */
function Footer({
  card,
  region,
  lit,
  roleColor,
  isCockpit,
}: {
  card: Card;
  region: (hint: CardHint) => Record<string, unknown>;
  lit: string;
  roleColor: string;
  isCockpit: boolean;
}) {
  const strip = 'mt-auto flex flex-none items-baseline border-t border-cream-300 pt-1';

  if (card.kind === 'item') {
    return (
      <div {...region(footerHint(card))} className={`${strip} justify-center ${lit}`}>
        <span className="font-mono text-[10px] tracking-[0.16em] text-putty-600">SINGLE USE</span>
      </div>
    );
  }

  if (card.kind === 'event') {
    return (
      <div {...region(footerHint(card))} className={`${strip} justify-center ${lit}`}>
        <span className="font-mono text-[10px] tracking-[0.16em] text-putty-600">EVENT</span>
      </div>
    );
  }

  if (isCockpit) {
    return (
      <div className={`${strip} justify-between gap-1`}>
        <span
          {...region(slotsHint(card))}
          className={`truncate font-body text-[12px] tracking-[0.06em] text-n-700 uppercase ${lit}`}
        >
          {card.slots ?? 0} SLOTS
        </span>
        <span {...region(cockpitStatsHint(card))} className={`font-mono text-[11px] text-n-800 ${lit}`}>
          {card.power ?? 0}⚔ · +{card.genPerDown ?? 0}⚡/DOWN
        </span>
      </div>
    );
  }

  return (
    <div className={`${strip} justify-between gap-1`}>
      <span className="font-mono text-[9px] tracking-[0.1em]" style={{ color: roleColor }}>
        {card.role}
      </span>
      {card.energyCapacity !== null && card.energyCapacity !== undefined && (
        <span {...region(footerHint(card))} className={`font-mono text-[13px] text-n-800 ${lit}`}>
          <span className="mr-1 text-[9px] tracking-[0.1em] text-putty-600">MAX</span>
          {card.energyCapacity}⚡
        </span>
      )}
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
      <div className="mb-1 font-mono text-[10px] tracking-console text-crt-green-500 uppercase">
        {hint.title}
      </div>
      <div className="text-[13px] leading-[1.35] text-crt-white">{hint.body}</div>
    </div>
  );
}
