import { SEED_PLAYERS, SEED_SCRAP, getPart } from '@data';
import { Button } from '@/components/ds';
import { ModuleTile } from '@/components/game/ModuleTile';
import { ROLE_COLOR, ROLE_LABEL } from '@/lib/palette';
import { useConfig } from '@/store/configStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Ship Builder: the rearrangement-point screen. Modules hoarded in the Scrap
 * Deck get slotted into the grid here; the cap comes from config.scrapCap.
 */
export function ShipBuilderView() {
  const config = useConfig();
  const builderPlayerId = useUiStore((s) => s.builderPlayerId);
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);

  const player = SEED_PLAYERS.find((p) => p.id === builderPlayerId) ?? SEED_PLAYERS[1]!;
  const filled = player.slots.filter((s) => s.partId).length;
  const capacity = player.slots.length;
  const storedEnergy = player.slots.reduce((sum, s) => sum + (s.energy ?? 0), 0);
  const selected = getPart(selectedPartId);
  const scrapSlots = SEED_SCRAP.slice(0, config.scrapCap);
  const scrapFilled = scrapSlots.filter((s) => s.partId).length;

  return (
    <div className="flex min-h-0 flex-1 gap-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3.5 flex items-baseline gap-3">
          <div className="font-display text-[20px] font-bold">SHIP BUILDER</div>
          <div className="text-[17px] text-putty-700">
            {player.label} · {player.shipName}
          </div>
          <div className="ml-auto flex gap-2.5 font-mono text-[12px] text-putty-700">
            <span>
              SLOTS {filled}/{capacity}
            </span>
            <span>⚡ {storedEnergy} STORED</span>
            <span>
              AP {player.ap}/{config.maxAp}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3.5 border-2 border-border-strong bg-surface-panel p-[18px] shadow-raised">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${player.gridCols}, minmax(0, 1fr))`,
              gridAutoRows: '116px',
            }}
          >
            {player.slots.map((slot, i) => (
              <ModuleTile
                key={i}
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
                ADJACENCY BONUS · ACTIVE
              </div>
              <div className="text-[15px] leading-[1.35] text-crt-white">
                Fusion Reactor → Overflow Distributor → Laser Array forms an unbroken GEN→RDS→WPN
                chain. Rerouted ⚡ reaches the weapon at no AP cost.
              </div>
            </div>

            <div className="w-[260px] border border-putty-600 bg-putty-100 px-3 py-2.5 shadow-raised">
              <div className="mb-2 font-mono text-[10px] tracking-console text-putty-700">
                ROLE KEY
              </div>
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
      </div>

      <div className="flex w-[300px] flex-none flex-col gap-3.5">
        <div className="border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
          <div className="mb-2.5 flex items-baseline justify-between">
            <div className="font-display text-[13px] font-bold">SCRAP DECK</div>
            <div className="font-mono text-[12px] text-putty-700">
              {scrapFilled}/{config.scrapCap}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {scrapSlots.map((slot, i) => (
              <ModuleTile
                key={i}
                slot={slot}
                variant="scrap"
                selected={!!slot.partId && slot.partId === selectedPartId}
                onClick={() => selectPart(slot.partId)}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
          <div className="mb-2.5 font-display text-[13px] font-bold">
            SELECTED · {selected ? selected.name.toUpperCase() : 'NONE'}
          </div>

          {selected ? (
            <>
              <div className="flex flex-col gap-2 border border-border-strong bg-crt-glass p-2.5">
                <div className="flex gap-3.5 font-mono text-[12px] text-crt-white">
                  <span>
                    AP <span className="text-crt-green-500">{selected.apCost ?? '—'}</span>
                  </span>
                  <span>
                    ⚡{' '}
                    <span className="text-crt-green-500">
                      {selected.energyCapacity ?? '—'}/{selected.energyCapacity ?? '—'}
                    </span>
                  </span>
                  <span>
                    TIER <span style={{ color: 'var(--rarity-3)' }}>{selected.rarity}</span>
                  </span>
                </div>
                <div className="text-[15px] leading-[1.35] text-crt-white">{selected.text}</div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" size="sm">
                  Detach
                </Button>
                <Button variant="danger" size="sm">
                  Jettison
                </Button>
              </div>
            </>
          ) : (
            <div className="text-[14px] text-putty-700">
              Select a module in the grid or the Scrap Deck.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
