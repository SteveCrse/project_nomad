import { getPart } from '@data';
import type { SeedSlot } from '@data';
import { ROLE_COLOR } from '@/lib/palette';
import { useConfig } from '@/store/configStore';

type Variant = 'compact' | 'large' | 'scrap';

interface ModuleTileProps {
  slot: SeedSlot;
  variant?: Variant;
  selected?: boolean;
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
 * Four states, all from the imported design: empty (dashed), cockpit (the
 * ship anchor, black-bordered), adrift (blown-out slot), and an equipped
 * module — left-edged in its role colour with an energy pip strip.
 */
export function ModuleTile({ slot, variant = 'compact', selected, onClick }: ModuleTileProps) {
  const config = useConfig();
  const part = getPart(slot.partId);
  const shell = `box-border flex flex-col justify-between ${HEIGHT[variant]} ${PAD[variant]}`;
  const ring = selected ? 'outline outline-2 outline-offset-1 outline-n-900' : '';
  const clickable = onClick ? 'cursor-pointer' : '';

  if (slot.adrift) {
    return (
      <div
        className={`${shell} ${ring} ${clickable} border-2 border-dashed border-putty-600 bg-putty-300`}
        onClick={onClick}
      >
        <div className={`${NAME_SIZE[variant]} leading-none font-semibold text-putty-700`}>
          ADRIFT
        </div>
        <div className="type-mono-sm text-[9px] tracking-[0.06em] text-putty-600">—</div>
      </div>
    );
  }

  if (!part) {
    return (
      <div
        className={`${shell} ${ring} ${clickable} border-2 border-dashed border-putty-500`}
        onClick={onClick}
      />
    );
  }

  if (part.partType === 'cockpit') {
    return (
      <div
        className={`${shell} ${ring} ${clickable} border-2 border-n-900 bg-putty-100 shadow-raised`}
        onClick={onClick}
      >
        <div className={`${NAME_SIZE[variant]} leading-none font-semibold`}>COCKPIT</div>
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[9px] tracking-[0.1em] text-n-700">ANCHOR</span>
          <span className="font-mono text-[10px] text-putty-700">AP {config.maxAp}</span>
        </div>
      </div>
    );
  }

  const capacity = part.energyCapacity ?? 0;
  const energy = slot.energy ?? 0;
  const roleColor = ROLE_COLOR[part.role];

  return (
    <div
      className={`${shell} ${ring} ${clickable} border border-putty-500 bg-putty-100 shadow-raised`}
      style={{ borderLeft: `4px solid ${roleColor}` }}
      onClick={onClick}
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
              {part.role}
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
      {Array.from({ length: capacity }, (_, i) => (
        <div
          key={i}
          className={`flex-1 border border-putty-600 ${tall ? 'min-w-[3px]' : 'min-w-[2px]'}`}
          style={{ background: i < energy ? 'var(--crt-green-500)' : 'var(--crt-glass)' }}
        />
      ))}
    </div>
  );
}
