import { AnimatePresence, motion } from 'motion/react';
import type { ActionDeck, EnemyInstance, PlayerState, SlotIndex } from '@engine/types';
import { ACTION_LABEL, ACTION_TEXT } from '@engine';
import { StatGauge } from '@/components/ds';
import { ShipGrid } from './ShipGrid';
import { ModuleTile } from './ModuleTile';
import { getCard } from '@data';
import { cockpitStats, fxKey } from '@/lib/combatView';

interface EnemyPanelProps {
  enemy: EnemyInstance;
  decks: ActionDeck[];
  /** The enemy holds the turn. */
  active: boolean;
  /** Which down it's on, when active. */
  down: number;
  /** Who its attacks go to. */
  aggro: PlayerState | undefined;
  /** Modules the seat can aim at for the action in hand. */
  targets: SlotIndex[];
  /** Where the shot would land if fired now. */
  aimed: SlotIndex | null;
  onTarget?: (slot: SlotIndex) => void;
}

/**
 * The enemy, across the table: its own zone, drawn hostile, so the two sides
 * of the fight never blur together. Its ship is the same grid as a player's,
 * drawn the other way up — front facing down at the players. Beside it, its
 * four action decks lie face up, one per down, so the table always reads the
 * enemy's next four moves before committing its own.
 */
export function EnemyPanel({ enemy, decks, active, down, aggro, targets, aimed, onTarget }: EnemyPanelProps) {
  const dead = enemy.ship.destroyed;
  const cockpit = cockpitStats(enemy.ship);
  const side = { kind: 'enemy' as const, id: enemy.instanceId };
  const aiming = targets.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: dead ? 0.6 : 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className={`relative flex flex-none flex-col gap-2 border-2 px-3 py-2.5 shadow-panel transition-colors duration-300 ${
        active ? 'border-toggle-red-500' : 'border-toggle-red-700'
      }`}
      style={{
        background:
          'repeating-linear-gradient(135deg, rgb(179 59 46 / 0.10) 0 14px, transparent 14px 28px), var(--crt-glass)',
        boxShadow: active ? '0 0 0 3px rgb(179 59 46 / 0.35), var(--shadow-panel)' : undefined,
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="bg-toggle-red-700 px-1.5 py-px font-mono text-[10px] tracking-[0.16em] text-cream-100">HOSTILE</span>
        <div className="font-display text-[15px] font-bold text-crt-white">{enemy.name.toUpperCase()}</div>
        {enemy.isBoss && <span className="font-mono text-[10px] tracking-[0.1em] text-amber-300">BOSS</span>}
        <span className="font-mono text-[11px] text-putty-400">DEPTH {enemy.depth}</span>
        <StatGauge label="Cockpit ⚡" value={cockpit.energy} max={cockpit.max} tone="danger" className="w-[200px]" />
        <span className="font-mono text-[11px] text-putty-400" title="Enemy attacks go to the player who attacked last">
          AGGRO →{' '}
          <motion.span
            key={aggro?.id ?? 'none'}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="inline-block font-bold"
            style={{ color: aggro?.accent ?? 'var(--crt-white)' }}
          >
            {aggro?.label ?? '—'}
          </motion.span>
        </span>
        {aiming && (
          <span className="ml-auto animate-pulse font-mono text-[11px] text-amber-300">◎ PICK A TARGET — outlined modules are in reach</span>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <div className="font-mono text-[9px] tracking-[0.24em] text-putty-500">BACK ▲</div>
          <ShipGrid
            ship={enemy.ship}
            facing="down"
            size="md"
            renderSlot={(slot) => {
              const reach = targets.includes(slot.index);
              return (
                <ModuleTile
                  slot={slot}
                  variant="compact"
                  fxKey={fxKey(side, slot.index)}
                  exposed={reach && aimed !== slot.index}
                  targeted={reach && aimed === slot.index}
                  dim={aiming && !reach && !slot.destroyed}
                  {...(reach && onTarget ? { onClick: () => onTarget(slot.index) } : {})}
                />
              );
            }}
          />
          <div className="font-mono text-[9px] tracking-[0.24em] text-toggle-red-300">▼ FRONT · FACING YOU</div>
        </div>
        <ActionDecks decks={decks} active={active} down={down} />
      </div>
    </motion.div>
  );
}

/** The enemy's next moves: one face-up card per down. A card turned flips in. */
function ActionDecks({ decks, active, down }: { decks: ActionDeck[]; active: boolean; down: number }) {
  return (
    <div className="flex flex-none flex-col gap-1">
      <div className="font-mono text-[9px] tracking-[0.14em] text-putty-400">ACTION DECKS · FACE UP · ONE PER DOWN</div>
      <div className="flex gap-1.5" style={{ perspective: 600 }}>
        {decks.map((deck, i) => {
          const card = getCard(deck.faceUp);
          const action = card?.kind === 'action' ? card.action : null;
          const current = active && i === down;
          const done = active && i < down;
          return (
            <motion.div
              key={i}
              animate={{ y: current ? -6 : 0, opacity: done ? 0.45 : 1 }}
              className={`relative h-[92px] w-[78px] border-2 ${
                current ? 'border-toggle-red-500 shadow-[0_0_14px_rgb(179_59_46/0.7)]' : 'border-n-900'
              }`}
              title={action ? `${card!.name} — ${ACTION_TEXT[action]}` : 'empty deck'}
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={`${deck.faceUp}-${deck.discardPile.length}-${deck.drawPile.length}`}
                  initial={{ rotateY: 90, opacity: 0.4 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: -90, opacity: 0, transition: { duration: 0.18 } }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="absolute inset-0 flex flex-col bg-cream-100 px-1.5 py-1"
                >
                  <div className="font-mono text-[8px] tracking-[0.12em] text-putty-700">DOWN {i + 1}</div>
                  <div className="mt-auto font-display text-[10px] leading-tight font-bold tracking-[0.02em] text-toggle-red-700">
                    {action ? ACTION_LABEL[action].toUpperCase() : '—'}
                  </div>
                  <div className="truncate text-[10px] text-putty-700">{card?.name ?? ''}</div>
                  <div className="font-mono text-[8px] text-putty-600">
                    {deck.drawPile
                      .map((id) => {
                        const next = getCard(id);
                        return next?.kind === 'action' ? ACTION_LABEL[next.action].slice(0, 3).toUpperCase() : '?';
                      })
                      .join(' › ')}
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
