import type { GameState, PlayerState, SlotIndex } from '@engine/types';
import { ship as shipEngine } from '@engine';
import { EnemyPanel } from '@/components/game/EnemyPanel';
import { PlayerPanel } from '@/components/game/PlayerPanel';
import { ActionBar } from '@/components/game/ActionBar';
import { LogPanel } from '@/components/game/LogPanel';
import { DeckStack, DiscardStack, LootBag } from '@/components/game/DeckStack';
import { Button } from '@/components/ds';
import { RARITY_COLOR } from '@/lib/palette';
import { downsOf, moduleOptions, projectedEnergy } from '@/lib/combatView';
import { combat } from '@engine';
import { useConfig } from '@/store/configStore';
import { useGame, useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/**
 * The table during a fight: enemy ships up top, the active seat's controls in
 * the middle, seats along the bottom, transcript down the right.
 *
 * Out of combat it falls back to the deck counters, so the table is still
 * worth looking at between steps.
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

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {state.combat ? <CombatSurface state={state} /> : <IdleTable state={state} />}
      </div>
      <LogPanel log={state.log} className="w-[380px] flex-none" />
    </div>
  );
}

function CombatSurface({ state }: { state: GameState }) {
  const config = useConfig();
  const targetSlot = useUiStore((s) => s.targetSlot);
  const setTargetSlot = useUiStore((s) => s.setTargetSlot);
  const setTarget = useUiStore((s) => s.setTarget);
  const targetEnemyId = useUiStore((s) => s.targetEnemyId);

  const rerouteFrom = useUiStore((s) => s.rerouteFrom);
  const rerouteTransfers = useUiStore((s) => s.rerouteTransfers);
  const pickRerouteFrom = useUiStore((s) => s.pickRerouteFrom);
  const queueTransfer = useUiStore((s) => s.queueTransfer);

  const side = state.combat ? combat.currentSide(state.combat) : undefined;
  const downs = downsOf(state, side);
  const enemies = state.combat?.enemies ?? [];

  /**
   * Building a reroute pass on the seat's own grid: click a charged module,
   * then the neighbour it feeds. Clicking something that isn't a neighbour
   * picks it as the new source instead of refusing — the grid is the control.
   */
  const buildReroute = (player: PlayerState) => (slot: SlotIndex) => {
    const ship = player.ship;
    const charged = (index: SlotIndex) => projectedEnergy(ship, rerouteTransfers, index) > 0;

    if (rerouteFrom === null || rerouteFrom === slot || !shipEngine.areAdjacent(ship, rerouteFrom, slot)) {
      const pickable = rerouteFrom !== slot && !!ship.slots[slot]?.partId && charged(slot);
      pickRerouteFrom(pickable ? slot : null);
      return;
    }
    if (!ship.slots[slot]?.partId) return; // nothing there to feed
    queueTransfer({
      from: rerouteFrom,
      to: slot,
      amount: projectedEnergy(ship, rerouteTransfers, rerouteFrom),
    });
  };
  // The seat holding the turn sits directly under the action bar; the rest
  // keep seat order behind it.
  const participants = state.party.players
    .filter((p) => state.combat?.participants.includes(p.id))
    .sort((a, b) =>
      Number(side?.kind === 'player' && side.id === b.id) -
      Number(side?.kind === 'player' && side.id === a.id),
    );

  // Which of the active seat's modules could fire right now — drives the
  // green outline on the grid so the seat's real options are visible at a glance.
  const armed =
    side?.kind === 'player'
      ? moduleOptions(state, config, side, {
          ...(targetEnemyId ? { target: { kind: 'enemy', id: targetEnemyId } } : {}),
          ...(targetSlot !== null ? { targetSlot } : {}),
        })
          .filter((m) => !m.error)
          .map((m) => m.slot)
      : [];

  return (
    <>
      {/* A wide enemy grid scrolls in place rather than pushing the seats off-screen. */}
      <div className="flex flex-none gap-3 overflow-x-auto pb-1">
        {enemies.map((enemy) => (
          <EnemyPanel
            key={enemy.instanceId}
            enemy={enemy}
            active={side?.kind === 'enemy' && side.id === enemy.instanceId}
            targeted={targetEnemyId === enemy.instanceId}
            {...(side?.kind === 'enemy' && side.id === enemy.instanceId && downs
              ? { downs }
              : {})}
            onSelect={() => setTarget(enemy.instanceId)}
            onSlotClick={(slot) => {
              setTarget(enemy.instanceId);
              setTargetSlot(slot === targetSlot ? null : slot);
            }}
            targetSlot={targetEnemyId === enemy.instanceId ? targetSlot : null}
          />
        ))}
      </div>

      <TurnBanner state={state} />

      {side && <ActionBar state={state} side={side} />}

      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-auto">
        {participants.map((player) => {
          const holdsTurn = side?.kind === 'player' && side.id === player.id;
          return (
            <PlayerPanel
              key={player.id}
              player={player}
              active={holdsTurn}
              {...(holdsTurn && downs ? { downs } : {})}
              armedSlots={holdsTurn ? armed : []}
              // The seat's own grid doubles as the reroute control while it
              // holds the turn.
              {...(holdsTurn ? { onSlotClick: buildReroute(player) } : {})}
              selectedSlot={holdsTurn ? rerouteFrom : null}
              rerouteLinks={holdsTurn ? rerouteTransfers : []}
              compact
            />
          );
        })}
      </div>
    </>
  );
}

function TurnBanner({ state }: { state: GameState }) {
  const side = state.combat ? combat.currentSide(state.combat) : undefined;
  const downs = downsOf(state, side);
  const battle = state.combat ? { party: state.party, combat: state.combat } : null;
  const name = battle && side ? combat.sideName(battle, side) : '—';
  const toGo = downs ? Math.max(0, downs.threshold - downs.damageThisSet) : 0;

  return (
    <div className="flex flex-none items-center gap-4 border-2 border-border-strong bg-crt-glass px-3 py-2 font-mono text-[12px] text-crt-white">
      <span className="text-crt-green-500">ROUND {state.combat?.round ?? 0}</span>
      <span>
        TURN <span className="text-crt-green-500">{name}</span>
      </span>
      {downs && (
        <>
          <span>
            DOWN {Math.min(downs.used + 1, downs.total)}/{downs.total}
          </span>
          <span>
            SET {downs.damageThisSet}/{downs.threshold}
          </span>
          <span className={toGo === 0 ? 'text-crt-green-500' : 'text-amber-300'}>
            {toGo === 0 ? 'CONVERTS ON END SET' : `${toGo}⚔ TO CONVERT`}
          </span>
          {downs.conversions > 0 && (
            <span className="text-crt-green-500">CHAINED ×{downs.conversions}</span>
          )}
        </>
      )}
      {state.combat?.outcome && (
        <span className="ml-auto text-amber-300">{state.combat.outcome.toUpperCase()}</span>
      )}
    </div>
  );
}

/** Between fights: the decks, the loot bag and the seats as they stand. */
function IdleTable({ state }: { state: GameState }) {
  const config = useConfig();
  return (
    <>
      <div className="flex flex-none items-center justify-center gap-3.5 py-2">
        <DeckStack
          label="PARTS"
          accent="var(--role-gen)"
          caption={`${state.decks.parts.drawPile.length} LEFT`}
        />
        <DeckStack
          label="LOOT"
          accent="var(--crt-green-700)"
          caption={`${state.decks.items.drawPile.length} LEFT`}
        />
        <DeckStack
          label={'EVENTS'}
          accent="var(--amber-500)"
          caption={`${state.decks.events.drawPile.length} LEFT`}
        />
        <DiscardStack
          count={
            state.decks.parts.discardPile.length +
            state.decks.items.discardPile.length +
            state.decks.events.discardPile.length
          }
        />
        <LootBag maxRarity={state.maxRarityNow} colors={RARITY_COLOR} />
      </div>

      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-auto">
        {state.party.players.map((player) => (
          <PlayerPanel key={player.id} player={player} compact />
        ))}
      </div>

      <div className="flex-none font-mono text-[11px] text-putty-700">
        PHASE {state.phase.toUpperCase()} · HAND SIZE {config.handSize} · SCRAP CAP{' '}
        {config.scrapCap}
      </div>
    </>
  );
}
