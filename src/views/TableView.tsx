import { Tabletop } from '@/components/game/table/Tabletop';
import { Button } from '@/components/ds';
import { useGame, useGameStore } from '@/store/gameStore';

/**
 * The play screen: the tabletop, whatever the run is doing. In a fight the
 * enemy ship sits in the middle with its action decks; between fights the
 * same table shows the decks, the mission board and every seat's ship, and
 * moves are made on the board's step tiles.
 */
export function TableView() {
  const state = useGame();
  const newRun = useGameStore((s) => s.newRun);

  if (!state) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="font-display text-[20px] font-bold">NOTHING ON THE TABLE</div>
        <Button onClick={() => newRun()}>Start a run</Button>
      </div>
    );
  }

  return <Tabletop state={state} />;
}
