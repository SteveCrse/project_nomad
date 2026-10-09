import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameState, PlayerId } from '@engine/types';
import { printedText, ship as shipEngine } from '@engine';
import { Button } from '@/components/ds';
import { CardTile } from './CardTile';
import { ModuleTile } from './ModuleTile';
import { ShipGrid } from './ShipGrid';
import { getCard } from '@data';
import { scrapCapacityFor } from '@/lib/combatView';
import { useConfig } from '@/store/configStore';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Whatever is blocking the board: an Event card, a Loot payout, a wreck to
 * take over, the boss to split, or a rebuild. One overlay so the run can
 * never continue past a decision that hasn't been made.
 */
export function PromptOverlay({ state }: { state: GameState }) {
  const tab = useUiStore((s) => s.tab);
  const prompt = state.prompt;
  // A rebuild sends you to the builder — the overlay would sit on top of the
  // thing it just asked you to go and use.
  const shown = !!prompt && !(prompt.kind === 'rearrange' && tab === 'builder');
  // The prompt waits a beat after a fight, so the killing blow can land first.
  const delay = prompt?.kind === 'loot' || prompt?.kind === 'salvage' ? 0.9 : 0;

  return (
    <AnimatePresence>
      {shown && prompt && (
        <motion.div
          key={prompt.kind}
          className="absolute inset-0 z-20 flex items-center justify-center bg-n-950/45 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay, duration: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
        >
          <motion.div
            className="max-h-full w-full max-w-[900px] overflow-auto border-2 border-border-strong bg-surface-panel p-4 shadow-panel"
            initial={{ y: 30, scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1, transition: { delay, type: 'spring', stiffness: 320, damping: 28 } }}
            exit={{ y: 16, scale: 0.97, opacity: 0 }}
          >
            {prompt.kind === 'event' && <EventPrompt state={state} cardId={prompt.cardId} />}
            {prompt.kind === 'reward' && <RewardPrompt state={state} cardIds={prompt.cardIds} />}
            {prompt.kind === 'loot' && <LootPrompt state={state} />}
            {prompt.kind === 'salvage' && <SalvagePrompt state={state} />}
            {prompt.kind === 'checkpoint' && <CheckpointPrompt newMaxRarity={prompt.newMaxRarity} />}
            {prompt.kind === 'rearrange' && <RearrangePrompt state={state} reason={prompt.reason} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Cards dealt into a prompt one after another, rather than all at once. */
function Dealt({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -24, rotate: -6 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.15 + i * 0.08 }}
    >
      {children}
    </motion.div>
  );
}

function Header({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <div className="font-display text-[18px] font-bold">{title}</div>
      {sub && <div className="font-mono text-[12px] text-putty-700">{sub}</div>}
    </div>
  );
}

function SeatPicker({
  state,
  seats,
  who,
  onPick,
  caption,
}: {
  state: GameState;
  seats: PlayerId[];
  who: PlayerId;
  onPick: (id: PlayerId) => void;
  caption: (id: PlayerId) => string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {seats.map((id) => {
        const seat = state.party.players.find((p) => p.id === id);
        if (!seat) return null;
        return (
          <button
            key={id}
            onClick={() => onPick(id)}
            className={[
              'cursor-pointer border px-2.5 py-1 font-mono text-[11px]',
              who === id ? 'border-n-900 bg-n-900 text-cream-100' : 'border-putty-500 bg-putty-100',
            ].join(' ')}
          >
            {seat.label} · {caption(id)}
          </button>
        );
      })}
    </div>
  );
}

function EventPrompt({ state, cardId }: { state: GameState; cardId: string }) {
  const resolveEvent = useGameStore((s) => s.resolveEvent);
  const card = getCard(cardId);
  return (
    <>
      <Header title="EVENT STEP" sub={`Sector ${state.sector}`} />
      <div className="flex gap-4">
        {card && (
          <Dealt i={0}>
            <CardTile card={card} />
          </Dealt>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="border border-border-strong bg-crt-glass p-3 text-[15px] leading-[1.4] text-crt-white">
            {card && printedText(card)}
          </div>
          <div className="text-[14px] text-putty-700">
            The tool resolves the structured half of the card — markers, hazard hits, loot draws, ambushes.
            Anything the card asks a player to choose is still a table decision.
          </div>
          <div>
            <Button onClick={resolveEvent}>Resolve event</Button>
          </div>
        </div>
      </div>
    </>
  );
}

function RewardPrompt({ state, cardIds }: { state: GameState; cardIds: string[] }) {
  const claimReward = useGameStore((s) => s.claimReward);
  const config = useConfig();
  const alive = state.party.players.filter((p) => !p.destroyed);
  const [who, setWho] = useState<PlayerId>(alive[0]?.id ?? 'p1');

  return (
    <>
      <Header title="LOOT STEP" sub={`${cardIds.length} card(s) drawn from the Items deck`} />
      <div className="mb-3 flex flex-wrap gap-3">
        {cardIds.map((id, i) => {
          const card = getCard(id);
          return card ? (
            <Dealt key={`${id}-${i}`} i={i}>
              <CardTile card={card} />
            </Dealt>
          ) : null;
        })}
      </div>
      <SeatPicker
        state={state}
        seats={alive.map((p) => p.id)}
        who={who}
        onPick={setWho}
        caption={(id) => `HAND ${state.party.players.find((p) => p.id === id)?.hand.length ?? 0}/${config.handSize}`}
      />
      <Button onClick={() => claimReward(who)}>Take loot</Button>
    </>
  );
}

/**
 * A regular kill. Only what survives can be salvaged: one seat may abandon its
 * ship and take this one over, keeping a single module from the old one in its
 * scrap deck. The idea-list option — one module instead of the ship — is
 * offered when the config switches it on.
 */
function LootPrompt({ state }: { state: GameState }) {
  const config = useConfig();
  const resolveLoot = useGameStore((s) => s.resolveLoot);
  const prompt = state.prompt;
  const claimants = prompt?.kind === 'loot' ? prompt.claimants : [];
  const [who, setWho] = useState<PlayerId | null>(claimants[0] ?? null);
  const [keepSlot, setKeepSlot] = useState<number | null>(null);
  const [takeSlot, setTakeSlot] = useState<number | null>(null);
  if (prompt?.kind !== 'loot') return null;

  const wreck = prompt.wreck;
  const player = state.party.players.find((p) => p.id === who);
  const scrapFull = player ? player.scrapDeck.length >= scrapCapacityFor(player, config) : true;
  const survivors = wreck.ship.slots.filter((s) => !s.destroyed && s.partId !== wreck.ship.cockpitId);
  const ownModules = player?.ship.slots.filter((s) => !s.destroyed && s.partId !== player.ship.cockpitId) ?? [];

  return (
    <>
      <Header title="LOOT" sub={`${wreck.name} is down — only what survived can be salvaged`} />

      <div className="mb-3 border border-border-strong bg-putty-100 p-2.5">
        <div className="mb-1.5 font-mono text-[10px] tracking-console text-putty-700">THE WRECK, AS YOU’D FLY IT — FRONT UP</div>
        <div className="flex justify-center overflow-x-auto">
          <ShipGrid
            ship={wreck.ship}
            size="sm"
            renderSlot={(slot) => (
              <ModuleTile
                slot={slot}
                selected={config.lootOneModule && takeSlot === slot.index}
                {...(config.lootOneModule && !slot.destroyed && slot.partId !== wreck.ship.cockpitId
                  ? { onClick: () => setTakeSlot(slot.index) }
                  : {})}
              />
            )}
          />
        </div>
        <div className="pt-1.5 text-[12px] text-putty-700">
          {survivors.length} module(s) survived. Its cockpit comes back online on start energy for whoever takes it.
        </div>
      </div>

      {claimants.length > 0 && who && (
        <SeatPicker
          state={state}
          seats={claimants}
          who={who}
          onPick={(id) => {
            setWho(id);
            setKeepSlot(null);
          }}
          caption={(id) => {
            const seat = state.party.players.find((p) => p.id === id)!;
            return `SCRAP ${seat.scrapDeck.length}/${scrapCapacityFor(seat, config)}`;
          }}
        />
      )}

      <div className={`grid gap-4 ${config.lootOneModule ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="flex flex-col gap-2 border border-border-strong bg-putty-100 p-3">
          <div className="font-display text-[14px] font-bold">TAKE THE SHIP OVER</div>
          <div className="text-[13px] leading-[1.35] text-putty-800">
            Abandon {player?.ship.name ?? 'your ship'} and fly {wreck.name}. Keep one module from the old ship in
            the scrap deck; the rest is shuffled back into the parts deck.
            {scrapFull && <span className="text-toggle-red-500"> Scrap deck is full — nothing can be kept.</span>}
          </div>
          <div className="font-mono text-[10px] tracking-console text-putty-700">KEEP FROM YOUR SHIP</div>
          <div className="flex flex-wrap gap-1.5">
            {ownModules.map((slot) => (
              <motion.div key={slot.index} className="h-[104px] w-[78px]" whileHover={{ y: -3 }}>
                <ModuleTile slot={slot} selected={keepSlot === slot.index} onClick={() => setKeepSlot(slot.index)} />
              </motion.div>
            ))}
          </div>
          <div>
            <Button
              size="sm"
              disabled={!who}
              onClick={() => resolveLoot(who, { option: 'take-ship', keepFromOldShip: scrapFull ? null : keepSlot })}
            >
              Take the ship{keepSlot === null || scrapFull ? ' · keep nothing' : ''}
            </Button>
          </div>
        </div>

        {config.lootOneModule && (
          <div className="flex flex-col gap-2 border border-border-strong bg-putty-100 p-3">
            <div className="font-display text-[14px] font-bold">TAKE ONE MODULE</div>
            <div className="text-[13px] leading-[1.35] text-putty-800">
              From the rules’ ideas list: keep your ship and strip one surviving module into the scrap deck. Pick
              it on the wreck above.
              {scrapFull && <span className="text-toggle-red-500"> Scrap deck is full.</span>}
            </div>
            <div>
              <Button
                size="sm"
                disabled={!who || takeSlot === null || scrapFull}
                onClick={() => resolveLoot(who, { option: 'take-module', takeSlot: takeSlot ?? 0 })}
              >
                Take the module
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <Button size="sm" variant="ghost" onClick={() => resolveLoot(null, { option: 'leave' })}>
          Leave the wreck
        </Button>
      </div>
    </>
  );
}

/** The boss, taken in pieces: round the table, one part at a time, into scrap decks. */
function SalvagePrompt({ state }: { state: GameState }) {
  const config = useConfig();
  const salvage = useGameStore((s) => s.salvage);
  const [pick, setPick] = useState<number | null>(null);
  const prompt = state.prompt;
  if (prompt?.kind !== 'salvage') return null;

  const who = prompt.claimants[prompt.turn]!;
  const seat = state.party.players.find((p) => p.id === who);

  return (
    <>
      <Header title="THE BOSS, IN PIECES" sub={`${prompt.wreck.name} is down — mission complete`} />
      <div className="mb-3 text-[14px] text-putty-800">
        Its surviving parts go round the table into scrap decks for the next mission. Whatever nobody takes is left
        drifting.
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <AnimatePresence mode="popLayout">
          {prompt.pieces.map((cardId, i) => (
            <motion.div key={`${cardId}-${i}`} layout className="h-[120px] w-[90px]" exit={{ opacity: 0, y: -30, scale: 0.8 }}>
              <Dealt i={i}>
                <div className="h-[120px] w-[90px]">
                  <ModuleTile slot={{ partId: cardId }} variant="scrap" selected={pick === i} onClick={() => setPick(i)} />
                </div>
              </Dealt>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px]">
          <span className="font-bold" style={{ color: seat?.accent }}>
            {seat?.label}
          </span>{' '}
          picks · SCRAP {seat?.scrapDeck.length}/{seat ? scrapCapacityFor(seat, config) : 0}
        </span>
        <Button
          size="sm"
          disabled={pick === null || !prompt.pieces[pick]}
          onClick={() => {
            if (pick !== null) salvage(who, prompt.pieces[pick]!);
            setPick(null);
          }}
        >
          Take it
        </Button>
        <Button size="sm" variant="ghost" onClick={() => salvage(who, null)}>
          Pass
        </Button>
      </div>
    </>
  );
}

function CheckpointPrompt({ newMaxRarity }: { newMaxRarity: number }) {
  const closePrompt = useGameStore((s) => s.closePrompt);
  return (
    <>
      <Header title="RARITY CHECKPOINT" sub={`Ceiling raised to tier ${newMaxRarity}`} />
      <div className="mb-3 text-[15px] text-putty-800">
        A stack of rarer cards has been shuffled into the decks. Draws from here on — enemies included — can turn
        up the harder cards.
      </div>
      <Button onClick={closePrompt}>Push on</Button>
    </>
  );
}

/** The end of a mission (or an opted-in checkpoint): rebuild in the builder. */
function RearrangePrompt({ state, reason }: { state: GameState; reason: string }) {
  const config = useConfig();
  const closePrompt = useGameStore((s) => s.closePrompt);
  const setTab = useUiStore((s) => s.setTab);
  const setBuilderPlayer = useUiStore((s) => s.setBuilderPlayer);

  return (
    <>
      <Header
        title={reason === 'mission-end' ? 'MISSION COMPLETE' : 'REARRANGEMENT POINT'}
        sub={reason === 'mission-end' ? 'Build your next ship from what you fly and the scrap deck' : 'Checkpoint'}
      />
      <div className="flex flex-col gap-3">
        {state.party.players.map((player) => (
          <div key={player.id} className="flex flex-wrap items-center gap-3 border border-border-strong bg-putty-100 p-3">
            <span className="font-display text-[14px] font-bold">{player.label}</span>
            <span className="text-[14px] text-putty-700">{player.ship.name}</span>
            <span className="font-mono text-[11px] text-putty-700">
              {shipEngine.moduleCount(player.ship)} MODULE(S) · SCRAP {player.scrapDeck.length}/{scrapCapacityFor(player, config)}
            </span>
            <div className="ml-auto">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setBuilderPlayer(player.id);
                  setTab('builder');
                }}
              >
                Rebuild in the builder
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Button onClick={closePrompt}>{reason === 'mission-end' ? 'End mission' : 'Push on'}</Button>
      </div>
    </>
  );
}
