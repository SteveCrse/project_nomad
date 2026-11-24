import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BoardNode, Card, CardId, EnemyInstance, GameState, PlayerState, Ship } from '@engine/types';
import { ACTION_LABEL, board, enemyModuleCount, game, printedText, ship as shipEngine } from '@engine';
import { BOSSES_BY_ID, CONTENT, getCard } from '@data';
import { CardTile } from '@/components/game/CardTile';
import { useDropZone } from '@/components/fx/drag';
import { cardFlight, chitsBetweenEls } from '@/components/fx/tableFx';
import { handOptions, sizeReadout } from '@/lib/combatView';
import { cardTitleLine } from '@/lib/palette';
import { useGameStore } from '@/store/gameStore';
import { useUiStore, type TableTweaks } from '@/store/uiStore';
import { SEAT_ANGLE, seatOf, seatsFor, useTablePlay, type SeatPos, type TablePlay } from './play';
import { TableDie } from './TableDie';
import { TableHud } from './TableHud';
import { Ghost, PartFace, TableShip, cardGhost, draggable, shipExtent, type ShipBuild } from './TableShip';
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
 * The whole game, on one table, and a panel under it.
 *
 * On the table lies only what ships in the box — the decks and the discard,
 * the mission board with its step tiles, boss sheet and minis, the enemy ship
 * and its action decks, the die, the energy supply, and every seat's ship in
 * front of them, turned to face the middle. Whatever a table does with those
 * happens here, by hand: the draft is dealt into the middle and its cards
 * carried to a seat, tokens are counted out and put on modules, minis are
 * moved along the board, an event is turned over, loot is handed round, a
 * wreck is stripped, a ship is rebuilt from its scrap deck. Everything a
 * screen adds — whose turn, the downs, what is being asked, the log, every
 * button for something said rather than done — is in the panel below, and the
 * few marks the screen does draw on the table (a selection, a legal target,
 * an empty cell, a label) are in a blue no card is printed in.
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
  const peek = usePeek(stage, tweaks.peek === 'on');

  useCardFlights(state, play);

  return (
    <div className="tt">
      <div ref={stage} className="tt-stage" aria-label="Game table. Scroll or pinch to zoom, drag to pan.">
        <div ref={cam} className="tt-cam">
          <div ref={table} className="tt-table">
            {players.map((player, i) => (
              <Seat key={player.id} player={player} pos={seats[i] ?? 'bottom'} play={play} />
            ))}
            <Center play={play} size={tweaks.size} />
          </div>
        </div>
        <Hand play={play} fan={tweaks.hand === 'fan'} />
        {peek && (
          <div className="tt-peek" aria-hidden="true">
            <CardTile card={peek} />
          </div>
        )}
      </div>
      <TableHud play={play} camera={camera} />
      <TweakDrawer />
    </div>
  );
}

/**
 * Leaning in to read a card: rest the pointer on any card on the table and it
 * is held up, full size, in the corner of the screen.
 */
function usePeek(stage: React.RefObject<HTMLDivElement | null>, on: boolean): Card | null {
  const [id, setId] = useState<CardId | null>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el || !on) return setId(null);
    let timer = 0;
    let shown: string | null = null;
    const show = (next: string | null) => {
      if (next === shown) return;
      shown = next;
      window.clearTimeout(timer);
      // A beat before it comes up, so sweeping across the table doesn't flicker cards past.
      if (next) timer = window.setTimeout(() => setId(next), 380);
      else setId(null);
    };
    const over = (e: PointerEvent) => show(e.buttons ? null : ((e.target as Element).closest<HTMLElement>('[data-peek]')?.dataset.peek ?? null));
    const leave = () => show(null);
    el.addEventListener('pointerover', over);
    el.addEventListener('pointerdown', leave);
    el.addEventListener('pointerleave', leave);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('pointerover', over);
      el.removeEventListener('pointerdown', leave);
      el.removeEventListener('pointerleave', leave);
    };
  }, [stage, on]);
  return id ? (getCard(id) ?? null) : null;
}

/* ------------------------------------------------------------------ seats */

const ROT: Record<SeatPos, string> = { bottom: '', top: ' rotate(180deg)', left: ' rotate(90deg)', right: ' rotate(-90deg)' };

/**
 * One seat's side of the table: its scrap deck and its energy tokens, its ship
 * front toward the middle, the cards beside it waiting to be fitted, and the
 * cards it holds, face down.
 */
function Seat({ player, pos, play }: { player: PlayerState; pos: SeatPos; play: TablePlay }) {
  const { state, config, acting, plan, build } = play;
  const mine = acting?.id === player.id;
  const active = play.side?.kind === 'player' ? play.side.id === player.id : !play.fight && play.activeSeat === player.id;
  const holdsHand = play.activeSeat === player.id && play.side?.kind !== 'enemy';
  // A reroute being dragged together shows on the ship as it would end up.
  const ship = mine && plan ? plan.ship : player.ship;
  const sideways = pos === 'left' || pos === 'right';
  const side = { kind: 'player' as const, id: player.id };
  const out = player.destroyed;

  // The seat is turned to face the middle, so its cell is sized from what's in it by hand.
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const read = () => setBox((b) => (b.w === el.offsetWidth && b.h === el.offsetHeight ? b : { w: el.offsetWidth, h: el.offsetHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const w = box.w;
  const h = Math.max(box.h, 100) + 34;

  // Loot handed out by a Loot step is taken by carrying it to a seat.
  const zone = useDropZone(`seat:${player.id}`, { accepts: (p) => build.seatAccepts(player, p), onDrop: (p) => build.seatDrop(player, p) });

  const cockpit = shipEngine.cockpitIndex(player.ship);
  const editing = build.canEdit(player);
  const shipBuild: ShipBuild | null = editing
    ? {
        inHand: build.inHand,
        cellAccepts: (p, cell) => build.cellAccepts(player, p, cell),
        cellDrop: (p, cell) => build.cellDrop(player, p, cell),
        slotAccepts: (p, slot) => build.slotAccepts(player, p, slot),
        slotDrop: (p, slot) => build.slotDrop(player, p, slot),
        lift: (slot) => (slot.index === cockpit ? null : { kind: 'grid', player: player.id, slot: slot.index, cardId: slot.partId }),
        liftChit: (slot) =>
          build.energyPhase && !game.energyError(CONTENT, config, state, player.id, slot.index, -1)
            ? { kind: 'untoken', player: player.id, slot: slot.index }
            : null,
        onPick: (slot) => {
          if (slot.index !== cockpit) build.pick({ kind: 'grid', player: player.id, slot: slot.index, cardId: slot.partId });
        },
      }
    : null;

  // A wreck to claim: the seat taking it over picks the one module it keeps.
  const keeping = state.prompt?.kind === 'loot' && play.loot.who === player.id;
  const inHand = build.inHand;
  const selected =
    inHand?.kind === 'grid' && inHand.player === player.id ? inHand.slot : keeping ? play.loot.keep : mine ? (play.sel?.slot ?? null) : null;

  const tag = active
    ? build.drafter === player.id
      ? ' · picks'
      : play.fight
        ? ' · their turn'
        : ''
    : out
      ? ' · shot down'
      : state.combat && !state.combat.participants.includes(player.id)
        ? ' · elsewhere'
        : '';

  return (
    <div className={`tt-seat-cell ${pos}`} style={{ width: sideways ? h : w, height: sideways ? w : h }}>
      <div ref={inner} {...zone.props} className={`tt-seat-in${zone.over ? ' over' : zone.active ? ' lit' : ''}`} style={{ transform: `translate(-50%, -50%)${ROT[pos]}` }}>
        <div className="tt-seat-side">
          <div className="tt-scrap" title={`${player.label}'s scrap deck · ${player.scrapDeck.length}`} data-scrap={player.id}>
            {player.scrapDeck.length === 0 || build.rebuilding ? (
              <div className="tt-guide" />
            ) : (
              player.scrapDeck.slice(0, 6).map((id, k) => (
                <div key={`${id}-${k}`} className="tt-back scrap" style={{ transform: `translate(${k * 2}px, ${k * 2}px)` }}>
                  N.O.M.A.D.<small>MODULE</small>
                </div>
              ))
            )}
          </div>
          {build.drafting && <Purse player={player} play={play} />}
        </div>
        <div className="tt-ship-wrap" data-seat-ship={player.id} style={out ? { opacity: 0.55 } : undefined}>
          <span className="tt-front-tag top">FRONT ▲</span>
          {build.hasShip(player) ? (
            <TableShip
              ship={ship}
              side={side}
              facing="up"
              marks={play.marks}
              selected={selected}
              clickable={keeping || (mine && !play.mode && !play.busy && !play.fight?.turnOver)}
              onModule={
                keeping
                  ? (slot) => slot !== cockpit && play.loot.setKeep(play.loot.keep === slot ? null : slot)
                  : mine
                    ? play.clickOwn
                    : undefined
              }
              drag={
                mine && plan
                  ? { sendable: (slot) => plan.sendable[slot] ?? 0, error: play.dropError, onDrop: play.dropChit }
                  : null
              }
              build={shipBuild}
            />
          ) : (
            <Berth player={player} play={play} />
          )}
        </div>
        <div className="tt-seat-side">
          <Rack player={player} play={play} />
          <div className="tt-held" title={`${player.label}: ${player.hand.length} in hand`} data-held={player.id}>
            {!holdsHand &&
              player.hand.map((id, k, all) => (
                <div key={`${id}-${k}`} className="tt-back items" style={{ transform: `rotate(${(k - (all.length - 1) / 2) * 12}deg)` }}>
                  N.O.M.A.D.
                </div>
              ))}
          </div>
        </div>
        <span className={`tt-seat-tag${active ? ' on' : ''}`}>
          {player.label}
          {tag}
          {editing && config.shipSizeRule !== 'draft' ? ` · ${sizeReadout(player.ship, config).text}` : ''}
        </span>
      </div>
    </div>
  );
}

/** Where a seat's cockpit goes, before it has drafted one. */
function Berth({ player, play }: { player: PlayerState; play: TablePlay }) {
  const { build } = play;
  const zone = useDropZone(`berth:${player.id}`, { accepts: (p) => build.berthAccepts(player, p), onDrop: (p) => build.berthDrop(player, p) });
  const takes = !zone.dragging && !!build.inHand && build.berthAccepts(player, build.inHand);
  return (
    <div className="tt-ship" style={{ gridTemplateColumns: 'repeat(3, var(--tt-cw))', gridTemplateRows: 'repeat(3, var(--tt-ch))' }}>
      {Array.from({ length: 9 }, (_, i) =>
        i === 4 ? (
          <div
            key={i}
            {...zone.props}
            className={`tt-guide tt-open${zone.over ? ' over' : zone.active || takes ? ' lit' : ''}`}
            title={takes ? 'Put the cockpit here' : `${player.label}'s cockpit goes here`}
            onClick={takes && build.inHand ? () => build.berthDrop(player, build.inHand!) : undefined}
          />
        ) : (
          <div key={i} className="tt-guide" />
        ),
      )}
    </div>
  );
}

/** A seat's energy tokens: what it has left to spend in the draft, then to put on its ship. */
function Purse({ player, play }: { player: PlayerState; play: TablePlay }) {
  const { build } = play;
  const zone = useDropZone(`purse:${player.id}`, { accepts: (p) => build.purseAccepts(player, p), onDrop: (p) => build.purseDrop(player, p) });
  const live = build.energyPhase && player.tokens > 0;
  const payload = live ? ({ kind: 'token', player: player.id } as const) : null;
  const held = build.inHand?.kind === 'token' && build.inHand.player === player.id;
  return (
    <div
      {...zone.props}
      className={`tt-purse${zone.over ? ' over' : zone.active ? ' lit' : ''}${held ? ' sel' : ''}`}
      data-purse={player.id}
      title={`${player.label}: ${player.tokens} energy token(s)${live ? '. Drag one onto a module, or click here and then click modules.' : ''}`}
      onClick={payload ? () => build.pick(payload) : undefined}
    >
      {Array.from({ length: player.tokens }, (_, i) => (
        <span key={i} className={`tt-chit${live ? ' drag' : ''}`} {...draggable(payload, () => <span className="tt-chit" style={{ width: '100%', height: '100%' }} />)} />
      ))}
    </div>
  );
}

/**
 * The cards lying face up beside a seat's ship: what it drafted and hasn't
 * fitted yet, or — at a rebuild — its scrap deck, laid out to build from.
 */
function Rack({ player, play }: { player: PlayerState; play: TablePlay }) {
  const { build } = play;
  const shown = (build.drafting && !build.cockpitRound && build.hasShip(player)) || build.rebuilding;
  const zone = useDropZone(`rack:${player.id}`, shown ? { accepts: (p) => build.rackAccepts(player, p), onDrop: (p) => build.rackDrop(player, p) } : null);
  if (!shown) return null;
  const kind = build.rebuilding ? 'scrap' : 'hold';
  const cards = build.rebuilding ? player.scrapDeck : player.carriedParts;
  const inHand = build.inHand;
  const takes = !zone.dragging && !!inHand && build.rackAccepts(player, inHand);
  return (
    <div
      {...zone.props}
      className={`tt-rack${zone.over ? ' over' : zone.active || takes ? ' lit' : ''}`}
      data-rack={player.id}
      onClick={takes && inHand ? () => build.rackDrop(player, inHand) : undefined}
    >
      <span className="tt-ui-tag">{build.rebuilding ? 'SCRAP DECK' : 'NOT FITTED'}</span>
      {cards.length === 0 && <div className="tt-guide tt-rack-empty" />}
      {cards.map((cardId, i) => {
        const payload = { kind, player: player.id, cardId } as const;
        const sel = (inHand?.kind === 'hold' || inHand?.kind === 'scrap') && inHand.player === player.id && inHand.cardId === cardId;
        return (
          <PartFace
            key={`${cardId}-${i}`}
            cardId={cardId}
            cls={`can tt-drag${sel ? ' sel' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              build.pick(payload);
            }}
            {...draggable(payload, cardGhost(cardId))}
          />
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- centre */

/**
 * The shared middle: the mission board across the top, then the decks, the
 * reveal spot, the die and the supply, and the open space every seat reaches
 * into — where the draft is dealt, loot is laid out, and the enemy ship sits
 * with its action decks beside it.
 */
function Center({ play, size }: { play: TablePlay; size: TableTweaks['size'] }) {
  const { state, fight, build } = play;
  const resolveEvent = useGameStore((s) => s.resolveEvent);
  const closePrompt = useGameStore((s) => s.closePrompt);
  const salvage = useGameStore((s) => s.salvage);
  const d = state.decks;
  const prompt = state.prompt;
  // Modules shot off a ship this fight lie on the discard too, until the fight is cleared away.
  const wrecked = fight
    ? [fight.enemy.ship, ...state.party.players.map((p) => p.ship)].reduce((n, s) => n + s.slots.filter((x) => x.destroyed).length, 0)
    : 0;
  const discards =
    d.parts.discardPile.length + d.cockpits.discardPile.length + d.items.discardPile.length + d.events.discardPile.length + wrecked;
  const reserve = d.parts.reserve.length + d.cockpits.reserve.length + d.items.reserve.length + d.events.reserve.length;
  const event = prompt?.kind === 'event' ? getCard(prompt.cardId) : undefined;
  const checkpoint = prompt?.kind === 'checkpoint';

  // A wreck stays where it was shot down until it's dealt with.
  const wreck: EnemyInstance | null = prompt?.kind === 'loot' || prompt?.kind === 'salvage' ? prompt.wreck : null;
  const enemy = wreck ?? fight?.enemy ?? null;
  // The boss comes apart a card at a time: what's been taken is off the table.
  const enemyShip = enemy ? (prompt?.kind === 'salvage' ? piecesLeft(enemy.ship, prompt.pieces) : enemy.ship) : null;
  const ext = enemyShip ? shipExtent(enemyShip) : { cols: 3, rows: 3 };
  const box = shipBox(ext.cols, ext.rows, size);
  const span = Math.max(box.w, box.h) + 12;
  const facing = SEAT_ANGLE[seatOf(state, wreck ? play.activeSeat : play.aggro)];
  // Turn the short way round, like the table does.
  const turn = useRef(facing);
  turn.current += ((((facing - turn.current) % 360) + 540) % 360) - 180;
  const aiming = !wreck && !!play.mode && !play.busy && play.controls.targets.length > 0;

  // Stripping a wreck: every card still on it can be picked up.
  const taker = prompt?.kind === 'salvage' ? prompt.claimants[prompt.turn] : undefined;
  const loose = enemyShip && wreck ? enemyShip.slots.filter((s) => !s.destroyed).map((s) => s.index) : [];
  const stripping =
    prompt?.kind === 'salvage' ? loose : prompt?.kind === 'loot' && play.config.lootOneModule ? loose.filter((i) => i !== shipEngine.cockpitIndex(enemyShip!)) : [];
  const strip = (slot: number) => {
    const partId = enemyShip?.slots[slot]?.partId;
    if (!partId) return;
    if (prompt?.kind === 'salvage' && taker) salvage(taker, partId);
    else if (prompt?.kind === 'loot') play.loot.setTake(play.loot.take === slot ? null : slot);
  };

  const dealt = build.drafting && !build.energyPhase;
  const reward = prompt?.kind === 'reward' ? prompt.cardIds : null;

  return (
    <section className="tt-center" aria-label="Shared play area">
      <MissionStrip play={play} />
      <div className="tt-center-main">
        <div className="tt-decks">
          <Deck kind="parts" label="PARTS" cls="" count={d.parts.drawPile.length} />
          <Deck kind="cockpits" label="COCKPITS" cls="cockpits" count={d.cockpits.drawPile.length} />
          <Deck kind="items" label="ITEMS" cls="items" count={d.items.drawPile.length} />
          <Deck kind="events" label="EVENTS" cls="events" count={d.events.drawPile.length} />
          <Deck
            kind="rare"
            label="RARE"
            cls="rare"
            count={reserve}
            title={checkpoint ? 'Rarity checkpoint: the next stack has been shuffled in. Click to push on.' : 'Set aside until a rarity checkpoint'}
            onClick={checkpoint ? closePrompt : undefined}
          />
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
              <button className="tt-ecard" key={event.id} data-peek={event.id} title="Carry out the event, then discard it" onClick={resolveEvent}>
                <div className="tt-band">EVENT</div>
                <h4>{event.name}</h4>
                <p>{printedText(event)}</p>
              </button>
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

        {dealt ? (
          <DraftSpread play={play} />
        ) : reward ? (
          <RewardSpread cardIds={reward} />
        ) : (
          <div className="tt-enemy-box" style={{ width: span, height: span }}>
            <div className="tt-ship-wrap tt-enemy-turn" style={{ transform: `rotate(${turn.current}deg)` }}>
              {enemy && enemyShip ? (
                <TableShip
                  key={enemy.instanceId}
                  ship={enemyShip}
                  side={{ kind: 'enemy', id: enemy.instanceId }}
                  facing="down"
                  marks={play.marks}
                  targets={aiming ? play.controls.targets : stripping.length > 0 ? stripping : undefined}
                  targetCls={aiming ? 'tgt' : 'take'}
                  selected={prompt?.kind === 'loot' ? play.loot.take : null}
                  onModule={aiming ? play.clickEnemy : stripping.length > 0 ? strip : undefined}
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
        )}

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
                    data-peek={deck.faceUp}
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

/** A wreck with only the cards nobody has taken yet still on it. */
function piecesLeft(ship: Ship, pieces: CardId[]): Ship {
  const left = pieces.slice();
  return {
    ...ship,
    slots: ship.slots.map((slot) => {
      const at = left.indexOf(slot.partId);
      if (at >= 0) left.splice(at, 1);
      return { ...slot, destroyed: at < 0 };
    }),
  };
}

/**
 * The draft, dealt face up into the middle: one card more than there are
 * seats still drafting. The seat on the clock carries one to its ship — a
 * drag, or a click and then a click on where it goes.
 */
function DraftSpread({ play }: { play: TablePlay }) {
  const { state, build } = play;
  const table = state.setup?.table ?? [];
  const round = state.setup?.round ?? 0;
  // Copies of a card are told apart by how many lie further along: the engine
  // takes the first copy, so every other card keeps its key.
  const after = (i: number) => table.slice(i + 1).filter((id) => id === table[i]).length;
  const inHand = build.inHand;
  return (
    <div className="tt-spread" aria-label="Draft cards" style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, table.length))}, var(--tt-cw))` }}>
      {table.map((cardId, i) => {
        const error = build.draftError(cardId);
        const payload = error ? null : ({ kind: 'table', cardId } as const);
        return (
          <PartFace
            key={`${round}:${cardId}:${after(i)}`}
            cardId={cardId}
            cls={`${error ? 'off' : 'can tt-drag'}${inHand?.kind === 'table' && inHand.cardId === cardId ? ' sel' : ''}`}
            style={{ width: 'var(--tt-cw)', height: 'var(--tt-ch)', animationDelay: `${i * 70}ms` }}
            {...(error ? { title: `Can't take it: ${error}` } : {})}
            onClick={() => payload && build.pick(payload)}
            {...draggable(payload, cardGhost(cardId))}
          />
        );
      })}
    </div>
  );
}

/** The Item cards a Loot step turned up, face up in the middle until a seat takes them. */
function RewardSpread({ cardIds }: { cardIds: CardId[] }) {
  return (
    <div className="tt-spread items" aria-label="Loot" style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, cardIds.length))}, auto)` }}>
      {cardIds.map((id, i) => {
        const card = getCard(id);
        if (!card) return null;
        return (
          <div
            key={`${id}-${i}`}
            className="tt-icard flat tt-drag"
            data-peek={id}
            style={{ animationDelay: `${i * 90}ms` }}
            title="Carry it to the seat that takes the loot"
            {...draggable({ kind: 'reward' }, () => (
              <Ghost w="122px" h="170px">
                <ItemFace card={card} cls="tt-icard flat" />
              </Ghost>
            ))}
          >
            <ItemFace card={card} />
          </div>
        );
      })}
    </div>
  );
}

/** What an Item card prints. */
function ItemFace({ card, cls }: { card: Card; cls?: string }) {
  const face = (
    <>
      <div className="tt-band">
        <span>ITEM</span>
        <span>◆</span>
      </div>
      <div className="nm">{card.name}</div>
      <div className="tx">{printedText(card)}</div>
      <div className="ft">{cardTitleLine(card).toUpperCase()}</div>
    </>
  );
  return cls ? (
    <div className={cls} style={{ width: '100%', height: '100%' }}>
      {face}
    </div>
  ) : (
    face
  );
}

const GLYPH = { attack: '⨯', generate: '+', reroute: '⇄' } as const;

function Deck({
  kind,
  label,
  cls,
  count,
  title,
  onClick,
}: {
  kind: string;
  label: string;
  cls: string;
  count: number;
  title?: string;
  /** Set while the deck is waiting to be handled. */
  onClick?: () => void;
}) {
  return (
    <div className={`tt-deck${onClick ? ' next' : ''}`} data-deck={kind} title={`${title ?? label} · ${count} cards`} onClick={onClick}>
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
function MissionStrip({ play }: { play: TablePlay }) {
  const { state, config } = play;
  const moveTo = useGameStore((s) => s.moveTo);
  const { mission } = state;
  // Who would fight at a step: the party moving together, or one seat alone when it's split.
  const party = state.split ? 1 : state.party.players.filter((p) => !p.destroyed).length;
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
            title={
              node.type === 'combat'
                ? `Combat, depth ${node.column}: an enemy of about ${enemyModuleCount(config, node.column, party)} modules`
                : node.raisesRarityTo
                  ? `Rarity checkpoint: rarity up to ${node.raisesRarityTo}`
                  : style.label
            }
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
                {(node.markers?.length ?? 0) > 0 && <span className="tt-marker" title={node.markers!.join(', ')} />}
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
            data-peek={id}
            onClick={() => {
              if (!live) return;
              select(null);
              setMode(sel ? null : { kind: 'item', cardId: id });
            }}
          >
            <ItemFace card={card} />
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- card flights */

/**
 * Things changing place, shown crossing the table: an item dealt from its deck
 * or carried from the middle to a seat, an item played to the discard, an
 * event turned onto the reveal spot and cleared off it again, tokens paid into
 * the supply, a piece of a wreck going to a scrap deck, a ship changing hands,
 * a rarer stack shuffled into the decks.
 */
function useCardFlights(state: GameState, play: TablePlay) {
  type Seen = {
    hands: Record<string, number>;
    tokens: Record<string, number>;
    scrap: Record<string, number>;
    ships: Record<string, string>;
    event: string | null;
    reward: boolean;
    wreck: boolean;
    rarity: number;
    drafting: boolean;
    run: string;
  };
  const seen = useRef<Seen | null>(null);
  const active = play.side?.kind === 'enemy' ? null : play.activeSeat;
  useEffect(() => {
    const players = state.party.players;
    const per = <T,>(f: (p: PlayerState) => T) => Object.fromEntries(players.map((p) => [p.id, f(p)]));
    const now: Seen = {
      hands: per((p) => p.hand.length),
      tokens: per((p) => p.tokens),
      scrap: per((p) => p.scrapDeck.length),
      ships: per((p) => p.shipId),
      event: state.prompt?.kind === 'event' ? state.prompt.cardId : null,
      reward: state.prompt?.kind === 'reward',
      wreck: state.prompt?.kind === 'loot' || state.prompt?.kind === 'salvage',
      rarity: state.maxRarityNow,
      drafting: state.phase === 'setup' && !state.setup?.complete,
      run: `${state.seed}:${state.sector}`,
    };
    const before = seen.current;
    seen.current = now;
    if (!before || before.run !== now.run) return;
    const q = (sel: string) => document.querySelector(sel);
    const discard = q('#tt-discard');
    const middle = q('.tt-enemy-box') ?? q('.tt-spread');
    for (const p of players) {
      const held = p.id === active ? q('.tt-hand') : q(`[data-held="${p.id}"]`);
      const got = (now.hands[p.id] ?? 0) - (before.hands[p.id] ?? 0);
      // Loot is carried from the middle of the table; anything else comes off the Items deck.
      const from = before.reward ? middle : q('[data-deck="items"]');
      for (let i = 0; i < Math.min(3, got); i++) window.setTimeout(() => cardFlight(from, held, 'items', 620), i * 140);
      if (got < 0) cardFlight(held, discard, 'items', 560);

      // Draft tokens are paid into the supply; a token put on a module is carried there by hand.
      const paid = (before.tokens[p.id] ?? 0) - (now.tokens[p.id] ?? 0);
      if (before.drafting && paid > 0) chitsBetweenEls(q(`[data-purse="${p.id}"]`), q('.tt-bank'), paid);

      if (before.wreck && (now.scrap[p.id] ?? 0) > (before.scrap[p.id] ?? 0)) cardFlight(middle, q(`[data-scrap="${p.id}"]`), 'scrap', 640);
      if (before.wreck && before.ships[p.id] !== now.ships[p.id]) {
        const seat = q(`[data-seat-ship="${p.id}"]`);
        cardFlight(seat, q('[data-deck="parts"]'), '', 700);
        window.setTimeout(() => cardFlight(middle, seat, '', 700), 160);
      }
    }
    if (now.event && now.event !== before.event) cardFlight(q('[data-deck="events"]'), q('#tt-reveal'), 'events', 600);
    if (!now.event && before.event) cardFlight(q('#tt-reveal'), discard, 'events', 520);
    if (now.rarity > before.rarity) {
      ['parts', 'cockpits', 'items', 'events'].forEach((deck, i) =>
        window.setTimeout(() => cardFlight(q('[data-deck="rare"]'), q(`[data-deck="${deck}"]`), 'rare', 620), i * 150),
      );
    }
  }, [state, active]);
}
