/**
 * Charge in a pool, as chits.
 *
 * ⚡ is a token you physically put on a card at the table, so on screen it is a
 * bunch of green squares rather than a bar: one square per point the pool
 * holds, filled ones for the charge that's actually there. When a pool is
 * deeper than the space can print — a big cockpit shield on a 66px combat
 * tile — the chits collapse into a single large square carrying the number,
 * which is what a player does with a pile of tokens anyway.
 */
export function EnergyChits({
  energy,
  capacity,
  chit,
  max,
  preview,
}: {
  /** Charge held right now. */
  energy: number;
  /** The pool's size — one chit per point. */
  capacity: number;
  /** Chit edge length in px. */
  chit: number;
  /** Most chits this tile can print before falling back to the number. */
  max: number;
  /**
   * A card off the table rather than on it: print the pool's shape, not a
   * charge it doesn't have yet. Every chit is empty and the fallback square
   * carries the capacity.
   */
  preview?: boolean;
}) {
  if (capacity <= 0) return <div className="min-h-0 flex-1" />;

  const held = preview ? 0 : Math.max(0, Math.min(energy, capacity));

  if (capacity > max) {
    const filled = !preview && held > 0;
    return (
      <div className="flex min-h-0 flex-1 items-center">
        <div
          className="flex items-center justify-center border border-putty-700 px-1 font-mono leading-none font-bold"
          style={{
            height: chit * 2.4,
            minWidth: chit * 2.8,
            background: filled ? 'var(--crt-green-500)' : 'var(--crt-glass)',
            color: filled ? 'var(--n-900)' : 'var(--crt-green-700)',
            fontSize: chit * 1.5,
          }}
          title={
            preview
              ? `A ${capacity}⚡ pool — too deep to print one chit at a time`
              : `${held} of ${capacity}⚡ held — too deep a pool to print one chit at a time`
          }
        >
          {preview ? capacity : held}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-wrap content-center items-center"
      style={{ gap: Math.max(1, Math.round(chit / 4)) }}
      title={preview ? `A ${capacity}⚡ pool, one chit per point` : `${held} of ${capacity}⚡ held`}
    >
      {Array.from({ length: capacity }, (_, i) => (
        <div
          key={i}
          className="flex-none border"
          style={{
            width: chit,
            height: chit,
            borderColor: i < held ? 'var(--crt-green-700)' : 'var(--putty-600)',
            background: i < held ? 'var(--crt-green-500)' : 'var(--crt-glass)',
          }}
        />
      ))}
    </div>
  );
}
