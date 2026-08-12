import type { GameState, PlayerState } from '@engine/types';
import { Button } from '@/components/ds';
import { ModuleTile } from '@/components/game/ModuleTile';
import { ROLE_COLOR, ROLE_LABEL } from '@/lib/palette';
import { adjacencyFor, scrapCapacityFor } from '@/lib/combatView';
import { getPart } from '@data';
import { useConfig } from '@/store/configStore';
import { useGame, useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Ship Builder: the rearrangement-point screen. Modules hoarded in the Scrap
 * Deck get slotted into the grid here, and the GEN→RDS→WPN adjacency readout
 * is live rather than illustrative.
 */
export function ShipBuilderView() {
  const state = useGame();
  const builderPlayerId = useUiStore((s) => s.builderPlayerId);
  const setBuilderPlayer = useUiStore((s) => s.setBuilderPlayer);

  if (!state) {
    return <div className="p-4 text-[15px] text-putty-700">Start a run to build a ship.</div>;
  }

  const player =
    state.party.players.find((p) => p.id === builderPlayerId) ?? state.party.players[0];
  if (!player) return null;

  return (
    <div className="flex min-h-0 flex-1 gap-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3.5 flex items-baseline gap-3">
          <div className="font-display text-[20px] font-bold">SHIP BUILDER</div>
          <div className="flex gap-1.5">
            {state.party.players.map((p) => (
              <button
                key={p.id}
                onClick={() => setBuilderPlayer(p.id)}
                className={[
                  'cursor-pointer border px-2.5 py-[5px] font-mono text-[11px]',
                  p.id === player.id
                    ? 'border-n-900 bg-n-900 text-cream-100'
                    : 'border-putty-500 bg-putty-100 text-putty-700 hover:border-n-900',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>
          <BuilderStats player={player} />
        </div>

        <Grid player={player} />
      </div>

      <SidePanel state={state} player={player} />
    </div>
  );
}

function BuilderStats({ player }: { player: PlayerState }) {
  const config = useConfig();
  const filled = player.ship.slots.filter((s) => s.partId).length;
  const stored = player.ship.slots.reduce((sum, s) => sum + s.energy, 0);
  return (
    <div className="ml-auto flex gap-2.5 font-mono text-[12px] text-putty-700">
      <span>
        HULL {player.ship.hp}/{player.ship.hpMax}
      </span>
      <span>
        SLOTS {filled}/{player.ship.slots.length}
      </span>
      <span>⚡ {stored} STORED</span>
      <span>
        AP {player.ap}/{config.maxAp}
      </span>
    </div>
  );
}

function Grid({ player }: { player: PlayerState }) {
  const selectPart = useUiStore((s) => s.selectPart);
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const bonuses = adjacencyFor(player);

  return (
    <div className="flex flex-col gap-3.5 border-2 border-border-strong bg-surface-panel p-[18px] shadow-raised">
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${player.ship.gridCols}, minmax(0, 1fr))`,
          gridAutoRows: '104px',
        }}
      >
        {player.ship.slots.map((slot) => (
          <ModuleTile
            key={slot.index}
            slot={slot}
            variant="large"
            selected={!!slot.partId && slot.partId === selectedPartId}
            onClick={() => selectPart(slot.partId)}
          />
        ))}
      </div>

      <div className="flex items-stretch gap-3">
        <div className="flex flex-1 flex-col gap-1.5 border border-border-strong bg-crt-glass px-3 py-2.5">
          <div className="font-mono text-[10px] tracking-console text-crt-green-500">
            ADJACENCY BONUS · {bonuses.length > 0 ? 'ACTIVE' : 'NONE'}
          </div>
          <div className="text-[15px] leading-[1.35] text-crt-white">
            {bonuses.length > 0
              ? bonuses.map((b) => b.description).join(' ')
              : 'No unbroken GEN→RDS→WPN chain on this grid. Put a redistributor between a generator and a weapon.'}
          </div>
        </div>

        <div className="w-[260px] border border-putty-600 bg-putty-100 px-3 py-2.5 shadow-raised">
          <div className="mb-2 font-mono text-[10px] tracking-console text-putty-700">ROLE KEY</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[14px]">
            {(Object.keys(ROLE_COLOR) as (keyof typeof ROLE_COLOR)[]).map((role) => (
              <div key={role} className="flex items-center gap-1.5">
                <span className="h-3 w-3" style={{ background: ROLE_COLOR[role] }} />
                {ROLE_LABEL[role]}
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 border-2 border-n-900" />
              COCKPIT
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidePanel({ state, player }: { state: GameState; player: PlayerState }) {
  const config = useConfig();
  const rearrange = useGameStore((s) => s.rearrange);
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const selected = getPart(selectedPartId);
  const capacity = scrapCapacityFor(player, config);
  const canEdit = state.phase === 'rearrange' || state.phase === 'map' || state.phase === 'victory';

  return (
    <div className="flex w-[300px] flex-none flex-col gap-3.5">
      <div className="border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
        <div className="mb-2.5 flex items-baseline justify-between">
          <div className="font-display text-[13px] font-bold">SCRAP DECK</div>
          <div className="font-mono text-[12px] text-putty-700">
            {player.scrapDeck.length}/{capacity}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: capacity }, (_, i) => {
            const cardId = player.scrapDeck[i] ?? null;
            return (
              <ModuleTile
                key={i}
                slot={{ partId: cardId }}
                variant="scrap"
                selected={!!cardId && cardId === selectedPartId}
                onClick={() => selectPart(cardId)}
              />
            );
          })}
        </div>
        {selectedPartId && player.scrapDeck.includes(selectedPartId) && (
          <Button
            className="mt-2.5 w-full"
            size="sm"
            disabled={!canEdit}
            title={canEdit ? undefined : 'Only at a rearrangement point'}
            onClick={() => rearrange(player.id, selectedPartId, -1)}
          >
            Slot into first free position
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
        <div className="mb-2.5 font-display text-[13px] font-bold">
          SELECTED · {selected ? selected.name.toUpperCase() : 'NONE'}
        </div>

        {selected ? (
          <div className="flex flex-col gap-2 border border-border-strong bg-crt-glass p-2.5">
            <div className="flex flex-wrap gap-3.5 font-mono text-[12px] text-crt-white">
              <span>
                AP <span className="text-crt-green-500">{selected.apCost ?? '—'}</span>
              </span>
              <span>
                COST <span className="text-crt-green-500">{selected.energyCost ?? '—'}⚡</span>
              </span>
              <span>
                POOL <span className="text-crt-green-500">{selected.energyCapacity ?? '—'}</span>
              </span>
              <span>
                TIER <span style={{ color: 'var(--rarity-3)' }}>{selected.rarity}</span>
              </span>
            </div>
            <div className="text-[15px] leading-[1.35] text-crt-white">{selected.text}</div>
            {selected.status && (
              <div className="text-[13px] text-amber-300">{selected.status}</div>
            )}
          </div>
        ) : (
          <div className="text-[14px] text-putty-700">
            Select a module in the grid or the Scrap Deck.
          </div>
        )}
      </div>
    </div>
  );
}
