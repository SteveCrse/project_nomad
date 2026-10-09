import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

/**
 * Charge in a pool, as chits.
 *
 * ⚡ is a token you physically put on a card at the table, so on screen it is a
 * bunch of green squares rather than a bar: one square per point the pool
 * holds, filled ones for the charge that's actually there. When a pool is
 * deeper than the space can print — a big cockpit on a combat tile — the chits
 * collapse into a single large square carrying the number, which is what a
 * player does with a pile of tokens anyway.
 *
 * A chit that fills pops in; one that empties pops out — the change is the
 * thing worth seeing, so it's never just swapped.
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
  // The first render is the pool as it is, not a change to it.
  const mounted = useRef(false);
  const settled = mounted.current;
  useEffect(() => {
    mounted.current = true;
  }, []);

  if (capacity <= 0) return <div className="min-h-0 flex-1" />;

  const held = preview ? 0 : Math.max(0, Math.min(energy, capacity));

  if (capacity > max) {
    const filled = !preview && held > 0;
    return (
      <div className="flex min-h-0 flex-1 items-center">
        <motion.div
          key={preview ? 'cap' : held}
          initial={settled ? { scale: 1.5 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 18 }}
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
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-wrap content-center items-center"
      style={{ gap: Math.max(1, Math.round(chit / 4)) }}
      title={preview ? `A ${capacity}⚡ pool, one chit per point` : `${held} of ${capacity}⚡ held`}
    >
      {Array.from({ length: capacity }, (_, i) => {
        const on = i < held;
        return (
          <motion.div
            key={`${i}-${on ? 'on' : 'off'}`}
            initial={settled ? (on ? { scale: 1.9, opacity: 0.3 } : { scale: 0.4, opacity: 0.4 }) : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 16, delay: settled ? Math.min(i, 8) * 0.025 : 0 }}
            className="flex-none border"
            style={{
              width: chit,
              height: chit,
              borderColor: on ? 'var(--crt-green-700)' : 'var(--putty-600)',
              background: on ? 'var(--crt-green-500)' : 'var(--crt-glass)',
            }}
          />
        );
      })}
    </div>
  );
}
