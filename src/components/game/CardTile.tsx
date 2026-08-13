import type { Card, ModuleRole } from '@engine/types';
import { KIND_COLOR, RARITY_COLOR, ROLE_COLOR, rarityColor, rarityName } from '@/lib/palette';

const PART_SUBTYPE: Record<string, string> = {
  cockpit: 'Cockpit',
  'active-module': 'Active Module',
  'passive-module': 'Passive Module',
};

const dash = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));

/** The card as printed: header, name, role, costs, effect, rarity ramp. */
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

  // Both halves of a module's economy: what an activation draws, and how much
  // charge the module can hold. Passives print a dash for cost — they never
  // spend a down to fire.
  const cost = card.kind === 'event' ? '—' : dash(card.energyCost);
  const pool = card.kind === 'part' ? dash(card.energyCapacity) : '—';

  return (
    <div className="box-border flex h-[302px] w-[214px] flex-col overflow-hidden border-2 border-n-900 bg-cream-100 shadow-card">
      <div
        className="flex items-center justify-between px-2 py-[5px] font-mono text-[10px] font-bold tracking-label"
        style={{ background: kindColor, color: card.kind === 'item' ? '#F4EEDC' : '#0D0F0C' }}
      >
        <span>{card.kind.toUpperCase()}</span>
        <span>{rarityName(card.rarity)}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[7px] px-2.5 pt-[9px] pb-2">
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
          </span>
        </div>

        <div className="flex gap-1.5">
          <CostBox label="COST ⚡" value={cost} valueColor="var(--crt-green-500)" />
          <CostBox label="POOL ⚡" value={pool} valueColor="var(--crt-white)" />
        </div>

        <div className="text-[14px] leading-[1.3] text-pretty text-n-800">{card.text}</div>

        {card.status && (
          <div className="border-t border-b border-cream-300 py-1 text-[12px] leading-[1.25] text-amber-700">
            {card.status}
          </div>
        )}

        {card.flavor && (
          <div className="text-[12px] leading-[1.25] text-n-600 italic">{card.flavor}</div>
        )}

        <div className="mt-auto flex items-center gap-1.5">
          <div className="flex flex-1 gap-0.5">
            {RARITY_COLOR.map((_, i) => (
              <div
                key={i}
                className="h-1.5 flex-1"
                style={{
                  background: i < card.rarity ? rarityColor(card.rarity) : 'var(--cream-300)',
                }}
              />
            ))}
          </div>
          <span className="font-mono text-[10px] text-n-600">×{card.amount}</span>
        </div>
      </div>
    </div>
  );
}

function CostBox({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div className="flex flex-1 items-baseline justify-between bg-crt-glass px-1.5 py-1">
      <span className="font-mono text-[9px] tracking-[0.1em] text-putty-500">{label}</span>
      <span className="font-mono text-[14px]" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}
