import type { CardId } from '@engine/types';
import { cardCost, isActivatable, printedText } from '@engine';
import { getPart } from '@data';
import { ROLE_COLOR, rarityColor, rarityInk, rarityName, rarityShort } from '@/lib/palette';
import { EnergyChits } from './EnergyChits';

type Variant = 'compact' | 'large' | 'scrap';

/**
 * The shape a tile needs. Engine `ShipSlot`s satisfy it directly; the builder
 * and the scrap rack pass looser objects.
 */
export interface TileSlot {
  partId: CardId | null;
  energy?: number;
  /** Knocked out in combat — occupied but dead. */
  disabled?: boolean;
  /** Fired already in this set of downs. */
  usedThisDownSet?: boolean;
}

interface ModuleTileProps {
  slot: TileSlot;
  variant?: Variant;
  selected?: boolean;
  /** Ready to fire — outlined in the accent so the seat's options read fast. */
  armed?: boolean;
  /** Under the crosshair as a module-attack target. */
  targeted?: boolean;
  title?: string;
  onClick?: () => void;
  /** Grid layout: whether this tile can be picked up, and where it may land. */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Feedback while a drag is in flight: may the held part land here? */
  hint?: 'ok' | 'blocked' | null;
}

/**
 * Per-variant type and chit sizing.
 *
 * Every variant is the same card, printed at a different size: rarity band,
 * name, chits, stat footer. Nothing is dropped as the tile shrinks — the type
 * gets smaller and the chits pack tighter, so a module on a 66px combat grid
 * still says what tier it is and how much charge it is holding.
 */
const SIZE: Record<
  Variant,
  { band: string; name: string; foot: string; chit: number; chits: number; terse: boolean }
> = {
  compact: { band: 'text-[8px]', name: 'text-[10px]', foot: 'text-[8px]', chit: 5, chits: 12, terse: true },
  large: { band: 'text-[9px]', name: 'text-[13px]', foot: 'text-[9px]', chit: 7, chits: 20, terse: false },
  scrap: { band: 'text-[9px]', name: 'text-[12px]', foot: 'text-[9px]', chit: 6, chits: 16, terse: false },
};

/**
 * One position in a ship's module grid, printed as the card it is.
 *
 * A fitted module reads the same way on the table as it does in the deck
 * browser: a rarity band across the top (legendary catches the light), the
 * name, the charge in its pool as a block of green chits, and a footer of the
 * numbers that decide whether a down can be spent on it. The other states are
 * the ones the grid needs: empty (dashed), adrift (blown-out), armed (can fire
 * this down), spent (already fired this set).
 */
export function ModuleTile({
  slot,
  variant = 'compact',
  selected,
  armed,
  targeted,
  title,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  hint,
}: ModuleTileProps) {
  const part = getPart(slot.partId);
  const size = SIZE[variant];
  const ring = selected
    ? 'outline outline-2 outline-offset-1 outline-n-900'
    : targeted
      ? 'outline outline-2 outline-offset-1 outline-[var(--toggle-red-500)]'
      : hint === 'ok'
        ? 'outline outline-2 outline-offset-1 outline-[var(--accent-primary)]'
        : armed
          ? 'outline outline-2 outline-offset-1 outline-[var(--crt-green-500)]'
          : '';
  const clickable = onClick ? 'cursor-pointer' : '';
  const drag = {
    ...(draggable ? { draggable: true } : {}),
    ...(onDragStart ? { onDragStart } : {}),
    ...(onDragEnd ? { onDragEnd } : {}),
    ...(onDragOver ? { onDragOver } : {}),
    ...(onDrop ? { onDrop } : {}),
  };
  // A part that can't land here is dimmed rather than hidden, so the rule
  // ("attach it next to something") is visible while dragging.
  const fade = hint === 'blocked' ? 'opacity-40' : '';
  const shell = `box-border flex h-full w-full min-w-0 flex-col overflow-hidden ${ring} ${fade} ${clickable}`;

  if (!part) {
    return (
      <div
        {...drag}
        className={`${shell} border-2 border-dashed ${
          hint === 'ok' ? 'border-accent-primary bg-putty-100' : 'border-putty-500'
        }`}
        onClick={onClick}
        title={title ?? 'Open position — a part may attach here'}
      />
    );
  }

  const capacity = part.energyCapacity ?? 0;
  const energy = slot.energy ?? 0;
  const legendary = part.rarity >= 5;
  const isCockpit = part.role === 'COCKPIT';
  const spent = !!slot.usedThisDownSet;
  const fires = isActivatable(part);
  const cost = fires ? cardCost(part) : 0;

  // Knocked out: the card is still the card, so it keeps its band and name and
  // simply goes grey and dashed. What it holds no longer matters.
  const dead = !!slot.disabled;

  return (
    <div
      {...drag}
      className={`${shell} shadow-card ${
        dead
          ? 'border-2 border-dashed border-putty-600 bg-putty-300'
          : isCockpit
            ? 'border-2 border-n-900 bg-cream-100'
            : 'border border-putty-500 bg-cream-100'
      } ${spent && !dead ? 'opacity-75' : ''} ${legendary && !dead ? 'holo-face' : ''}`}
      style={dead || isCockpit ? undefined : { borderLeft: `3px solid ${ROLE_COLOR[part.role]}` }}
      onClick={onClick}
      title={title ?? `${part.name} — ${rarityName(part.rarity)} · ${printedText(part)}`}
    >
      {/* The tier, at a glance and in colour: the band is the rarity ramp, and
          legendary is the one that moves. */}
      <div
        className={`flex-none truncate px-1 py-px text-center font-mono font-bold tracking-[0.08em] uppercase ${size.band} ${
          legendary && !dead ? 'holo-band' : ''
        }`}
        style={
          dead
            ? { background: 'var(--putty-500)', color: 'var(--putty-800)' }
            : legendary
              ? { color: 'var(--cream-100)' }
              : { background: rarityColor(part.rarity), color: rarityInk(part.rarity) }
        }
      >
        {dead ? 'OFFLINE' : `${rarityShort(part.rarity)} · ${part.role === 'COCKPIT' ? 'CPIT' : part.role}`}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-px px-1 py-[3px]">
        <div
          className={`${size.name} leading-[1.05] font-semibold tracking-[-0.01em] text-pretty ${
            dead ? 'text-putty-700' : 'text-n-900'
          }`}
        >
          {part.name}
        </div>

        {!dead && (
          <EnergyChits energy={energy} capacity={capacity} chit={size.chit} max={size.chits} />
        )}

        <div
          className={`flex flex-none items-baseline justify-between gap-1 font-mono ${size.foot} ${
            dead ? 'text-putty-700' : 'text-putty-800'
          }`}
        >
          {isCockpit ? (
            <span className="truncate">
              {part.slots ?? 0}◻ {part.power ?? 0}⚔ +{part.genPerDown ?? 0}⚡
            </span>
          ) : (
            <span className="truncate" style={{ color: ROLE_COLOR[part.role] }}>
              {spent
                ? 'SPENT'
                : !fires
                  ? size.terse
                    ? 'PASS'
                    : 'PASSIVE'
                  : cost > 0
                    ? `${cost}⚡${size.terse ? '' : ' FIRE'}`
                    : size.terse
                      ? 'FREE'
                      : 'FIRE · FREE'}
            </span>
          )}
          <span className="flex-none">
            {energy}/{capacity}
          </span>
        </div>
      </div>
    </div>
  );
}
