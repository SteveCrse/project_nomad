/** A small − n + counter, clamped to [min, max]. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-1.5 border border-putty-600 bg-putty-100 px-2 py-1">
      <span className="font-mono text-[10px] tracking-[0.08em] text-putty-700">{label}</span>
      <button
        className="cursor-pointer px-1 font-mono text-[13px] disabled:cursor-not-allowed disabled:opacity-30"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="w-5 text-center font-mono text-[13px]">{value}</span>
      <button
        className="cursor-pointer px-1 font-mono text-[13px] disabled:cursor-not-allowed disabled:opacity-30"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}
