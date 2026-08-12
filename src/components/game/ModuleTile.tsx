import type { CardId } from '@engine/types';
import { getPart } from '@data';
import { ROLE_COLOR } from '@/lib/palette';
import { useConfig } from '@/store/configStore';

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
}: ModuleTileProps) {
  const config = useConfig();
  const part = getPart(slot.partId);
  const shell = `box-border flex flex-col justify-between ${HEIGHT[variant]} ${PAD[variant]}`;
  const ring = selected
    ? 'outline outline-2 outline-offset-1 outline-n-900'
    : targeted
      ? 'outline outline-2 outline-offset-1 outline-[var(--toggle-red-500)]'
      : armed
        ? 'outline outline-2 outline-offset-1 outline-[var(--crt-green-500)]'
        : '';
  const clickable = onClick ? 'cursor-pointer' : '';

  if (slot.disabled) {
    return (
      <div
        className={`${shell} ${ring} ${clickable} border-2 border-dashed border-putty-600 bg-putty-300`}
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
        className={`${shell} ${ring} ${clickable} border-2 border-dashed border-putty-500`}
        onClick={onClick}
        title={title}
      />
    );
  }

  if (part.partType === 'cockpit') {
    return (
      <div
        className={`${shell} ${ring} ${clickable} border-2 border-n-900 bg-putty-100 shadow-raised`}
        onClick={onClick}
        title={title ?? part.name}
      >
        <div className={`${NAME_SIZE[variant]} leading-none font-semibold`}>COCKPIT</div>
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[9px] tracking-[0.1em] text-n-700">ANCHOR</span>
          <span className="font-mono text-[10px] text-putty-700">
            AP {part.apPerTurn ?? config.maxAp}
          </span>
        </div>
      </div>
    );
  }

  const capacity = part.energyCapacity ?? 0;
  const energy = slot.energy ?? 0;
  const roleColor = ROLE_COLOR[part.role];
  const spent = slot.usedThisDownSet;

  return (
    <div
      className={`${shell} ${ring} ${clickable} border border-putty-500 shadow-raised ${
        spent ? 'bg-putty-200 opacity-70' : 'bg-putty-100'
      }`}
      style={{ borderLeft: `4px solid ${roleColor}` }}
      onClick={onClick}
      title={title ?? `${part.name} — ${part.text}`}
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
