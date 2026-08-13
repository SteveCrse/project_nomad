import type { CardId } from '@engine/types';
import { printedText } from '@engine';
import { getPart } from '@data';
import { ROLE_COLOR } from '@/lib/palette';

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

const HEIGHT: Record<Variant, string> = {
  compact: 'h-full',
  large: 'h-full',
  scrap: 'h-26',
};

const NAME_SIZE: Record<Variant, string> = {
  compact: 'text-[13px]',
  large: 'text-[15px]',
  scrap: 'text-[14px]',
};

const PAD: Record<Variant, string> = {
  compact: 'px-1.5 py-[5px]',
  large: 'p-2',
  scrap: 'p-2',
};

/**
 * One position in a ship's module grid.
 *
 * States, all from the imported design: empty (dashed), cockpit (the ship
 * anchor, black-bordered), adrift (blown-out slot), and an equipped module —
 * left-edged in its role colour with an energy pip strip. Combat adds two
 * more: armed (can fire this down) and spent (already fired this set).
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
  const shell = `box-border flex flex-col justify-between ${HEIGHT[variant]} ${PAD[variant]}`;
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

  if (slot.disabled) {
    return (
      <div
        {...drag}
        className={`${shell} ${ring} ${fade} ${clickable} border-2 border-dashed border-putty-600 bg-putty-300`}
        onClick={onClick}
        title={title ?? 'Knocked out'}
      >
        <div className={`${NAME_SIZE[variant]} leading-none font-semibold text-putty-700`}>
          {part ? part.name.toUpperCase() : 'ADRIFT'}
        </div>
        <div className="type-mono-sm text-[9px] tracking-[0.06em] text-putty-600">OFFLINE</div>
      </div>
    );
  }

  if (!part) {
    return (
      <div
        {...drag}
        className={`${shell} ${ring} ${fade} ${clickable} border-2 border-dashed ${
          hint === 'ok' ? 'border-accent-primary bg-putty-100' : 'border-putty-500'
        }`}
        onClick={onClick}
        title={title}
      />
    );
  }

  const capacity = part.energyCapacity ?? 0;
  const energy = slot.energy ?? 0;

  // The cockpit is a weapon, a shield and a generator at once, so its tile
  // carries all three: ⚔ it always shoots for, the pips of its own shield
  // pool, and the ⚡ a down of its generator puts back.
  if (part.role === 'COCKPIT') {
    return (
      <div
        {...drag}
        className={`${shell} ${ring} ${fade} ${clickable} border-2 border-n-900 bg-putty-100 shadow-raised`}
        onClick={onClick}
        title={title ?? `${part.name} — ${printedText(part)}`}
      >
        <div className="flex items-baseline justify-between gap-1">
          <span className={`${NAME_SIZE[variant]} leading-none font-semibold`}>COCKPIT</span>
          <span className="font-mono text-[9px] text-putty-700">{part.slots ?? 0} SLOTS</span>
        </div>
        {variant !== 'scrap' && <EnergyPips energy={energy} capacity={capacity} tall={variant === 'large'} />}
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[9px] tracking-[0.06em] text-n-700">
            {part.power ?? 0}⚔ · +{part.genPerDown ?? 0}⚡
          </span>
          <span className="font-mono text-[10px] text-putty-700">
            {energy}/{capacity}
          </span>
        </div>
      </div>
    );
  }

  const roleColor = ROLE_COLOR[part.role];
  const spent = slot.usedThisDownSet;

  return (
    <div
      {...drag}
      className={`${shell} ${ring} ${fade} ${clickable} border border-putty-500 shadow-raised ${
        spent ? 'bg-putty-200 opacity-70' : 'bg-putty-100'
      }`}
      style={{ borderLeft: `4px solid ${roleColor}` }}
      onClick={onClick}
      title={title ?? `${part.name} — ${printedText(part)}`}
    >
      <div className={`${NAME_SIZE[variant]} leading-[1.05] font-semibold tracking-[-0.01em]`}>
        {part.name}
      </div>

      {variant === 'scrap' ? (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] tracking-[0.08em]" style={{ color: roleColor }}>
            {part.role}
          </span>
          <span className="font-mono text-[11px] text-putty-700">
            {energy}/{capacity}
          </span>
        </div>
      ) : (
        <div className="flex min-w-0 items-center justify-between gap-1.5">
          <EnergyPips energy={energy} capacity={capacity} tall={variant === 'large'} />
          <div className="flex flex-none items-center gap-1 whitespace-nowrap">
            <span className="font-mono text-[9px] tracking-[0.06em]" style={{ color: roleColor }}>
              {spent ? 'SPENT' : part.role}
            </span>
            <span className="font-mono text-[9px] text-putty-700">
              {energy}/{capacity}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Charge in a module's own energy pool, one pip per point of capacity. */
function EnergyPips({
  energy,
  capacity,
  tall,
}: {
  energy: number;
  capacity: number;
  tall?: boolean;
}) {
  if (capacity <= 0) return <div className="flex-1" />;
  return (
    <div className={`flex flex-1 gap-px self-center ${tall ? 'h-3 gap-0.5' : 'h-2'}`}>
      {Array.from({ length: Math.min(capacity, 12) }, (_, i) => (
        <div
          key={i}
          className={`flex-1 border border-putty-600 ${tall ? 'min-w-[3px]' : 'min-w-[2px]'}`}
          style={{ background: i < energy ? 'var(--crt-green-500)' : 'var(--crt-glass)' }}
        />
      ))}
    </div>
  );
}
