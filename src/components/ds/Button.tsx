import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-amber-500 text-n-900 border-amber-700 hover:bg-amber-300',
  secondary: 'bg-putty-100 text-n-900 border-border-strong hover:bg-putty-200',
  ghost: 'bg-transparent text-text-primary border-border-default hover:bg-putty-200',
  danger: 'bg-status-danger text-cream-100 border-toggle-red-700 hover:bg-toggle-red-300',
};

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[13px]',
  md: 'px-4.5 py-2.5 text-[15px]',
  lg: 'px-7 py-3.5 text-[17px]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={[
        'shrink-0 cursor-pointer border font-body font-semibold tracking-[0.04em] whitespace-nowrap uppercase',
        'rounded-sm transition-colors duration-100 ease-snap',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANT[variant],
        SIZE[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
