import { useEffect, useMemo } from 'react';
import type { DownAction, GameState, SideRef } from '@engine/types';
import { ship as shipEngine } from '@engine';
import { Button } from '@/components/ds';
import { ROLE_COLOR } from '@/lib/palette';
import { cockpitOptions, moduleOptions, shieldOptions } from '@/lib/combatView';
import { useConfig } from '@/store/configStore';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';
import { CONTENT, getPart } from '@data';

/**
 * The seat's control panel for one down.
 *
 * Every button is gated by the engine's own legality check, and the refusal
 * reason is what the tooltip shows — the point of a playtest tool is to make
 * "why can't I do that?" answerable without reading the rules doc.
 */
export function ActionBar({ state, side }: { state: GameState; side: SideRef }) {
  const config = useConfig();
  const takeDown = useGameStore((s) => s.takeDown);
  const endTurn = useGameStore((s) => s.endTurn);
  const enemyStep = useGameStore((s) => s.enemyStep);
  const enemyTurn = useGameStore((s) => s.enemyTurn);
  const error = useGameStore((s) => s.error);

  const targetEnemyId = useUiStore((s) => s.targetEnemyId);
  const targetSlot = useUiStore((s) => s.targetSlot);
  const diceCount = useUiStore((s) => s.diceCount);
  const manualDamage = useUiStore((s) => s.manualDamage);
  const setTarget = useUiStore((s) => s.setTarget);
  const setDiceCount = useUiStore((s) => s.setDiceCount);
  const setManualDamage = useUiStore((s) => s.setManualDamage);
  const clearReroute = useUiStore((s) => s.clearReroute);

  // A half-built reroute pass belongs to the down it was started on.
  const holder = `${side.kind}:${side.id}`;
  useEffect(() => {
    clearReroute();
  }, [holder, clearReroute]);

  const enemies = state.combat?.enemies.filter((e) => !e.ship.destroyed) ?? [];
  const target: SideRef | undefined = useMemo(() => {
    const chosen = targetEnemyId && enemies.find((e) => e.instanceId === targetEnemyId);
    const fallback = enemies[0];
    const pick = chosen || fallback;
    return pick ? { kind: 'enemy', id: pick.instanceId } : undefined;
  }, [targetEnemyId, enemies]);

  const choice = {
    ...(target ? { target } : {}),
    ...(targetSlot !== null ? { targetSlot } : {}),
    diceCount,
    manualDamage,
  };

  const modules = moduleOptions(state, config, side, choice);
  const shields = shieldOptions(state, config, side);
  const cockpit = cockpitOptions(state, config, side, choice);
  const active = modules.filter((m) => m.part.partType === 'active-module');
  const hasVariableDice = active.some((m) => m.part.dice?.count === 'variable');
  const hasManual = active.some((m) => m.manual);

  if (side.kind === 'enemy') {
    const enemy = state.combat?.enemies.find((e) => e.instanceId === side.id);
    return (
      <Shell title={`${enemy?.name ?? 'ENEMY'} HOLDS THE TURN`} tone="danger">
        <div className="text-[14px] text-putty-700">
          The enemy spends its downs greedily: biggest legal gun first, then defence, then a
          top-up. Step it one down at a time to read the maths, or resolve the whole turn.
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={enemyStep}>
            Resolve 1 down
          </Button>
          <Button size="sm" variant="danger" onClick={enemyTurn}>
            Resolve enemy turn
          </Button>
        </div>
      </Shell>
    );
  }

  const fire = (action: DownAction) => takeDown(action);

  return (
    <Shell title="YOUR DOWN" tone="accent">
      {enemies.length > 1 && (
        <Row label="TARGET">
          {enemies.map((e) => (
            <Chip
              key={e.instanceId}
              active={target?.id === e.instanceId}
              onClick={() => setTarget(e.instanceId)}
            >
              {e.name} · {shipEngine.shieldPool(CONTENT, e.ship)}⚡
            </Chip>
          ))}
        </Row>
      )}

      {/*
        The cockpit's two downs. Neither costs ⚡, so this row is never empty
        and never greyed out for want of charge — it is what a seat spends a
        down on when the guns are dry.
      */}
      {cockpit && (
        <Row label="COCKPIT">
          <button
            disabled={!!cockpit.attack.error}
            title={cockpit.attack.error ?? `Basic attack — ${cockpit.power}⚔ for one down, no ⚡`}
            onClick={() => fire(cockpit.attack.action)}
            className={[
              'flex min-w-[132px] cursor-pointer flex-col items-start gap-0.5 border px-2 py-1.5 text-left',
              'disabled:cursor-not-allowed disabled:opacity-45',
              cockpit.attack.error
                ? 'border-putty-500 bg-putty-200'
                : 'border-n-900 bg-putty-100 shadow-raised',
            ].join(' ')}
            style={{ borderLeft: `4px solid ${ROLE_COLOR.WPN}` }}
          >
            <span className="text-[13px] leading-none font-semibold">Basic attack</span>
            <span className="font-mono text-[10px] text-putty-700">
              FREE · {cockpit.power}⚔
            </span>
          </button>

          <button
            disabled={!!cockpit.generate.error}
            title={
              cockpit.generate.error ??
              `Run the basic generator — +${cockpit.generation}⚡ onto the cockpit shield`
            }
            onClick={() => fire(cockpit.generate.action)}
            className={[
              'flex min-w-[132px] cursor-pointer flex-col items-start gap-0.5 border px-2 py-1.5 text-left',
              'disabled:cursor-not-allowed disabled:opacity-45',
              cockpit.generate.error
                ? 'border-putty-500 bg-putty-200'
                : 'border-n-900 bg-putty-100 shadow-raised',
            ].join(' ')}
            style={{ borderLeft: `4px solid ${ROLE_COLOR.GEN}` }}
          >
            <span className="text-[13px] leading-none font-semibold">Run generator</span>
            <span className="font-mono text-[10px] text-putty-700">
              FREE · +{cockpit.generation}⚡ · SHIELD {cockpit.charge}/{cockpit.capacity}
            </span>
          </button>

          {(cockpit.attack.error || cockpit.generate.error) && (
            <span className="font-mono text-[10px] text-toggle-red-500">
              {cockpit.attack.error ?? cockpit.generate.error}
            </span>
          )}
        </Row>
      )}

      <Row label="MODULES">
        {active.length === 0 && (
          <span className="text-[13px] text-putty-700">
            No active modules fitted — the cockpit is all this ship has.
          </span>
        )}
        {active.map((m) => (
          <button
            key={m.slot}
            disabled={!!m.error}
            title={m.error ?? m.part.text}
            onClick={() => fire(m.action)}
            className={[
              'flex min-w-[132px] cursor-pointer flex-col items-start gap-0.5 border px-2 py-1.5 text-left',
              'disabled:cursor-not-allowed disabled:opacity-45',
              m.error ? 'border-putty-500 bg-putty-200' : 'border-n-900 bg-putty-100 shadow-raised',
            ].join(' ')}
            style={{ borderLeft: `4px solid ${ROLE_COLOR[m.part.role]}` }}
          >
            <span className="text-[13px] leading-none font-semibold">{m.part.name}</span>
            <span className="font-mono text-[10px] text-putty-700">
              {m.energyCost > 0 ? `${m.energyCost}⚡` : 'FREE'}
              {m.part.power ? ` · ${m.part.power}⚔` : ''}
              {m.part.dice ? ` · ${m.part.dice.count === 'variable' ? diceCount : m.part.dice.count}${m.part.dice.die}` : ''}
              {m.needsModuleTarget ? ' · MODULE' : ''}
              {m.manual ? ' · MANUAL' : ''}
            </span>
            {m.error && (
              <span className="font-mono text-[10px] text-toggle-red-500">{m.error}</span>
            )}
          </button>
        ))}
      </Row>

      {(hasVariableDice || hasManual) && (
        <Row label="SPEND">
          {hasVariableDice && (
            <Stepper label="DICE" value={diceCount} onChange={setDiceCount} min={1} max={10} />
          )}
          {hasManual && (
            <Stepper
              label="MANUAL ⚔"
              value={manualDamage}
              onChange={setManualDamage}
              min={0}
              max={40}
            />
          )}
        </Row>
      )}

      {shields.length > 0 && (
        <Row label="SHIELDS">
          {shields.map((s) => (
            <button
              key={s.slot}
              disabled={!!s.error}
              title={s.error ?? `Charge ${s.part.name} by 1⚡`}
              onClick={() => fire({ type: 'charge-shield', slot: s.slot, amount: 1 })}
              className="cursor-pointer border border-putty-600 bg-putty-100 px-2.5 py-1.5 font-mono text-[11px] disabled:cursor-not-allowed disabled:opacity-45"
            >
              CHARGE {s.part.name.toUpperCase()} +1⚡
            </button>
          ))}
        </Row>
      )}

      <RerouteRow state={state} side={side} onFire={fire} />

      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => fire({ type: 'pass' })}>
          Spend down · hold
        </Button>
        <Button size="sm" variant="primary" onClick={endTurn}>
          End set
        </Button>
        {error && <span className="font-mono text-[11px] text-toggle-red-500">{error}</span>}
      </div>
    </Shell>
  );
}

/**
 * The reroute pass.
 *
 * One down buys the whole pass: charge may leave every module once, and only
 * ever to a neighbour. Legs are picked on the seat's own grid below (source,
 * then the neighbour it feeds) and resolve in the order they were queued, so
 * a generator can fill a redistributor that then fills a gun in one down.
 */
function RerouteRow({
  state,
  side,
  onFire,
}: {
  state: GameState;
  side: SideRef;
  onFire: (action: DownAction) => void;
}) {
  const transfers = useUiStore((s) => s.rerouteTransfers);
  const rerouteFrom = useUiStore((s) => s.rerouteFrom);
  const dropTransfer = useUiStore((s) => s.dropTransfer);
  const clearReroute = useUiStore((s) => s.clearReroute);

  const player = state.party.players.find((p) => p.id === side.id);
  if (!player) return null;

  const free = shipEngine.hasFreeReroute(CONTENT, player.ship);
  const nameAt = (slot: number) => getPart(player.ship.slots[slot]?.partId)?.name ?? '—';
  const pending = rerouteFrom !== null;

  return (
    <Row label="REROUTE">
      {transfers.map((t, i) => (
        <button
          key={`${t.from}-${t.to}-${i}`}
          onClick={() => dropTransfer(i)}
          title="Drop this link"
          className="cursor-pointer border border-n-900 bg-putty-100 px-2.5 py-1.5 font-mono text-[11px] shadow-raised"
        >
          {nameAt(t.from).toUpperCase()} → {nameAt(t.to).toUpperCase()} ×
        </button>
      ))}

      <span className="text-[13px] text-putty-700">
        {pending
          ? `${nameAt(rerouteFrom).toUpperCase()} picked — click a neighbour to feed it.`
          : transfers.length === 0
            ? 'Click a charged module on your grid, then the neighbour it feeds.'
            : 'Add more links, or commit the pass.'}
      </span>

      {transfers.length > 0 && (
        <>
          <Button
            size="sm"
            onClick={() => {
              onFire({ type: 'reroute-energy', transfers });
              clearReroute();
            }}
          >
            Reroute · {free ? 'free' : '1 down'}
          </Button>
          <Button size="sm" variant="ghost" onClick={clearReroute}>
            Clear
          </Button>
        </>
      )}
    </Row>
  );
}

function Shell({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'accent' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-2 border-2 bg-surface-panel px-3 py-2.5 shadow-raised"
      style={{
        borderColor: tone === 'danger' ? 'var(--toggle-red-500)' : 'var(--accent-primary)',
      }}
    >
      <div className="font-display text-[13px] font-bold tracking-[0.04em]">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-[70px] flex-none pt-1.5 font-mono text-[10px] tracking-console text-putty-700">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'cursor-pointer border px-2.5 py-1 font-mono text-[11px]',
        active ? 'border-n-900 bg-n-900 text-cream-100' : 'border-putty-500 bg-putty-100',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-1.5 border border-putty-600 bg-putty-100 px-2 py-1">
      <span className="font-mono text-[10px] tracking-[0.08em] text-putty-700">{label}</span>
      <button
        className="cursor-pointer px-1 font-mono text-[13px]"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="w-5 text-center font-mono text-[13px]">{value}</span>
      <button
        className="cursor-pointer px-1 font-mono text-[13px]"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}
