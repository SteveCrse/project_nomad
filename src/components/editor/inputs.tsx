import type { ReactNode } from 'react';

/**
 * Dense inputs for the deck editor.
 *
 * Deliberately not design-system primitives: these are spreadsheet cells —
 * borderless until focused, sized to the column, and typed to the field they
 * edit. The card face keeps the design system's look; the editor behind it is
 * a tool.
 */

const BASE =
  'w-full min-w-0 border border-transparent bg-transparent px-1.5 py-1 text-[13px] ' +
  'outline-none hover:border-putty-400 focus:border-n-900 focus:bg-cream-100';

export function TextCell({
  value,
  onChange,
  placeholder,
  title,
  mono,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      title={title}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={[BASE, mono ? 'font-mono text-[12px]' : '', className].join(' ')}
    />
  );
}

/**
 * A number cell. `nullable` distinguishes "no pool at all" from "a pool of
 * zero" — a distinction the card model makes and the engine reads.
 */
export function NumberCell({
  value,
  onChange,
  min = 0,
  max = 999,
  disabled,
  nullable,
  title,
  placeholder = '—',
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  nullable?: boolean;
  title?: string;
  placeholder?: string;
}) {
  if (disabled) {
    return <div className="px-1.5 py-1 text-center font-mono text-[12px] text-putty-500">—</div>;
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value === null || value === undefined ? '' : value}
      min={min}
      max={max}
      title={title}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(nullable ? null : min);
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        onChange(Math.max(min, Math.min(max, Math.round(parsed))));
      }}
      className={[BASE, 'text-right font-mono text-[12px]'].join(' ')}
    />
  );
}

export function SelectCell<T extends string>({
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  title?: string;
}) {
  if (disabled) {
    return <div className="px-1.5 py-1 text-center font-mono text-[12px] text-putty-500">—</div>;
  }
  return (
    <select
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value as T)}
      className={[BASE, 'cursor-pointer appearance-none font-mono text-[11px]'].join(' ')}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A labelled control for the card panel, where columns aren't doing the work. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block pb-2">
      <div className="pb-0.5 font-mono text-[10px] tracking-[0.1em] text-putty-700 uppercase">
        {label}
      </div>
      <div className="border border-putty-400 bg-cream-100">{children}</div>
      {hint && <div className="pt-0.5 text-[11px] leading-tight text-putty-700">{hint}</div>}
    </label>
  );
}

export function IconButton({
  onClick,
  title,
  children,
  disabled,
  danger,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={[
        'flex h-[22px] w-[22px] flex-none cursor-pointer items-center justify-center border',
        'font-mono text-[12px] leading-none transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:opacity-30',
        danger
          ? 'border-putty-400 text-putty-700 hover:border-toggle-red-500 hover:bg-toggle-red-500 hover:text-cream-100'
          : 'border-putty-400 text-putty-700 hover:border-n-900 hover:bg-n-900 hover:text-cream-100',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/** Small square toolbar/label button used across the editor. */
export function ChipButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title?: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        'cursor-pointer border px-2 py-[3px] font-mono text-[10px] tracking-[0.08em] whitespace-nowrap',
        active
          ? 'border-n-900 bg-n-900 text-cream-100'
          : 'border-putty-500 bg-putty-100 text-putty-700 hover:border-n-900',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
