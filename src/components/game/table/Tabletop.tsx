import { useEffect, useLayoutEffect, useRef } from 'react';
import type { BoardNode, GameState, PlayerState } from '@engine/types';
import { ACTION_LABEL, board, printedText } from '@engine';
import { BOSSES_BY_ID, getCard } from '@data';
import { cardFlight } from '@/components/fx/tableFx';
import { handOptions } from '@/lib/combatView';
import { cardTitleLine } from '@/lib/palette';
import { useGameStore } from '@/store/gameStore';
import { useUiStore, type TableTweaks } from '@/store/uiStore';
import { SEAT_ANGLE, seatOf, seatsFor, useTablePlay, type SeatPos, type TablePlay } from './play';
import { TableDie } from './TableDie';
import { TableHud } from './TableHud';
import { TableShip, shipExtent } from './TableShip';
import { TweakDrawer } from './TweakDrawer';
import { useCamera } from './useCamera';

/** A module card's footprint per card-size tweak, in px — the same numbers the stylesheet sets. */
const CARD: Record<TableTweaks['size'], { w: number; h: number }> = { s: { w: 92, h: 106 }, m: { w: 104, h: 118 }, l: { w: 116, h: 130 } };
const GAP = 8;

const shipBox = (cols: number, rows: number, size: TableTweaks['size']) => ({
  w: cols * CARD[size].w + (cols - 1) * GAP + 20,
  h: rows * CARD[size].h + (rows - 1) * GAP + 28,
});

/**
 * The play screen: a table, and a panel under it.
 *
 * On the table lies only what ships in the box — the decks and the discard,
 * the mission board with its step tiles, boss sheet and minis, the enemy ship
 * and its action decks, the die, the energy supply, and every seat's ship in
 * front of them, turned to face the middle. Everything a screen adds — whose
 * turn, the downs, prompts, the log, every button — is in the panel below, and
 * the few marks the screen does draw on the table (a selection, a legal
 * target, an empty cell) are in a blue no card is printed in.
 */
export function Tabletop({ state }: { state: GameState }) {
  const play = useTablePlay(state);
  const tweaks = useUiStore((s) => s.tweaks);
  const stage = useRef<HTMLDivElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);

  // Tweaks ride on <html>, so the effects layer above the table follows them too.
  useLayoutEffect(() => {
    const h = document.documentElement;
    for (const k of ['surface', 'size', 'chit', 'die', 'hand', 'grid'] as const) h.dataset[`tt${k[0]!.toUpperCase()}${k.slice(1)}`] = tweaks[k];
  }, [tweaks]);

  const players = state.party.players;
  const seats = seatsFor(players);
  const angle = tweaks.follow === 'on' ? -SEAT_ANGLE[seatOf(state, play.activeSeat)] : 0;
  const camera = useCamera(stage, cam, table, angle, tweaks.tilt === 'on');

  useCardFlights(state, play);

  return (
    <div className="tt">
      <div ref={stage} className="tt-stage" aria-label="Game table. Scroll or pinch to zoom, drag to pan.">
        <div ref={cam} className="tt-cam">
          <div ref={table} className="tt-table">
            {players.map((player, i) => (
              <Seat key={player.id} player={player} pos={seats[i] ?? 'bottom'} play={play} size={tweaks.size} />
            ))}
            <Center play={play} size={tweaks.size} />
          </div>
        </div>
        <Hand play={play} fan={tweaks.hand === 'fan'} />
      </div>
      <TableHud play={play} camera={camera} />
      <TweakDrawer />
    </div>
  );
}

/* ------------------------------------------------------------------ seats */

const ROT: Record<SeatPos, string> = { bottom: '', top: ' rotate(180deg)', left: ' rotate(90deg)', right: ' rotate(-90deg)' };

/** One seat's side of the table: its scrap deck, its ship front toward the middle, the cards it holds face down. */
function Seat({ player, pos, play, size }: { player: PlayerState; pos: SeatPos; play: TablePlay; size: TableTweaks['size'] }) {
  const { state, acting, plan } = play;
  const mine = acting?.id === player.id;
  const active = play.side?.kind === 'player' && play.side.id === player.id;
  const holdsHand = play.activeSeat === player.id && play.side?.kind !== 'enemy';
  // A reroute being dragged together shows on the ship as it would end up.
  const ship = mine && plan ? plan.ship : player.ship;
  const ext = shipExtent(ship);
  const box = shipBox(ext.cols, ext.rows, size);
  const w = box.w + 186;
  const h = Math.max(box.h, 100) + 34;
  const sideways = pos === 'left' || pos === 'right';
  const side = { kind: 'player' as const, id: player.id };
  const out = player.destroyed;

  return (
    <div className={`tt-seat-cell ${pos}`} style={{ width: sideways ? h : w, height: sideways ? w : h }}>
      <div className="tt-seat-in" style={{ transform: `translate(-50%, -50%)${ROT[pos]}` }}>
        <div className="tt-seat-side">
          <div className="tt-scrap" title={`${player.label}'s scrap deck · ${player.scrapDeck.length}`} data-scrap={player.id}>
            {player.scrapDeck.length === 0 ? (
              <div className="tt-guide" />
            ) : (
              player.scrapDeck.slice(0, 6).map((id, k) => (
                <div key={`${id}-${k}`} className="tt-back scrap" style={{ transform: `translate(${k * 2}px, ${k * 2}px)` }}>
                  N.O.M.A.D.<small>MODULE</small>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="tt-ship-wrap" style={out ? { opacity: 0.55 } : undefined}>
          <span className="tt-front-tag top">FRONT ▲</span>
          <TableShip
            ship={ship}
            side={side}
            facing="up"
            marks={play.marks}
            selected={mine ? (play.sel?.slot ?? null) : null}
            clickable={mine && !play.mode && !play.busy && !play.fight?.turnOver}
            onModule={mine ? play.clickOwn : undefined}
            drag={
              mine && plan
                ? { sendable: (slot) => plan.sendable[slot] ?? 0, error: play.dropError, onDrop: play.dropChit }
                : null
            }
          />
        </div>
        <div className="tt-held" title={`${player.label}: ${player.hand.length} in hand`} data-held={player.id}>
          {!holdsHand &&
            player.hand.map((id, k, all) => (
              <div key={`${id}-${k}`} className="tt-back items" style={{ transform: `rotate(${(k - (all.length - 1) / 2) * 12}deg)` }}>
                N.O.M.A.D.
              </div>
            ))}
        </div>
        <span className={`tt-seat-tag${active ? ' on' : ''}`}>
          {player.label}
          {active ? ' · their turn' : out ? ' · shot down' : state.combat && !state.combat.participants.includes(player.id) ? ' · elsewhere' : ''}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- centre */

/** The shared middle: the mission board across the top, then decks, reveal spot, die, supply, the enemy and its action decks. */
function Center({ play, size }: { play: TablePlay; size: TableTweaks['size'] }) {
  const { state, fight } = play;
  const d = state.decks;
  // Modules shot off a ship this fight lie on the discard too, until the fight is cleared away.
  const wrecked = fight
    ? [fight.enemy.ship, ...state.party.players.map((p) => p.ship)].reduce((n, s) => n + s.slots.filter((x) => x.destroyed).length, 0)
    : 0;
  const discards =
    d.parts.discardPile.length + d.cockpits.discardPile.length + d.items.discardPile.length + d.events.discardPile.length + wrecked;
  const reserve = d.parts.reserve.length + d.cockpits.reserve.length + d.items.reserve.length + d.events.reserve.length;
  const event = state.prompt?.kind === 'event' ? getCard(state.prompt.cardId) : undefined;

  const enemy = fight?.enemy ?? null;
  const ext = enemy ? shipExtent(enemy.ship) : { cols: 3, rows: 3 };
  const box = shipBox(ext.cols, ext.rows, size);
  const span = Math.max(box.w, box.h) + 12;
  const facing = SEAT_ANGLE[seatOf(state, play.aggro)];
  // Turn the short way round, like the table does.
  const turn = useRef(facing);
  turn.current += ((((facing - turn.current) % 360) + 540) % 360) - 180;
  const aiming = !!play.mode && !play.busy && play.controls.targets.length > 0;

  return (
    <section className="tt-center" aria-label="Shared play area">
      <MissionStrip state={state} />
      <div className="tt-center-main">
        <div className="tt-decks">
          <Deck kind="parts" label="PARTS" cls="" count={d.parts.drawPile.length} />
          <Deck kind="cockpits" label="COCKPITS" cls="cockpits" count={d.cockpits.drawPile.length} />
          <Deck kind="items" label="ITEMS" cls="items" count={d.items.drawPile.length} />
          <Deck kind="events" label="EVENTS" cls="events" count={d.events.drawPile.length} />
          <Deck kind="rare" label="RARE" cls="rare" count={reserve} title="Set aside until a rarity checkpoint" />
          <div className="tt-deck" id="tt-discard" title={`Discard · ${discards} cards`}>
            {discards > 0 ? (
              <div className="tt-back">
                N.O.M.A.D.<small>DISCARD</small>
              </div>
            ) : (
              <div className="tt-guide" />
            )}
          </div>
        </div>

        <div className="tt-mid-col">
          <div className="tt-reveal-spot" id="tt-reveal">
            {event && (
              <div className="tt-ecard" key={event.id}>
                <div className="tt-band">EVENT</div>
                <h4>{event.name}</h4>
                <p>{printedText(event)}</p>
              </div>
            )}
          </div>
          <TableDie />
          <div className="tt-bank" title="Energy markers (shared supply)">
            {Array.from({ length: 22 }, (_, i) => (
              <span
                key={i}
                className="tt-chit"
                style={{ left: `${6 + ((i * 37) % 86)}%`, top: `${8 + ((i * 53) % 76)}%`, transform: `rotate(${i * 29}deg)` }}
              />
            ))}
          </div>
        </div>

        <div className="tt-enemy-box" style={{ width: span, height: span }}>
          <div className="tt-ship-wrap tt-enemy-turn" style={{ transform: `rotate(${turn.current}deg)` }}>
            {enemy ? (
              <TableShip
                key={enemy.instanceId}
                ship={enemy.ship}
                side={{ kind: 'enemy', id: enemy.instanceId }}
                facing="down"
                marks={play.marks}
                targets={aiming ? play.controls.targets : undefined}
                onModule={aiming ? play.clickEnemy : undefined}
              />
            ) : (
              <div
                className="tt-ship"
                style={{ gridTemplateColumns: 'repeat(3, var(--tt-cw))', gridTemplateRows: 'repeat(3, var(--tt-ch))' }}
              >
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="tt-guide" />
                ))}
              </div>
            )}
            <span className="tt-front-tag bottom">FRONT ▼</span>
          </div>
        </div>

        <div className="tt-adecks">
          {(fight?.actionDecks ?? Array.from({ length: play.config.downCount }, () => null)).map((deck, i) => {
            const card = deck ? getCard(deck.faceUp) : undefined;
            const action = card?.kind === 'action' ? card.action : null;
            const now = play.side?.kind === 'enemy' && fight?.down === i;
            return (
              <div key={i} className={`tt-adeck${now ? ' now' : ''}`}>
                <span className="tt-ui-num">{i + 1}</span>
                {action && deck ? (
                  <div
                    key={`${deck.faceUp}-${deck.drawPile.length}-${deck.discardPile.length}`}
                    className={`tt-acard ${action}`}
                    title={card ? `${card.name} — ${printedText(card)}` : undefined}
                  >
                    <div className="k">ENEMY ACTION</div>
                    <div className="glyph">{GLYPH[action]}</div>
                    <div className="nm">{card?.name ?? ACTION_LABEL[action]}</div>
                  </div>
                ) : (
                  <div className="tt-back">
                    N.O.M.A.D.<small>ACTION</small>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const GLYPH = { attack: '⨯', generate: '+', reroute: '⇄' } as const;

function Deck({ kind, label, cls, count, title }: { kind: string; label: string; cls: string; count: number; title?: string }) {
  return (
    <div className="tt-deck" data-deck={kind} title={`${title ?? label} · ${count} cards`}>
      {count === 0 && <div className="tt-guide" />}
      {count > 2 && <div className={`tt-back ${cls} l2`} />}
      {count > 1 && <div className={`tt-back ${cls} l1`} />}
      {count > 0 && (
        <div className={`tt-back ${cls}`}>
          N.O.M.A.D.<small>{label}</small>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- mission board */

const STEP: Record<BoardNode['type'], { ico: string; label: string }> = {
  start: { ico: '▲', label: 'Launch' },
  combat: { ico: '✕', label: 'Combat' },
  loot: { ico: '◆', label: 'Loot' },
  event: { ico: '?', label: 'Event' },
  empty: { ico: '·', label: 'Empty' },
  checkpoint: { ico: '★', label: 'Rarity' },
  boss: { ico: '', label: 'Boss' },
};
const PITCH = { x: 92, y: 74 };

/** The mission board as a strip: step tiles left to right, forks stacked, the boss sheet at the end, a mini per seat. */
function MissionStrip({ state }: { state: GameState }) {
  const moveTo = useGameStore((s) => s.moveTo);
  const { mission } = state;
  const columns = new Map<number, BoardNode[]>();
  for (const node of mission.nodes) columns.set(node.column, [...(columns.get(node.column) ?? []), node]);
  for (const list of columns.values()) list.sort((a, b) => a.row - b.row);
  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const height = Math.max(150, tallest * PITCH.y + 24);
  const lastCol = Math.max(0, ...columns.keys());
  const at = (node: BoardNode) => {
    const list = columns.get(node.column) ?? [node];
    return {
      x: 44 + node.column * PITCH.x + (node.type === 'boss' ? 40 : 0),
      y: height / 2 + (list.indexOf(node) - (list.length - 1) / 2) * PITCH.y,
    };
  };
  const byId = new Map(mission.nodes.map((n) => [n.id, n]));
  const stood = new Set(Object.values(mission.positions));
  const mover = state.phase === 'map' ? state.awaitingMove[0] : undefined;
  const options = mover ? board.optionsFor(mission, mover).map((n) => n.id) : [];

  return (
    <div className="tt-track" aria-label="Mission board" style={{ width: 44 + lastCol * PITCH.x + 40 + 84, height }}>
      <svg className="tt-track-svg" aria-hidden="true">
        {mission.nodes.flatMap((a) =>
          a.next.map((id) => {
            const b = byId.get(id);
            if (!b) return null;
            const p = at(a);
            const q = at(b);
            const walked = !!a.resolved && (!!b.resolved || stood.has(b.id));
            return <path key={`${a.id}>${id}`} className={walked ? 'walked' : undefined} d={`M${p.x} ${p.y} L${q.x} ${q.y}`} />;
          }),
        )}
      </svg>
      {mission.nodes.map((node) => {
        const p = at(node);
        const next = options.includes(node.id);
        const style = STEP[node.type];
        return (
          <button
            key={node.id}
            className={`tt-step ${node.type}${next ? ' next' : ''}`}
            style={{ left: p.x, top: p.y }}
            tabIndex={next ? 0 : -1}
            aria-label={`${style.label} step${next ? ', reachable' : ''}`}
            onClick={next && mover ? () => moveTo(mover, node.id) : undefined}
          >
            {node.type === 'boss' ? (
              <>
                <span className="k">BOSS SHEET</span>
                <span className="ico">{(BOSSES_BY_ID[node.bossId ?? '']?.name ?? 'BOSS').toUpperCase()}</span>
                <span className="s">SECTOR {mission.sector}</span>
              </>
            ) : (
              <>
                <span className="ico">{style.ico}</span>
                <span>{style.label}</span>
              </>
            )}
          </button>
        );
      })}
      {state.party.players.map((player, i) => {
        const node = byId.get(mission.positions[player.id] ?? mission.startNodeId);
        if (!node) return null;
        const p = at(node);
        return (
          <svg key={player.id} className="tt-mini" viewBox="0 0 26 34" aria-hidden="true" style={{ left: p.x - 26 + i * 13, top: p.y }}>
            <circle cx="13" cy="8" r="6.5" fill={player.accent} stroke="#14170f" strokeWidth="1.5" />
            <path d="M5 32 C5 20 8 15 13 15 C18 15 21 20 21 32 Z" fill={player.accent} stroke="#14170f" strokeWidth="1.5" />
            <rect x="2" y="30" width="22" height="3.5" rx="1.5" fill={player.accent} stroke="#14170f" strokeWidth="1.5" />
          </svg>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- hand */

/** The active seat's hand, held up in front of the screen rather than laid on the table. */
function Hand({ play, fan }: { play: TablePlay; fan: boolean }) {
  const { state, side, acting, mode, busy } = play;
  const setMode = useUiStore((s) => s.setCombatMode);
  const select = useUiStore((s) => s.selectTableModule);
  const manualDamage = useUiStore((s) => s.manualDamage);
  const holder = side?.kind === 'enemy' ? null : state.party.players.find((p) => p.id === play.activeSeat);
  if (!holder || holder.hand.length === 0) return <div className="tt-hand" aria-label="Cards in hand" />;

  const options = acting && side ? handOptions(state, play.config, side, null, manualDamage) : [];
  const picked = mode?.kind === 'item' ? mode.cardId : null;
  const live = !!acting && acting.id === holder.id && !busy && !play.fight?.turnOver && (!mode || mode.kind === 'item');
  const n = holder.hand.length;
  const W = 440;
  const step = n > 1 ? Math.min(fan ? 80 : 132, (W - (fan ? 172 : 126)) / (n - 1)) : 0;
  const start = (W - (122 + step * (n - 1))) / 2;
  const selIndex = picked ? holder.hand.indexOf(picked) : -1;

  return (
    <div className="tt-hand" aria-label="Cards in hand">
      {holder.hand.map((id, i) => {
        const card = getCard(id);
        if (!card) return null;
        const option = options.find((o) => o.cardId === id)?.option;
        const sel = i === selIndex;
        const mid = (n - 1) / 2;
        const transform = fan
          ? `translateY(${Math.abs(i - mid) * 7 - (sel ? 40 : 0)}px) rotate(${sel ? 0 : (i - mid) * 7}deg)`
          : `translateY(${sel ? -26 : 0}px)`;
        return (
          <button
            key={`${id}-${i}`}
            className={`tt-icard${sel ? ' sel' : ''}${live && option?.error ? ' off' : ''}`}
            style={{ left: start + i * step, transform, zIndex: sel ? 20 : i + 1 }}
            title={option?.error ?? undefined}
            onClick={() => {
              if (!live) return;
              select(null);
              setMode(sel ? null : { kind: 'item', cardId: id });
            }}
          >
            <div className="tt-band">
              <span>ITEM</span>
              <span>◆</span>
            </div>
            <div className="nm">{card.name}</div>
            <div className="tx">{printedText(card)}</div>
            <div className="ft">{cardTitleLine(card).toUpperCase()}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- card flights */

/**
 * Cards changing piles, shown crossing the table: an item dealt from its deck
 * to a seat, an item played to the discard, an event turned onto the reveal
 * spot and cleared off it again.
 */
function useCardFlights(state: GameState, play: TablePlay) {
  const seen = useRef<{ hands: Record<string, number>; event: string | null } | null>(null);
  const active = play.side?.kind === 'enemy' ? null : play.activeSeat;
  useEffect(() => {
    const hands = Object.fromEntries(state.party.players.map((p) => [p.id, p.hand.length]));
    const event = state.prompt?.kind === 'event' ? state.prompt.cardId : null;
    const before = seen.current;
    seen.current = { hands, event };
    if (!before) return;
    const q = (sel: string) => document.querySelector(sel);
    const discard = q('#tt-discard');
    for (const p of state.party.players) {
      const was = before.hands[p.id] ?? 0;
      const held = p.id === active ? q('.tt-hand') : q(`[data-held="${p.id}"]`);
      const now = hands[p.id] ?? 0;
      for (let i = 0; i < Math.min(3, now - was); i++) window.setTimeout(() => cardFlight(q('[data-deck="items"]'), held, 'items', 620), i * 140);
      if (now < was) cardFlight(held, discard, 'items', 560);
    }
    if (event && event !== before.event) cardFlight(q('[data-deck="events"]'), q('#tt-reveal'), 'events', 600);
    if (!event && before.event) cardFlight(q('#tt-reveal'), discard, 'events', 520);
  }, [state, active]);
}
