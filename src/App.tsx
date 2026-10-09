import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TopBar } from '@/components/layout/TopBar';
import { ConfigSidebar } from '@/components/layout/ConfigSidebar';
import { PromptOverlay } from '@/components/game/PromptOverlay';
import { DragLayer } from '@/components/fx/drag';
import { DiceOverlay } from '@/components/fx/DiceOverlay';
import { FxLayer } from '@/components/fx/FxLayer';
import { MissionView } from '@/views/MissionView';
import { TableView } from '@/views/TableView';
import { ShipBuilderView } from '@/views/ShipBuilderView';
import { CardBrowserView } from '@/views/CardBrowserView';
import { useGame } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Two-panel shell from the imported design: the game view on the left,
 * the config sidebar pinned to the right.
 *
 * The view follows the run's phase — walking into a fight puts you on the
 * table, finishing one puts you back on the map — because a playtester should
 * never have to hunt for where the game got to. Views slide rather than
 * swap, and three layers sit over everything: the card being dragged, the
 * dice being rolled, and the table's effects.
 */
export default function App() {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const autoFollow = useUiStore((s) => s.autoFollow);
  const phase = useGame()?.phase;

  useEffect(() => {
    if (!autoFollow || !phase) return;
    if (phase === 'combat') setTab('table');
    // The draft and the assembly both happen on the builder's grid.
    else if (phase === 'setup') setTab('builder');
    else if (phase === 'map' || phase === 'victory' || phase === 'defeat') setTab('mission');
  }, [phase, autoFollow, setTab]);

  const state = useGame();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-bg font-body text-text-primary">
      <TopBar />

      <div className="flex min-h-0 flex-1">
        <main className="relative box-border flex min-w-0 flex-1 flex-col overflow-hidden p-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              className="flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {tab === 'mission' && <MissionView />}
              {tab === 'table' && <TableView />}
              {tab === 'builder' && <ShipBuilderView />}
              {tab === 'cards' && <CardBrowserView />}
            </motion.div>
          </AnimatePresence>
          {state && <PromptOverlay state={state} />}
        </main>

        <ConfigSidebar />
      </div>

      <DiceOverlay />
      <FxLayer />
      <DragLayer />
    </div>
  );
}
