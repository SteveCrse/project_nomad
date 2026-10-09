import type { GameConfig, GameState, PlayerState } from '@engine/types';
import { Button } from '@/components/ds';
import { cockpitStats, sizeReadout } from '@/lib/combatView';
import { useGameStore } from '@/store/gameStore';

/** Standing in for the prompt while the ship is rebuilt. */
export function RebuildBar({ state }: { state: GameState }) {
  const closePrompt = useGameStore((s) => s.closePrompt);
  const error = useGameStore((s) => s.error);
  const missionEnd = state.prompt?.kind === 'rearrange' && state.prompt.reason === 'mission-end';
  return (
    <div className="mb-3 flex flex-none flex-wrap items-center gap-3 border-2 border-border-strong bg-crt-glass px-3 py-2.5">
      <span className="font-mono text-[10px] tracking-console text-crt-green-500">
        {missionEnd ? 'MISSION END · REBUILD' : 'REARRANGEMENT POINT'}
      </span>
      <span className="text-[15px] text-crt-white">
        Build from what you fly and your scrap deck: drag modules on and off the grid, move them around, or drop a
        cockpit from the scrap deck onto yours to install it.
      </span>
      {error && <span className="font-mono text-[11px] text-toggle-red-300">{error}</span>}
      <div className="ml-auto">
        <Button size="sm" onClick={closePrompt}>
          {missionEnd ? 'End mission' : 'Push on'}
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- grid

export function BuilderStats({ player, config, drafting }: { player: PlayerState; config: GameConfig; drafting: boolean }) {
  const size = sizeReadout(player.ship, config);
  const cockpit = cockpitStats(player.ship);
  const part = cockpit.part;
  return (
    <div className="ml-auto flex flex-wrap gap-2.5 font-mono text-[12px] text-putty-700">
      <span title="The cockpit is the ship: attack, generate output, ⚡">
        COCKPIT {part?.power ?? 0}⚔ · +{part?.genPerDown ?? 0}⚡ · {cockpit.energy}/{cockpit.max}⚡
      </span>
      <span title="Ship size under the rule in play" className={size.over ? 'text-toggle-red-500' : undefined}>
        {size.text}
      </span>
      {drafting && <span>TOKENS {player.tokens}</span>}
    </div>
  );
}
