import { AnimatePresence, motion } from 'motion/react';
import type { CardId, PlayerState } from '@engine/types';
import { Button } from '@/components/ds';
import { ModuleTile } from '@/components/game/ModuleTile';
import { dragSource, useDragStore, useDropZone, type DragPayload } from '@/components/fx/drag';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

// ------------------------------------------------------------------- racks

/** Leftover tokens, waiting to go on the ship as starting ⚡. */
export function EnergyPool({ player }: { player: PlayerState }) {
  const autoEnergy = useGameStore((s) => s.autoEnergy);
  const error = useGameStore((s) => s.error);
  const dragging = useDragStore((s) => s.payload?.kind === 'token');
  return (
    <div className={`border-2 bg-crt-glass p-3 shadow-raised transition-colors ${dragging ? 'border-crt-green-500' : 'border-border-strong'}`}>
      <div className="mb-1 flex items-baseline justify-between">
        <div className="font-display text-[13px] font-bold text-crt-white">STARTING ENERGY</div>
        <div className="font-mono text-[12px] text-crt-green-500">{player.tokens} LEFT</div>
      </div>
      <div className="mb-2 text-[13px] leading-[1.3] text-putty-400">
        Tokens you didn’t spend. Drag one onto a module — up to its max — or use the module’s + and −.
      </div>
      <div className="mb-2 flex min-h-6 flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {Array.from({ length: player.tokens }, (_, i) => (
            <motion.div
              key={i}
              layout
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="h-6 w-6 cursor-grab rounded-full border-2 border-crt-green-700 bg-crt-green-500 shadow-[0_0_8px_rgb(159_217_160/0.6)] active:cursor-grabbing"
              {...dragSource({ kind: 'token' }, () => (
                <div className="h-6 w-6 rounded-full border-2 border-crt-green-700 bg-crt-green-500 shadow-[0_0_12px_rgb(159_217_160/0.9)]" />
              ))}
            />
          ))}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={player.tokens === 0} onClick={() => autoEnergy(player.id)}>
          Spread them for me
        </Button>
        {error && <span className="font-mono text-[11px] text-toggle-red-300">{error}</span>}
      </div>
    </div>
  );
}

/** The hold (setup) or the scrap deck (everywhere else): cards off the ship. */
export function CardRack({
  id,
  title,
  count,
  cards,
  empty,
  kind,
  canDrag,
  zone,
}: {
  id: string;
  title: string;
  count: string;
  cards: CardId[];
  empty: string;
  kind: 'hold' | 'scrap';
  canDrag: boolean;
  zone: { accepts: (p: DragPayload) => boolean; onDrop: (p: DragPayload) => void } | null;
}) {
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const drop = useDropZone(id, zone);

  return (
    <div
      {...drop.props}
      className={`border-2 bg-surface-panel p-3 shadow-raised transition-[border-color,background-color] duration-150 ${
        drop.over ? 'border-accent-primary bg-crt-green-300/30' : drop.active ? 'border-accent-primary' : 'border-border-strong'
      }`}
    >
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="font-display text-[13px] font-bold">{title}</div>
        <div className="font-mono text-[12px] text-putty-700">{count}</div>
      </div>
      {cards.length === 0 ? (
        <div className="text-[14px] text-putty-700">{drop.active ? 'Drop it here.' : empty}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: '128px' }}>
          <AnimatePresence initial={false} mode="popLayout">
            {cards.map((cardId, i) => (
              <motion.div key={`${cardId}-${i}`} layout exit={{ opacity: 0, scale: 0.8 }}>
                <ModuleTile
                  slot={{ partId: cardId }}
                  variant="scrap"
                  selected={cardId === selectedPartId}
                  flyKey={`card:${cardId}`}
                  {...dragSource(canDrag ? { kind, cardId } : null, () => <ModuleTile slot={{ partId: cardId }} variant="scrap" />)}
                  onClick={() => selectPart(cardId === selectedPartId ? null : cardId)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
