import { AnimatePresence, motion } from 'motion/react';
import { TopBar } from '@/components/layout/TopBar';
import { ConfigSidebar } from '@/components/layout/ConfigSidebar';
import { DragLayer } from '@/components/fx/drag';
import { DiceOverlay } from '@/components/fx/DiceOverlay';
import { FxLayer } from '@/components/fx/FxLayer';
import { TableView } from '@/views/TableView';
import { CardBrowserView } from '@/views/CardBrowserView';
import { useUiStore } from '@/store/uiStore';

/**
 * Two-panel shell: the table on the left, the config sidebar pinned to the
 * right.
 *
 * The whole game is played on the one table — the draft, the mission board,
 * every fight, loot, events and rebuilding — so there is nothing to follow
 * from view to view. The only other tab is the card editor, which is the
 * designer's desk rather than the game. Three layers sit over everything: the
 * card being dragged, the dice being rolled, and the table's effects.
 */
export default function App() {
  const tab = useUiStore((s) => s.tab);

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
              {tab === 'table' && <TableView />}
              {tab === 'cards' && <CardBrowserView />}
            </motion.div>
          </AnimatePresence>
        </main>

        <ConfigSidebar />
      </div>

      <DiceOverlay />
      <FxLayer />
      <DragLayer />
    </div>
  );
}
