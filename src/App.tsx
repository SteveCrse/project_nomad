import { TopBar } from '@/components/layout/TopBar';
import { ConfigSidebar } from '@/components/layout/ConfigSidebar';
import { TableView } from '@/views/TableView';
import { ShipBuilderView } from '@/views/ShipBuilderView';
import { CardBrowserView } from '@/views/CardBrowserView';
import { useUiStore } from '@/store/uiStore';

/**
 * Two-panel shell from the imported design: the game view on the left,
 * the config sidebar pinned to the right.
 */
export default function App() {
  const tab = useUiStore((s) => s.tab);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-bg font-body text-text-primary">
      <TopBar />

      <div className="flex min-h-0 flex-1">
        <main className="relative box-border flex min-w-0 flex-1 flex-col p-5">
          {tab === 'table' && <TableView />}
          {tab === 'builder' && <ShipBuilderView />}
          {tab === 'cards' && <CardBrowserView />}
        </main>

        <ConfigSidebar />
      </div>
    </div>
  );
}
