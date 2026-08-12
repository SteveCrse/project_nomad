import { useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { ConfigSidebar } from '@/components/layout/ConfigSidebar';
import { PromptOverlay } from '@/components/game/PromptOverlay';
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
 * never have to hunt for where the game got to.
 */
export default function App() {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const autoFollow = useUiStore((s) => s.autoFollow);
  const phase = useGame()?.phase;

  useEffect(() => {
    if (!autoFollow || !phase) return;
    if (phase === 'combat') setTab('table');
    else if (phase === 'map' || phase === 'victory' || phase === 'defeat') setTab('mission');
  }, [phase, autoFollow, setTab]);

  const state = useGame();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-bg font-body text-text-primary">
      <TopBar />

      <div className="flex min-h-0 flex-1">
        <main className="relative box-border flex min-w-0 flex-1 flex-col p-5">
          {tab === 'mission' && <MissionView />}
          {tab === 'table' && <TableView />}
          {tab === 'builder' && <ShipBuilderView />}
          {tab === 'cards' && <CardBrowserView />}
          {state && <PromptOverlay state={state} />}
        </main>

        <ConfigSidebar />
      </div>
    </div>
  );
}
