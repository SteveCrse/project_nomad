import { useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { CardId } from '@engine/types';
import { attackOf, hitChance, isActivatable, outputOf, printedText } from '@engine';
import { getPart } from '@data';
import { ROLE_COLOR, rarityColor, rarityInk, rarityName, rarityShort } from '@/lib/palette';
import { useFlyIn } from '@/lib/fly';
import { EnergyChits } from './EnergyChits';
import { FirstDownBadge } from './FirstDownBadge';

type Variant = 'compact' | 'large' | 'scrap';

/**
 * The shape a tile needs. Engine `ShipSlot`s satisfy it directly; the draft
 * table, the hold and the scrap deck pass a bare card id — no charge, since a
 * card off the ship has none.
 */
export interface TileSlot {
  partId: CardId | null;
  /** Charge on the module. Absent for a card that isn't on a ship. */
  energy?: number;
  destroyed?: boolean;
}

interface ModuleTileProps {
  slot: TileSlot;
  variant?: Variant;
  selected?: boolean;
  /** Can be picked for what the seat is doing — outlined, and breathing. */
  armed?: boolean;
  /** Under the crosshair. */
  targeted?: boolean;
  /** Within reach of an attack. */
  exposed?: boolean;
  /** Not part of what the seat is doing right now — knocked back. */
  dim?: boolean;
  /** A reroute in the works would change this module's ⚡ by this much. */
  delta?: number;
  title?: string;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  /** Feedback while something is held: may it land here? */
  hint?: 'ok' | 'over' | 'blocked' | null;
  /** Where the table's effects find this module: `side:id:slot`. */
  fxKey?: string;
  /** Fly in from a card taken elsewhere, keyed `card:<id>`, when it mounts. */
  flyKey?: string | null;
  /** Anything laid over the tile — the energy buttons, a delta badge. */
  children?: ReactNode;
}

/**
 * Per-variant type and chit sizing. Every variant is the same card printed at
 * a different size: nothing is dropped as the tile shrinks.
 */
const SIZE: Record<
  Variant,
  { band: string; name: string; foot: string; chit: number; chits: number; terse: boolean; badge: 'xs' | 'sm' }
> = {
  compact: { band: 'text-[8px]', name: 'text-[10px]', foot: 'text-[8px]', chit: 5, chits: 12, terse: true, badge: 'xs' },
  large: { band: 'text-[9px]', name: 'text-[13px]', foot: 'text-[9px]', chit: 7, chits: 20, terse: false, badge: 'sm' },
  scrap: { band: 'text-[9px]', name: 'text-[12px]', foot: 'text-[9px]', chit: 6, chits: 16, terse: false, badge: 'sm' },
};

/**
 * One module, printed as the card it is.
 *
 * Energy is the module's hit chance and its HP, so the chits are the number
 * that matters: how likely its next shot is to land, and how many hits it can
 * still take. A module at 0 reads OFFLINE (one more hit destroys it); a
 * destroyed one crumples and stays on the grid, dashed, until the fight is
 * over.
 */
export function ModuleTile({
  slot,
  variant = 'compact',
  selected,
  armed,
  targeted,
  exposed,
  dim,
  delta,
  title,
  onClick,
  onPointerDown,
  hint,
  fxKey,
  flyKey = null,
  children,
}: ModuleTileProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFlyIn(ref, flyKey, flyKey ? 'pop' : 'none');
  const part = getPart(slot.partId);
  const size = SIZE[variant];
  const ring = selected
    ? 'outline-2 outline-offset-1 outline-n-900'
    : targeted
      ? 'outline-[3px] outline-offset-1 outline-[var(--toggle-red-500)]'
      : hint === 'over'
        ? 'outline-[3px] outline-offset-1 outline-[var(--accent-primary)]'
        : hint === 'ok'
          ? 'outline-2 outline-offset-1 outline-[var(--accent-primary)]'
          : armed
            ? 'outline-2 outline-offset-1 outline-[var(--crt-green-500)]'
            : exposed
              ? 'outline-1 outline-offset-1 outline-dashed outline-[var(--toggle-red-300)]'
              : 'outline-0 outline-transparent';
  const clickable = onClick || onPointerDown ? 'cursor-pointer' : '';
  const fade = hint === 'blocked' ? 'opacity-40' : '';
  const shell = [
    'relative box-border flex h-full w-full min-w-0 flex-col overflow-hidden outline',
    'transition-[outline-color,outline-width,opacity,filter] duration-200',
    ring,
    fade,
    clickable,
    armed && !selected ? 'tile-armed' : '',
    targeted ? 'tile-targeted' : '',
  ].join(' ');
  const data = fxKey ? { 'data-slot-key': fxKey } : {};

  if (!part) {
    return (
      <div
        ref={ref}
        {...data}
        className={`${shell} border-2 border-dashed ${hint === 'ok' || hint === 'over' ? 'border-accent-primary bg-putty-100' : 'border-putty-500'}`}
        onClick={onClick}
        onPointerDown={onPointerDown}
        title={title ?? 'Empty'}
      />
    );
  }

  const preview = slot.energy === undefined;
  const energy = slot.energy ?? 0;
  const max = part.energyCapacity ?? 0;
  const legendary = part.rarity >= 5;
  const isCockpit = part.role === 'COCKPIT';
  const dead = !!slot.destroyed;
  const offline = !preview && !dead && energy <= 0;
  const attack = attackOf(part);
  const output = outputOf(part);

  const stats: string[] = [];
  if (attack > 0) stats.push(preview ? `${attack}⚔` : `${attack}⚔ ${Math.round(hitChance(energy) * 100)}%`);
  if (output > 0) stats.push(`+${output}`);

  return (
    <motion.div
      ref={ref}
      {...data}
      initial={false}
      animate={
        dead
          ? { scale: 0.9, rotate: -3, filter: 'grayscale(1) brightness(0.92)', opacity: 0.85 }
          : dim
            ? { scale: 1, rotate: 0, filter: 'grayscale(0.7) brightness(0.96)', opacity: 0.55 }
            : { scale: 1, rotate: 0, filter: 'grayscale(0) brightness(1)', opacity: 1 }
      }
      transition={dead ? { type: 'spring', stiffness: 260, damping: 9 } : { duration: 0.2 }}
      className={`${shell} shadow-card ${
        dead
          ? 'border-2 border-dashed border-putty-600 bg-putty-300'
          : isCockpit
            ? 'border-2 border-n-900 bg-cream-100'
            : 'border border-putty-500 bg-cream-100'
      } ${legendary && !dead ? 'holo-face' : ''}`}
      style={dead || isCockpit ? undefined : { borderLeft: `3px solid ${ROLE_COLOR[part.role]}` }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      title={title ?? `${part.name} — ${rarityName(part.rarity)} · ${printedText(part)}`}
    >
      <div
        className={`flex-none truncate px-1 py-px text-center font-mono font-bold tracking-[0.08em] uppercase transition-colors duration-300 ${size.band} ${
          legendary && !dead && !offline ? 'holo-band' : ''
        }`}
        style={
          dead
            ? { background: 'var(--putty-500)', color: 'var(--putty-800)' }
            : offline
              ? { background: 'var(--toggle-red-700)', color: 'var(--cream-100)' }
              : legendary
                ? { color: 'var(--cream-100)' }
                : { background: rarityColor(part.rarity), color: rarityInk(part.rarity) }
        }
      >
        {dead ? 'DESTROYED' : offline ? 'OFFLINE' : `${rarityShort(part.rarity)} · ${isCockpit ? 'CPIT' : part.role}`}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-px px-1 py-[3px]">
        <div className="flex items-start gap-1">
          <div
            className={`min-w-0 flex-1 ${size.name} leading-[1.05] font-semibold tracking-[-0.01em] text-pretty ${
              dead ? 'text-putty-700 line-through' : 'text-n-900'
            }`}
          >
            {part.name}
          </div>
          {part.firstDown && !dead && <FirstDownBadge size={size.badge} />}
        </div>

        {!dead && <EnergyChits energy={energy} capacity={max} chit={size.chit} max={size.chits} preview={preview} />}

        <div
          className={`flex flex-none items-baseline justify-between gap-1 font-mono ${size.foot} ${
            dead ? 'text-putty-700' : 'text-putty-800'
          }`}
        >
          <span className="truncate" style={{ color: dead ? undefined : ROLE_COLOR[part.role] }}>
            {stats.join(' ') ||
              (size.terse
                ? part.role
                : isActivatable(part)
                  ? 'ABILITY'
                  : part.role === 'SHD'
                    ? 'BLOCKS'
                    : 'PASSIVE')}
          </span>
          <span className="flex-none">{preview ? `${max}⚡` : `${energy}/${max}`}</span>
        </div>
      </div>

      {delta !== undefined && delta !== 0 && (
        <motion.div
          key={delta}
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`absolute right-0.5 bottom-3 border px-1 font-mono text-[10px] font-bold shadow-raised ${
            delta > 0 ? 'border-crt-green-700 bg-crt-green-500 text-n-900' : 'border-amber-700 bg-amber-300 text-n-900'
          }`}
        >
          {delta > 0 ? `+${delta}` : `−${-delta}`}⚡
        </motion.div>
      )}
      {children}
    </motion.div>
  );
}
