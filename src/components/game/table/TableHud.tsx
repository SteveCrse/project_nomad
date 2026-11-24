import { useEffect, useState } from 'react';
import type { GameState } from '@engine/types';
import { ACTION_TEXT, combat, hitChance, ship as shipEngine, spendRange } from '@engine';
import { CONTENT, getCard, getPart } from '@data';
import { reviveOptions, scrapCapacityFor } from '@/lib/combatView';
import { useGameStore, type RollEvent } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';
import { cardAims, type TablePlay } from './play';
import type { Camera } from './useCamera';

/**
 * The screen's own panel, under the table: whose turn and which down, what's
 * happening and what was rolled, the buttons for the down in hand, and the
 * view controls with the crew. Nothing here is a component of the game — it's
 * everything the table would otherwise have to say out loud.
 */
export function TableHud({ play, camera }: { play: TablePlay; camera: Camera }) {
  const { state, config, fight, side, staged, mode, busy } = play;
  const error = useGameStore((s) => s.error);
  const endTurn = useGameStore((s) => s.endTurn);
  const throwDice = useGameStore((s) => s.throwDice);
  const restage = useGameStore((s) => s.restage);
  const takeDown = useGameStore((s) => s.takeDown);
  const note = useUiStore((s) => s.tableNote);
  const landed = useUiStore((s) => s.rollsLanded);
  const setMode = useUiStore((s) => s.setCombatMode);
  const manualDamage = useUiStore((s) => s.manualDamage);
  const setManualDamage = useUiStore((s) => s.setManualDamage);
  const toggleTweaks = useUiStore((s) => s.toggleTweaks);
  const tweaksOpen = useUiStore((s) => s.tweaksOpen);
  const setViewSeat = useUiStore((s) => s.setViewSeat);
  const game = useGameStore();
  const [fullLog, setFullLog] = useState(false);
  const { build, loot } = play;
  const setup = state.setup;
  const prompt = state.prompt;

  const enemy = side?.kind === 'enemy';
  const battle = fight ? { party: state.party, combat: fight } : null;
  const label = (id: string | null | undefined) => state.party.players.find((p) => p.id === id)?.label ?? '—';
  const waiting = !!staged && !staged.thrown;
  const over = fight && !fight.outcome ? fight.turnOver : null;

  // Esc drops what's in hand; Enter or Space throws dice that are waiting, or ends a finished turn.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.('input, textarea, select, button, [role="button"]')) return;
      if (e.key === 'Escape') play.cancel();
      else if (e.key === 'Enter' || e.key === ' ') {
        if (waiting) {
          e.preventDefault();
          throwDice();
        } else if (over && !busy && e.key === 'Enter') endTurn();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  /* ---- whose turn ---- */
  let turnBox: React.ReactNode;
  if (fight && battle) {
    const total = config.downCount;
    const after = (id: string | null) => label(combat.seatAfter(battle, id));
    turnBox = (
      <>
        <div className="tt-hud-k">
          {fight.outcome ? 'Fight over' : enemy ? 'Enemy turn' : `${combat.sideName(battle, fight.turn)}'s turn`} · round {fight.round}
        </div>
        <div className={`tt-turn${enemy ? ' enemy' : ''}`}>
          {fight.outcome
            ? fight.outcome === 'victory'
              ? 'Enemy ship down'
              : 'Every cockpit is gone'
            : enemy
              ? `Enemy down ${fight.down + 1}`
              : over === 'first-down'
                ? '1st down!'
                : over === 'destroyed'
                  ? 'Shot down'
                  : over
                    ? 'Out of downs'
                    : `Down ${fight.down + 1} of ${total}`}
        </div>
        <div className="tt-pips">
          {Array.from({ length: total }, (_, d) => (
            <div key={d} className={`tt-pip${d < fight.down ? ' used' : ''}${d === fight.down && !over && !fight.outcome ? ` now${enemy ? ' enemy' : ''}` : ''}`}>
              {d + 1}
            </div>
          ))}
        </div>
        {!fight.outcome && (
          <p className="tt-note">
            <b>1st down:</b>{' '}
            {enemy
              ? `the enemy starts again at down 1. After down ${total}: ${after(fight.handedBy)}.`
              : `${after(fight.turn.id)} goes next. Out of downs: the enemy's turn.`}
          </p>
        )}
      </>
    );
  } else if (build.drafting && setup) {
    turnBox = (
      <>
        <div className="tt-hud-k">Setup · sector {state.sector}</div>
        <div className="tt-turn">
          {setup.complete ? 'Starting energy' : setup.round === 0 ? 'Cockpit round' : `Module round ${setup.round} of ${config.draftRounds}`}
        </div>
        {!setup.complete && (
          <div className="tt-pips">
            {setup.order.map((id) => (
              <div key={id} className={`tt-pip${id === build.drafter ? ' now' : setup.picked.includes(id) ? ' used' : ''}`}>
                {label(id)}
              </div>
            ))}
          </div>
        )}
        <p className="tt-note">
          {setup.complete
            ? 'Tokens nobody spent go on the modules as starting energy. Any left over when the mission starts are lost.'
            : setup.round === 0
              ? 'Cockpits are free. Pick order reverses every round.'
              : 'A module costs 1 to 3 tokens. Every token kept is starting energy.'}
        </p>
      </>
    );
  } else {
    turnBox = (
      <>
        <div className="tt-hud-k">Sector {state.sector}</div>
        <div className="tt-turn">{PHASE[state.phase]}</div>
        <p className="tt-note">
          Rarity up to <b>{state.maxRarityNow}</b>. Hand size <b>{config.handSize}</b>, scrap cap <b>{config.scrapCap}</b>.
        </p>
      </>
    );
  }

  /* ---- what's happening ---- */
  const shown: RollEvent[] = staged
    ? staged.rolls.slice(0, landed)
    : fight
      ? lastRolls(state)
      : [];
  const log = fullLog ? state.log.slice(-40).reverse() : state.log.slice(-3).reverse();

  /* ---- actions ---- */
  const acts: React.ReactNode[] = [];
  const attack = waiting && staged?.action?.type === 'attack' ? staged.action : null;
  if (staged) {
    if (attack && play.acting) {
      const gunSlot = play.acting.ship.slots[attack.slot];
      const gun = getPart(gunSlot?.partId);
      const range = gun && gunSlot ? spendRange(gun, gunSlot.energy) : null;
      const spend = attack.spend ?? range?.max ?? 0;
      if (range && range.max > range.min) {
        acts.push(
          <div className="tt-spend" key="spend">
            <button className="tt-btn" aria-label="Spend less" disabled={spend <= range.min} onClick={() => restage({ ...attack, spend: spend - 1 })}>
              −
            </button>
            <span className="n">{spend}⚡</span>
            <button className="tt-btn" aria-label="Spend more" disabled={spend >= range.max} onClick={() => restage({ ...attack, spend: spend + 1 })}>
              +
            </button>
            <span className="odds">
              from {gun?.name} · hits on ≤ {Math.min(spend, 6)} ({Math.round(hitChance(spend) * 100)}%)
            </span>
          </div>,
        );
      }
    }
    acts.push(
      <button key="roll" className={`tt-btn pri${waiting ? ' pulse' : ''}`} disabled={!waiting} onClick={throwDice}>
        {!waiting ? 'Rolling…' : attack ? 'Spend and roll' : enemy ? 'Roll for the enemy' : 'Roll the die'}
      </button>,
    );
    if (waiting && staged.action) {
      acts.push(
        <button key="cancel" className="tt-btn" onClick={play.cancel}>
          Cancel
        </button>,
      );
    }
  } else if (fight && !fight.outcome && enemy) {
    acts.push(
      <button key="wait" className="tt-btn" disabled>
        Enemy is playing…
      </button>,
    );
  } else if (fight && !fight.outcome && play.acting && side) {
    if (over) {
      acts.push(
        <button key="end" className="tt-btn pri pulse" disabled={busy} onClick={endTurn}>
          End turn → {over === 'first-down' && battle ? label(combat.seatAfter(battle, side.id)) : 'enemy'}
        </button>,
      );
    } else if (mode?.kind === 'reroute') {
      const moved = play.moves.reduce((n, m) => n + m.amount, 0);
      acts.push(
        <button key="finish" className="tt-btn pri pulse" disabled={busy || !!play.rerouteError} title={play.rerouteError ?? undefined} onClick={play.finishReroute}>
          Finish reroute ({moved}⚡ moved)
        </button>,
        <button
          key="undo"
          className="tt-btn"
          onClick={() => {
            // One marker back at a time.
            const last = play.moves[play.moves.length - 1];
            const rest = !last ? [] : last.amount > 1 ? [...play.moves.slice(0, -1), { ...last, amount: last.amount - 1 }] : play.moves.slice(0, -1);
            setMode(rest.length > 0 ? { ...mode, moves: rest } : null);
          }}
        >
          Undo
        </button>,
        <button key="undo-all" className="tt-btn" onClick={() => setMode(null)}>
          Undo all
        </button>,
      );
    } else if (mode) {
      if (mode.kind === 'item' && mode.cardId && !cardAims(mode.cardId, manualDamage)) {
        const cardId = mode.cardId;
        acts.push(
          <button
            key="play"
            className="tt-btn pri"
            disabled={busy}
            onClick={() => {
              if (takeDown({ type: 'play-card', cardId, ...(manualDamage > 0 ? { manualDamage } : {}) })) setMode(null);
            }}
          >
            Play {getCard(cardId)?.name}
          </button>,
        );
      }
      if ((mode.kind === 'item' || mode.kind === 'use') && hasManual(play)) {
        acts.push(
          <div className="tt-spend" key="manual">
            <button className="tt-btn" aria-label="Less damage" onClick={() => setManualDamage(manualDamage - 1)}>
              −
            </button>
            <span className="n">{manualDamage}⚔</span>
            <button className="tt-btn" aria-label="More damage" onClick={() => setManualDamage(manualDamage + 1)}>
              +
            </button>
            <span className="odds">for cards resolved by hand · 0 just logs it</span>
          </div>,
        );
      }
      acts.push(
        <button key="cancel" className="tt-btn" onClick={play.cancel}>
          {mode.kind === 'attack' ? 'Cancel attack' : 'Cancel'}
        </button>,
      );
    } else {
      const sel = play.sel;
      if (sel) {
        const before = acts.length;
        if (sel.fire && !sel.fire.error) {
          acts.push(
            <button key="attack" className="tt-btn pri" onClick={() => play.attackWith(sel.slot)}>
              Attack with {sel.part.name}
            </button>,
          );
        }
        if (sel.generate && !sel.generate.error) {
          acts.push(
            <button key="gen" className="tt-btn pri" onClick={() => play.generateOn(sel.slot)}>
              Generate +{Math.min(sel.output, Math.max(0, sel.max - sel.energy))}⚡
            </button>,
          );
        }
        if (sel.use && !sel.use.error) {
          acts.push(
            <button key="use" className="tt-btn pri" onClick={() => play.useAbility(sel.slot)}>
              Use {sel.part.name}
            </button>,
          );
        }
        if (acts.length === before) {
          const why = sel.fire?.error ?? sel.generate?.error ?? sel.use?.error;
          acts.push(
            <span key="none" className="tt-note">
              {sel.part.name} has no action right now{why ? `: ${why}` : '.'}
            </span>,
          );
        }
      }
      for (const r of reviveOptions(state, config, side)) {
        acts.push(
          <button key={`revive-${r.player.id}`} className="tt-btn" disabled={!!r.option.error || busy} title={r.option.error ?? undefined} onClick={() => takeDown(r.option.action)}>
            Revive {r.player.label}
          </button>,
        );
      }
      acts.push(
        <button key="end" className="tt-btn" disabled={busy} onClick={endTurn} title="No 1st down: the enemy takes its turn">
          End turn
        </button>,
      );
    }
  } else if (!fight || fight.outcome) {
    const name = (cardId: string | undefined) => getCard(cardId ?? '')?.name ?? 'the card';
    const seatOf = (id: string | null | undefined) => state.party.players.find((p) => p.id === id);
    const inHand = build.inHand;
    const holder = inHand && 'player' in inHand ? seatOf(inHand.player) : undefined;
    // "Wherever it fits best": the engine picks the cell.
    const fits = (cardId: string) =>
      !!holder &&
      shipEngine.hasRoomFor(CONTENT, holder.ship, cardId, config.shipSizeRule) &&
      !!shipEngine.bestCell(CONTENT, holder.ship, cardId);

    if (build.drafting && setup) {
      if (inHand?.kind === 'table') {
        acts.push(
          <button key="take" className="tt-btn pri" title={setup.round === 0 ? undefined : 'It lies beside the ship until it is fitted'} onClick={() => { game.draftCard(inHand.cardId); build.pick(null); }}>
            Take {name(inHand.cardId)}
          </button>,
        );
      }
      if (inHand?.kind === 'hold' && holder) {
        acts.push(
          <button key="fit" className="tt-btn pri" disabled={!fits(inHand.cardId)} title={fits(inHand.cardId) ? undefined : 'Nowhere on the ship it may go'} onClick={() => { game.assemblePart(holder.id, inHand.cardId, null); build.pick(null); }}>
            Fit {name(inHand.cardId)} where it fits best
          </button>,
        );
      }
      if (inHand?.kind === 'grid' && holder) {
        acts.push(
          <button key="pull" className="tt-btn" onClick={() => { game.returnPart(holder.id, inHand.slot); build.pick(null); }}>
            Take {name(inHand.cardId)} off the ship
          </button>,
        );
      }
      if (inHand) {
        acts.push(
          <button key="down" className="tt-btn" onClick={() => build.pick(null)}>
            Put it back
          </button>,
        );
      }
      if (build.drafter && setup.round > 0 && !setup.complete) {
        acts.push(
          <button key="pass" className="tt-btn" title="Skip this round and keep the tokens for starting energy" onClick={game.passDraft}>
            {label(build.drafter)} passes
          </button>,
        );
      }
      if (!setup.complete) {
        acts.push(
          <button key="auto" className="tt-btn" title="The tool picks for every seat until the draft is over" onClick={game.draftAll}>
            Draft the rest
          </button>,
        );
      }
      const unplaced = setup.complete ? state.party.players.reduce((n, p) => n + p.tokens, 0) : 0;
      if (unplaced > 0) {
        acts.push(
          <button key="spread" className="tt-btn" title="The tool puts every seat's leftover tokens on its ship" onClick={() => state.party.players.forEach((p) => p.tokens > 0 && game.autoEnergy(p.id))}>
            Spread the tokens
          </button>,
        );
      }
      const canStart = setup.complete || setup.round > 0;
      acts.push(
        <button
          key="start"
          className={`tt-btn${setup.complete ? ' pri' : ''}${setup.complete && unplaced === 0 ? ' pulse' : ''}`}
          disabled={!canStart}
          title={!canStart ? 'Every seat needs a cockpit first' : unplaced > 0 ? `${unplaced} token(s) not placed yet: they are lost if the mission starts now` : 'Cards still in the middle go back to their deck'}
          onClick={game.startMission}
        >
          Start the mission{unplaced > 0 ? ` (${unplaced} tokens unplaced)` : ''}
        </button>,
      );
    } else if (prompt?.kind === 'event') {
      acts.push(
        <button key="event" className="tt-btn pri pulse" onClick={game.resolveEvent}>
          Carry out the event
        </button>,
      );
    } else if (prompt?.kind === 'reward') {
      for (const p of state.party.players.filter((x) => !x.destroyed)) {
        acts.push(
          <button key={`loot-${p.id}`} className="tt-btn pri" title={`Hand ${p.hand.length} of ${config.handSize}. Cards over hand size are discarded.`} onClick={() => game.claimReward(p.id)}>
            {p.label} takes the loot
          </button>,
        );
      }
    } else if (prompt?.kind === 'loot') {
      const claimant = seatOf(loot.who);
      const full = claimant ? claimant.scrapDeck.length >= scrapCapacityFor(claimant, config) : true;
      if (prompt.claimants.length > 1) {
        acts.push(
          <div className="tt-spend" key="who">
            {prompt.claimants.map((id) => (
              <button key={id} className={`tt-btn sm${id === loot.who ? ' pri' : ''}`} aria-pressed={id === loot.who} onClick={() => loot.setWho(id)}>
                {label(id)}
              </button>
            ))}
            <span className="odds">claims the wreck</span>
          </div>,
        );
      }
      const kept = !full && claimant && loot.keep !== null ? getPart(claimant.ship.slots[loot.keep]?.partId)?.name : undefined;
      acts.push(
        <button key="ship" className="tt-btn pri" disabled={!claimant} onClick={() => game.resolveLoot(loot.who, { option: 'take-ship', keepFromOldShip: full ? null : loot.keep })}>
          Take the ship over, keep {kept ?? 'nothing'}
        </button>,
      );
      if (config.lootOneModule) {
        const stripped = loot.take !== null ? getPart(prompt.wreck.ship.slots[loot.take]?.partId)?.name : undefined;
        acts.push(
          <button key="module" className="tt-btn" disabled={!claimant || loot.take === null || full} title={full ? 'The scrap deck is full' : undefined} onClick={() => loot.take !== null && game.resolveLoot(loot.who, { option: 'take-module', takeSlot: loot.take })}>
            {stripped ? `Strip ${stripped} only` : 'Strip one module only'}
          </button>,
        );
      }
      acts.push(
        <button key="leave" className="tt-btn" onClick={() => game.resolveLoot(null, { option: 'leave' })}>
          Leave the wreck
        </button>,
      );
    } else if (prompt?.kind === 'salvage') {
      const taker = prompt.claimants[prompt.turn]!;
      acts.push(
        <button key="pass" className="tt-btn" onClick={() => game.salvage(taker, null)}>
          {label(taker)} passes
        </button>,
      );
    } else if (prompt?.kind === 'checkpoint') {
      acts.push(
        <button key="on" className="tt-btn pri pulse" onClick={game.closePrompt}>
          Push on
        </button>,
      );
    } else if (prompt?.kind === 'rearrange') {
      if (inHand?.kind === 'scrap' && holder) {
        const cockpit = getPart(inHand.cardId)?.role === 'COCKPIT';
        acts.push(
          <button key="fit" className="tt-btn pri" disabled={!cockpit && !fits(inHand.cardId)} title={cockpit ? 'The old cockpit goes into the scrap deck in its place' : undefined} onClick={() => { game.fitFromScrap(holder.id, inHand.cardId, null); build.pick(null); }}>
            {cockpit ? `Install ${name(inHand.cardId)} as cockpit` : `Fit ${name(inHand.cardId)} where it fits best`}
          </button>,
        );
      }
      if (inHand?.kind === 'grid' && holder) {
        acts.push(
          <button key="stow" className="tt-btn" onClick={() => { game.stowToScrap(holder.id, inHand.slot); build.pick(null); }}>
            Stow {name(inHand.cardId)} in the scrap deck
          </button>,
        );
      }
      if (inHand) {
        acts.push(
          <button key="down" className="tt-btn" onClick={() => build.pick(null)}>
            Put it back
          </button>,
        );
      }
      acts.push(
        <button key="done" className="tt-btn pri" onClick={game.closePrompt}>
          {prompt.reason === 'mission-end' ? 'Ships are built: end the mission' : 'Ships are built: push on'}
        </button>,
      );
    } else if (state.phase === 'victory') {
      acts.push(
        <button key="next" className="tt-btn pri pulse" onClick={game.nextMission}>
          Fly to the next sector
        </button>,
      );
    } else if (state.phase === 'defeat') {
      acts.push(
        <button key="new" className="tt-btn pri" onClick={() => game.newRun()}>
          Set up a new game
        </button>,
      );
    } else if (state.phase === 'map') {
      if (state.party.players.length > 1) {
        acts.push(
          <button key="split" className="tt-btn" title="Split up: higher risk, higher reward. Each seat moves its own mini." onClick={() => game.setSplit(!state.split)}>
            {state.split ? 'Regroup' : 'Split up'}
          </button>,
        );
      }
      acts.push(
        <span key="none" className="tt-note">
          {state.split ? 'The party is split: every seat moves on its own.' : 'The party moves together.'}
        </span>,
      );
    }
  }

  return (
    <div className="tt-hud" aria-label="Game controls">
      <div className="tt-hud-box">{turnBox}</div>
      <div className="tt-hud-box" aria-live="polite">
        <div className="tt-hud-k" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          What&apos;s happening
          <button className="tt-hud-k" style={{ background: 'none', border: 0, padding: 0, color: 'var(--ui)' }} onClick={() => setFullLog((v) => !v)}>
            {fullLog ? 'Less log' : 'Full log'}
          </button>
        </div>
        <div className="tt-prompt">{headline(play, landed)}</div>
        {(error || note) && <p className="tt-note bad">{error ?? note}</p>}
        {shown.map((r) => (
          <div key={r.id} className="tt-roll-line">
            {r.die} → {r.dice.join(' + ')}
            {r.rule ? ` · needed ${r.rule}` : ''} ·{' '}
            <span className={r.success === null ? '' : r.success ? 'hit' : 'miss'}>{r.outcome.toUpperCase()}</span>
          </div>
        ))}
        <ul className={`tt-log${fullLog ? ' full' : ''}`}>
          {log.map((l) => (
            <li key={l.id}>
              {l.actor ? `${l.actor}: ` : ''}
              {l.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="tt-hud-box">
        <div className="tt-hud-k">Actions</div>
        <div className="tt-acts">{acts}</div>
      </div>
      <div className="tt-hud-box">
        <div className="tt-hud-k" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          View
          <span className="tt-zoom">
            <button className="tt-btn sm" aria-label="Zoom out" onClick={() => camera.zoomBy(1 / 1.4)}>
              −
            </button>
            <button className="tt-btn sm" onClick={camera.fit}>
              Fit
            </button>
            <button className="tt-btn sm" aria-label="Zoom in" onClick={() => camera.zoomBy(1.4)}>
              +
            </button>
            <button className="tt-btn sm" aria-expanded={tweaksOpen} onClick={() => toggleTweaks()}>
              Tweak
            </button>
          </span>
        </div>
        <div className="tt-crew">
          {state.party.players.map((p) => {
            const energy = p.ship.slots.reduce((n, s) => n + (s.destroyed ? 0 : s.energy), 0);
            const aggro = !!fight && !fight.outcome && play.aggro === p.id;
            const active = side?.kind === 'player' && side.id === p.id;
            return (
              <button
                key={p.id}
                className={`tt-mate${active || (!fight && play.activeSeat === p.id) ? ' active' : ''}${p.destroyed ? ' out' : ''}`}
                title="Turn the table to this seat"
                onClick={() => setViewSeat(p.id)}
              >
                <span className="dot" style={{ background: p.accent }} />
                <span>{p.label}</span>
                <span className={`tag${aggro ? ' aggro' : ''}`}>
                  {aggro ? 'AGGRO · ' : ''}
                  {p.destroyed ? 'DOWN' : build.drafting ? `${p.tokens} TOKENS` : `${energy}⚡`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div id="tt-flash" />
    </div>
  );
}

const PHASE: Record<GameState['phase'], string> = {
  setup: 'Setting up',
  map: 'On the board',
  combat: 'Combat',
  loot: 'Wreck to claim',
  event: 'Event',
  reward: 'Loot',
  rearrange: 'Rebuild',
  victory: 'Mission won',
  defeat: 'Mission lost',
};

/** The roll of the step that just landed, if nothing has moved on since. */
function lastRolls(state: GameState): RollEvent[] {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i]!;
    if (e.kind === 'turn' || e.kind === 'action-card') break;
    if (e.kind === 'roll') return [e];
  }
  return [];
}

const hasManual = (play: TablePlay): boolean =>
  play.controls.options.some((o) => (o.part.effects ?? []).some((e) => e.type === 'manual')) ||
  (play.acting?.hand ?? []).some((id) => (getCard(id)?.effects ?? []).some((e) => e.type === 'manual'));

/** One line on what the table is waiting for. */
function headline(play: TablePlay, landed: number): string {
  const { state, fight, side, staged, mode } = play;
  const label = (id: string | null | undefined) => state.party.players.find((p) => p.id === id)?.label ?? 'The next seat';
  if (staged) {
    const roll = staged.rolls[Math.min(landed, staged.rolls.length - 1)];
    if (!staged.thrown) return `${roll?.label ?? 'A roll'}. ${side?.kind === 'enemy' ? 'Roll for the enemy.' : 'Roll the die.'}`;
    if (landed < staged.rolls.length) return `${roll?.label ?? 'Rolling'}…`;
    const last = staged.rolls[staged.rolls.length - 1];
    return last ? `Rolled ${last.dice.length > 1 ? last.dice.join(' + ') : `a ${last.dice[0]}`}. ${last.outcome}${last.success === null ? '' : '!'}` : 'Rolled.';
  }
  const { build } = play;
  const prompt = state.prompt;
  const held = build.inHand;
  const heldName = held && 'cardId' in held ? (getCard(held.cardId)?.name ?? 'The card') : null;
  if (prompt?.kind === 'loot') {
    return `${prompt.wreck.name} is down. ${label(play.loot.who)} may abandon ship and take it over: click the one module of the old ship to keep for the scrap deck. Destroyed modules are gone.`;
  }
  if (prompt?.kind === 'salvage') {
    return `${prompt.wreck.name} is down. It is taken in pieces: ${label(prompt.claimants[prompt.turn])} takes a card off the wreck into the scrap deck, or passes.`;
  }
  if (fight?.outcome) return fight.outcome === 'victory' ? 'Enemy ship down. Salvage what survived.' : 'Every cockpit is destroyed.';
  if (fight && side?.kind === 'enemy') {
    const card = getCard(fight.actionDecks[fight.down]?.faceUp);
    if (card?.kind !== 'action') return 'The enemy plays the face-up card on each of its action decks, in order.';
    return `${card.name}: ${ACTION_TEXT[card.action]}${(fight.turned ?? 0) > 0 ? ' The card before it couldn’t resolve and went to the bottom.' : ''}`;
  }
  if (fight && play.acting) {
    if (fight.turnOver === 'first-down') return `1st down! ${play.acting.label}'s turn is over. End the turn to hand it on.`;
    if (fight.turnOver) return `No 1st down this turn. End ${play.acting.label}'s turn to hand it to the enemy.`;
    if (mode?.kind === 'reroute') return 'Rerouting. Energy that arrived this reroute stays put. Finish to use the down.';
    if (mode?.kind === 'attack') return play.controls.targets.length ? `Pick a target for ${play.sel?.part.name ?? nameOf(play, mode.slot)}. Outlined modules are in reach.` : play.controls.prompt;
    if (mode) return play.controls.prompt;
    if (play.sel) return `${play.sel.part.name} picked up. Choose what it does.`;
    return 'Select one of your modules to act, or drag energy between connected modules to reroute.';
  }
  if (prompt?.kind === 'event') return 'An event is turned over. Read it, carry it out, then discard it: click the card.';
  if (prompt?.kind === 'reward') return 'Loot is on the table. Carry it to the seat that takes it.';
  if (prompt?.kind === 'checkpoint') return `Rarity checkpoint: the next stack of rarer cards is shuffled into the decks. Rarity is now up to ${prompt.newMaxRarity}.`;
  if (prompt?.kind === 'rearrange') {
    if (held) return `${heldName} in hand. Outlined cells are where it may go.`;
    return `${prompt.reason === 'mission-end' ? 'Mission complete.' : 'Rearrangement point.'} Rebuild the ships: drag modules around, onto the scrap deck and off it. A cockpit from the scrap deck goes onto the old one.`;
  }
  switch (state.phase) {
    case 'map':
      return `${state.split ? label(state.awaitingMove[0]) : 'The party'}: move to the next step on the mission board. Reachable tiles are outlined.`;
    case 'setup': {
      const setup = state.setup;
      if (!setup) return '';
      if (held?.kind === 'token') return 'A token in hand. Click the modules it goes on.';
      if (held) return `${heldName} in hand. ${setup.round === 0 && !setup.complete ? 'Put it at your seat.' : 'Outlined cells are where it may go.'}`;
      if (setup.complete) return 'The draft is over. Rearrange the ships, and put the leftover tokens on modules as starting energy: drag them from each seat’s pile.';
      if (!build.drafter) return 'Dealing…';
      if (setup.round === 0) return `${label(build.drafter)} takes a cockpit from the middle of the table.`;
      return `${label(build.drafter)} buys a module from the middle and carries it to the ship, or passes. Tokens are paid into the supply.`;
    }
    case 'victory':
      return 'Mission won.';
    case 'defeat':
      return 'Mission lost. Every cockpit is destroyed.';
    default:
      return '';
  }
}

const nameOf = (play: TablePlay, slot: number | null): string =>
  (slot !== null ? getPart(play.acting?.ship.slots[slot]?.partId)?.name : undefined) ?? 'the module';
