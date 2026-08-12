interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  /** Sits inside the dark config sidebar rather than on the putty table. */
  console?: boolean;
}

export function Toggle({ on, onChange, label, console: onConsole = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={[
        'relative h-5 w-10 shrink-0 cursor-pointer rounded-sm border p-0',
        onConsole ? 'border-console-border' : 'border-border-strong',
      ].join(' ')}
      style={{
        background: on
          ? 'var(--accent-primary)'
          : onConsole
            ? 'var(--console-off)'
            : 'var(--surface-inset)',
      }}
    >
      <span
        className="absolute top-px h-4 w-4 rounded-[1px] transition-[left] duration-100 ease-snap"
        style={{
          left: on ? '21px' : '1px',
          background: on ? 'var(--n-950)' : 'var(--n-500)',
        }}
      />
    </button>
  );
}
