import { AnimatePresence, motion } from 'motion/react';
import type { GameState, PlayerState, SlotIndex } from '@engine/types';
import { powerCostOf, printedLines, ship as shipEngine } from '@engine';
import { Button } from '@/components/ds';
import { FirstDownBadge } from '@/components/game/FirstDownBadge';
import { TIMING_CHIP } from '@/components/game/CardTile';
import { sizeReadout } from '@/lib/combatView';
import { CONTENT, getPart } from '@data';
import { useConfig } from '@/store/configStore';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/** The inspector, plus whatever can be done with the selected card right now. */
export function SelectedPanel({
  state,
  player,
  selectedSlot,
  onDone,
}: {
  state: GameState;
  player: PlayerState;
  selectedSlot: SlotIndex | null;
  onDone: () => void;
}) {
  const config = useConfig();
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const assemblePart = useGameStore((s) => s.assemblePart);
  const returnPart = useGameStore((s) => s.returnPart);
  const fitFromScrap = useGameStore((s) => s.fitFromScrap);
  const stowToScrap = useGameStore((s) => s.stowToScrap);
  const selected = getPart(selectedPartId);

  const drafting = state.phase === 'setup';
  const rebuilding = state.phase === 'rearrange';
  const inHold = !!selectedPartId && drafting && player.carriedParts.includes(selectedPartId);
  const inScrap = !!selectedPartId && player.scrapDeck.includes(selectedPartId);
  const gridSlot = selectedSlot !== null && player.ship.slots[selectedSlot]?.partId === selectedPartId ? selectedSlot : null;
  const isCockpitSlot = gridSlot !== null && gridSlot === shipEngine.cockpitIndex(player.ship);

  const room = !!selectedPartId && shipEngine.hasRoomFor(CONTENT, player.ship, selectedPartId, config.shipSizeRule);
  const spot = !!selectedPartId && !!shipEngine.bestCell(CONTENT, player.ship, selectedPartId);
  const fits = !!selectedPartId && selected?.role !== 'COCKPIT' && room && spot;
  const size = sizeReadout(player.ship, config);
  const whyNot = !room
    ? `No room — ${size.text.toLowerCase()}`
    : !spot
      ? 'Nowhere on the ship it may sit — check the layout rules'
      : undefined;

  const act = (fn: () => void) => {
    fn();
    selectPart(null);
    onDone();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
      <div className="mb-2.5 flex items-center gap-2 font-display text-[13px] font-bold">
        SELECTED · {selected ? selected.name.toUpperCase() : 'NONE'}
        {selected?.firstDown && <FirstDownBadge />}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selectedPartId ?? 'none'}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {selected ? (
            <div className="flex flex-col gap-2 border border-border-strong bg-crt-glass p-2.5">
              <div className="flex flex-wrap gap-3.5 font-mono text-[12px] text-crt-white">
                <span>
                  MAX <span className="text-crt-green-500">{selected.energyCapacity}⚡</span>
                </span>
                {selected.role === 'COCKPIT' ? (
                  <>
                    <span>
                      ATK <span className="text-crt-green-500">{selected.power ?? 0}⚔</span>
                    </span>
                    <span>
                      GEN <span className="text-crt-green-500">+{selected.genPerDown ?? 0}⚡</span>
                    </span>
                    {config.shipSizeRule === 'slots' && (
                      <span>
                        SLOTS <span className="text-crt-green-500">{selected.slots ?? 0}</span>
                      </span>
                    )}
                    {config.shipSizeRule === 'budget' && (
                      <span>
                        RATING <span className="text-crt-green-500">◆{selected.powerRating ?? 0}</span>
                      </span>
                    )}
                  </>
                ) : (
                  <span>
                    COST <span className="text-crt-green-500">{powerCostOf(selected)} TOKENS</span>
                  </span>
                )}
                <span>
                  TIER <span style={{ color: 'var(--rarity-3)' }}>{selected.rarity}</span>
                </span>
              </div>
              {printedLines(selected).map((line, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className="mt-0.5 flex-none font-mono text-[10px] tracking-[0.08em]"
                    style={{ color: TIMING_CHIP[line.timing].color }}
                  >
                    {TIMING_CHIP[line.timing].label}
                  </span>
                  <span className="text-[15px] leading-[1.35] text-crt-white">{line.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[14px] text-putty-700">
              Drag a card onto a lit cell of the ship, or click it and then click the cell it goes in.
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-2.5 flex flex-col gap-2">
        {selectedPartId && inHold && (
          <Button size="sm" disabled={!fits} title={whyNot} onClick={() => act(() => assemblePart(player.id, selectedPartId, null))}>
            Fit where it fits best
          </Button>
        )}
        {selectedPartId && inScrap && rebuilding && (
          <Button
            size="sm"
            disabled={selected?.role !== 'COCKPIT' && !fits}
            onClick={() => act(() => fitFromScrap(player.id, selectedPartId, null))}
            title={selected?.role === 'COCKPIT' ? 'The old cockpit goes into the scrap deck in its place' : whyNot}
          >
            {selected?.role === 'COCKPIT' ? 'Install as cockpit' : 'Fit where it fits best'}
          </Button>
        )}
        {gridSlot !== null && !isCockpitSlot && drafting && (
          <Button size="sm" variant="secondary" onClick={() => act(() => returnPart(player.id, gridSlot))}>
            Pull back into the hold
          </Button>
        )}
        {gridSlot !== null && !isCockpitSlot && rebuilding && (
          <Button size="sm" variant="secondary" onClick={() => act(() => stowToScrap(player.id, gridSlot))}>
            Stow in the scrap deck
          </Button>
        )}
      </div>
    </div>
  );
}
