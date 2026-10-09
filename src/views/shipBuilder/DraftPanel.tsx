import { AnimatePresence, motion } from 'motion/react';
import type { CardId, GameConfig, GameState, PartCard, PlayerId } from '@engine/types';
import { game, powerCostOf } from '@engine';
import { Button } from '@/components/ds';
import { ModuleTile } from '@/components/game/ModuleTile';
import { dragSource, type DragPayload } from '@/components/fx/drag';
import { CONTENT, getPart } from '@data';
import { useConfig } from '@/store/configStore';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

// -------------------------------------------------------------------- draft

/**
 * The draft's control strip: which round, the snake order with the seat on
 * the clock, what every seat has left to spend, and the buttons that end it.
 */
export function DraftBar({ state }: { state: GameState }) {
  const config = useConfig();
  const draftAll = useGameStore((s) => s.draftAll);
  const passDraft = useGameStore((s) => s.passDraft);
  const startMission = useGameStore((s) => s.startMission);
  const setup = state.setup!;
  const onTheClock = game.nextDrafter(state);
  const seat = state.party.players.find((p) => p.id === onTheClock);
  const label = (id: PlayerId) => state.party.players.find((p) => p.id === id)?.label ?? id;
  const canPass = !!seat && setup.round > 0;
  const canStart = setup.complete || setup.round > 0;
  const unplaced = state.party.players.reduce((sum, p) => sum + (setup.complete ? p.tokens : 0), 0);

  return (
    <div className="mb-3 flex flex-none flex-wrap items-center gap-3 border-2 border-border-strong bg-crt-glass px-3 py-2.5">
      <span className="font-mono text-[10px] tracking-console text-crt-green-500">
        SETUP ·{' '}
        {setup.complete
          ? 'PLACE ENERGY'
          : setup.round === 0
            ? 'COCKPIT ROUND'
            : `MODULE ROUND ${setup.round}/${config.draftRounds}`}
      </span>

      {!setup.complete && (
        <div className="flex items-center gap-1 font-mono text-[11px] text-crt-white">
          <span className="text-putty-400">ORDER {setup.round % 2 === 0 ? '→' : '←'}</span>
          {setup.order.map((id) => (
            <motion.span
              key={id}
              layout
              className={[
                'border px-1.5 py-px transition-colors duration-200',
                id === onTheClock
                  ? 'border-crt-green-500 text-crt-green-500'
                  : setup.picked.includes(id)
                    ? 'border-putty-600 text-putty-500 line-through'
                    : 'border-putty-600 text-crt-white',
              ].join(' ')}
            >
              {label(id)}
              {setup.passed.includes(id) ? ' · PASS' : ''}
            </motion.span>
          ))}
        </div>
      )}

      <span className="text-[15px] text-crt-white">
        {setup.complete
          ? 'Draft over. Drag modules to rearrange, and put your leftover tokens on them as starting ⚡ — drag a token onto a module, or use + / −.'
          : seat
            ? setup.round === 0
              ? `${seat.label} takes a cockpit.`
              : `${seat.label} buys a module or passes — ${seat.tokens} token(s) left. Every token not spent is starting ⚡.`
            : 'Dealing…'}
      </span>

      <div className="ml-auto flex gap-2">
        {canPass && (
          <Button size="sm" variant="secondary" onClick={passDraft} title="Skip this round and keep the tokens for starting energy">
            Pass
          </Button>
        )}
        {!setup.complete && (
          <Button size="sm" variant="secondary" onClick={draftAll}>
            Draft the rest
          </Button>
        )}
        <Button
          size="sm"
          className={setup.complete && unplaced === 0 ? 'attention' : ''}
          onClick={startMission}
          disabled={!canStart}
          title={
            !canStart
              ? 'Everyone needs a cockpit first'
              : unplaced > 0
                ? `${unplaced} token(s) still unplaced — they’re lost if you start now`
                : 'Anything still on the table goes back to its deck'
          }
        >
          Start the mission{unplaced > 0 ? ` · ${unplaced}⚡ unplaced` : ''}
        </Button>
      </div>
    </div>
  );
}

/**
 * The face-up spread: seats still drafting + 1 cards, dealt onto the table.
 * Anything the seat on the clock can't afford is dimmed, with the reason on
 * hover.
 */
export function DraftTable({
  state,
  table,
  picking,
  onTake,
}: {
  state: GameState;
  table: CardId[];
  picking: boolean;
  onTake: (cardId: CardId) => void;
}) {
  const config = useConfig();
  const selectedPartId = useUiStore((s) => s.selectedPartId);
  const selectPart = useUiStore((s) => s.selectPart);
  const onTheClock = game.nextDrafter(state);
  const seat = state.party.players.find((p) => p.id === onTheClock);
  const selected = selectedPartId && table.includes(selectedPartId) ? selectedPartId : null;
  const why = (cardId: CardId) =>
    onTheClock ? game.pickError(CONTENT, config, state, onTheClock, cardId) : 'nobody is picking';
  const selectedError = selected ? why(selected) : null;
  const round = state.setup?.round ?? 0;
  // Copies of a card are told apart by how many of it lie further along: the
  // engine takes the first copy, so this keeps every other card's key steady.
  const after = (i: number) => table.slice(i + 1).filter((id) => id === table[i]).length;

  return (
    <div className="mb-3 flex flex-col gap-2 border-2 border-border-strong bg-surface-panel p-3 shadow-raised">
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="font-display text-[13px] font-bold">ON THE TABLE</div>
        <div className="font-mono text-[12px] text-putty-700">{table.length}</div>
        <div className="text-[14px] text-putty-700">
          {round === 0
            ? 'Take a cockpit — it sets your attack, your energy and how big your ship can get. Cockpits are free.'
            : 'Buy a module with energy tokens — drag it onto a cell of your ship, or click it and Take it.'}
        </div>
        {seat && round > 0 && <TokenRow count={seat.tokens} />}
        {selected && picking && (
          <div className="ml-auto">
            <Button size="sm" disabled={!!selectedError} title={selectedError ?? undefined} onClick={() => onTake(selected)}>
              Take {getPart(selected)?.name ?? selected}
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pt-1 pb-2">
        <AnimatePresence mode="popLayout">
          {table.map((cardId, i) => {
            const n = after(i);
            const error = why(cardId);
            const part = getPart(cardId);
            const payload: DragPayload | null = picking && !error ? { kind: 'table', cardId } : null;
            return (
              <motion.div
                key={`${round}:${cardId}:${n}`}
                layout
                initial={{ opacity: 0, y: -40, rotate: -10, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24, delay: i * 0.07 } }}
                exit={{ opacity: 0, scale: 0.7, y: 20, transition: { duration: 0.2 } }}
                className="flex w-[104px] flex-none flex-col gap-1"
              >
                <div className="h-[140px]" data-table-card={cardId}>
                  <ModuleTile
                    slot={{ partId: cardId }}
                    variant="scrap"
                    selected={cardId === selectedPartId}
                    hint={picking && error ? 'blocked' : null}
                    title={error ?? undefined}
                    {...dragSource(payload, () => <ModuleTile slot={{ partId: cardId }} variant="scrap" />)}
                    onClick={() => selectPart(cardId === selectedPartId ? null : cardId)}
                  />
                </div>
                {part && <CostLine part={part} config={config} />}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A row of energy tokens — what a seat has left to spend. */
function TokenRow({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1" title={`${count} energy token(s) left`}>
      <AnimatePresence initial={false}>
        {Array.from({ length: count }, (_, i) => (
          <motion.span
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0, y: -10 }}
            className="block h-3 w-3 rounded-full border border-crt-green-700 bg-crt-green-500"
          />
        ))}
      </AnimatePresence>
      <span className="ml-1 font-mono text-[11px] text-putty-700">{count}⚡</span>
    </div>
  );
}

/** What a card costs: tokens for a module; a cockpit is free, and prints its limit. */
function CostLine({ part, config }: { part: PartCard; config: GameConfig }) {
  const text =
    part.role === 'COCKPIT'
      ? config.shipSizeRule === 'slots'
        ? `FREE · ${part.slots ?? 0} SLOTS`
        : config.shipSizeRule === 'budget'
          ? `FREE · ◆${part.powerRating ?? 0} BUDGET`
          : 'FREE'
      : `COSTS ${powerCostOf(part)} TOKEN${powerCostOf(part) === 1 ? '' : 'S'}`;
  return <div className="text-center font-mono text-[10px] text-putty-700">{text}</div>;
}
