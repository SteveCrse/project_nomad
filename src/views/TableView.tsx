import { Tabletop } from '@/components/game/table/Tabletop';
import { useGame, useGameStore } from '@/store/gameStore';

/**
 * The game: the tabletop, whatever the run is doing. The draft is dealt into
 * its middle, the mission board lies across it, a fight puts the enemy ship
 * there with its action decks, and every seat's ship stays in front of it
 * from the first cockpit to the last rebuild.
 */
export function TableView() {
  const state = useGame();
  const newRun = useGameStore((s) => s.newRun);

  if (!state) {
    return (
      <div className="tt">
        <div className="tt-stage tt-bare">
          <div className="tt-bare-box">
            <div className="tt-turn">The table is empty</div>
            <p className="tt-note">
              Setting up deals the decks, lays out the mission board from the current config and opens the draft.
            </p>
            <button className="tt-btn pri" onClick={() => newRun()}>
              Set up a game
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <Tabletop state={state} />;
}
