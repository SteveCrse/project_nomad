import { useState } from 'react';
import type { GameState, PlayerId } from '@engine/types';
import { printedText } from '@engine';
import { Button } from '@/components/ds';
import { CardTile } from './CardTile';
import { ModuleTile } from './ModuleTile';
import { getCard, getPart } from '@data';
import { scrapCapacityFor } from '@/lib/combatView';
import { useConfig } from '@/store/configStore';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Whatever is blocking the board: an Event card, a Loot payout, the A/B
 * choice over a wreck, or a rearrangement point. One overlay so the run can
 * never continue past a decision that hasn't been made.
 */
export function PromptOverlay({ state }: { state: GameState }) {
  const tab = useUiStore((s) => s.tab);
  const prompt = state.prompt;
  if (!prompt) return null;
  // A rearrangement point sends you to the builder to lay the grid out — the
  // overlay would sit on top of the thing it just asked you to go and use.
  if (prompt.kind === 'rearrange' && tab === 'builder') return null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-n-950/45 p-6">
      <div className="max-h-full w-full max-w-[900px] overflow-auto border-2 border-border-strong bg-surface-panel p-4 shadow-panel">
        {prompt.kind === 'event' && <EventPrompt state={state} cardId={prompt.cardId} />}
        {prompt.kind === 'reward' && <RewardPrompt state={state} cardIds={prompt.cardIds} />}
        {prompt.kind === 'loot' && <LootPrompt state={state} />}
        {prompt.kind === 'checkpoint' && <CheckpointPrompt newMaxRarity={prompt.newMaxRarity} />}
        {prompt.kind === 'rearrange' && <RearrangePrompt state={state} reason={prompt.reason} />}
      </div>
    </div>
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

function EventPrompt({ state, cardId }: { state: GameState; cardId: string }) {
  const resolveEvent = useGameStore((s) => s.resolveEvent);
  const card = getCard(cardId);
  return (
    <>
      <Header title="EVENT STEP" sub={`Sector ${state.sector}`} />
      <div className="flex gap-4">
        {card && <CardTile card={card} />}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="border border-border-strong bg-crt-glass p-3 text-[15px] leading-[1.4] text-crt-white">
            {card && printedText(card)}
          </div>
          <div className="text-[14px] text-putty-700">
            The tool resolves the structured half of the card — markers, damage, loot draws,
            ambushes. Anything the card asks a player to choose is still a table decision.
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
  const [who, setWho] = useState<PlayerId>(state.party.players[0]?.id ?? 'p1');

  return (
    <>
      <Header title="LOOT STEP" sub={`${cardIds.length} card(s) drawn from the Items deck`} />
      <div className="mb-3 flex flex-wrap gap-3">
        {cardIds.map((id) => {
          const card = getCard(id);
          return card ? <CardTile key={id} card={card} /> : null;
        })}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-putty-700">TO HAND</span>
        {state.party.players.map((p) => (
          <button
            key={p.id}
            onClick={() => setWho(p.id)}
            className={[
              'cursor-pointer border px-2.5 py-1 font-mono text-[11px]',
              who === p.id ? 'border-n-900 bg-n-900 text-cream-100' : 'border-putty-500 bg-putty-100',
            ].join(' ')}
          >
            {p.label} · {p.hand.length}/{config.handSize}
          </button>
        ))}
      </div>
      <Button onClick={() => claimReward(who)}>Take loot</Button>
    </>
  );
}

/** The rules' loot phase: A (take the ship) or B (take one module). */
function LootPrompt({ state }: { state: GameState }) {
  const config = useConfig();
  const resolveLoot = useGameStore((s) => s.resolveLoot);
  const prompt = state.prompt;
  const [who, setWho] = useState<PlayerId>(
    (prompt?.kind === 'loot' ? prompt.claimants[0] : undefined) ?? state.party.players[0]?.id ?? 'p1',
  );
  const [keepSlot, setKeepSlot] = useState<number | null>(null);
  const [takeSlot, setTakeSlot] = useState<number | null>(null);
  if (prompt?.kind !== 'loot') return null;

  const wreck = prompt.wreck;
  const player = state.party.players.find((p) => p.id === who);
  const scrapFull = player ? player.scrapDeck.length >= scrapCapacityFor(player, config) : false;

  return (
    <>
      <Header
        title="LOOT PHASE"
        sub={`${wreck.name} is wrecked — the party takes one option`}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-putty-700">CLAIMED BY</span>
        {prompt.claimants.map((id) => {
          const seat = state.party.players.find((p) => p.id === id);
          if (!seat) return null;
          return (
            <button
              key={id}
              onClick={() => setWho(id)}
              className={[
                'cursor-pointer border px-2.5 py-1 font-mono text-[11px]',
                who === id ? 'border-n-900 bg-n-900 text-cream-100' : 'border-putty-500 bg-putty-100',
              ].join(' ')}
            >
              {seat.label} · SCRAP {seat.scrapDeck.length}/{scrapCapacityFor(seat, config)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2 border border-border-strong bg-putty-100 p-3">
          <div className="font-display text-[14px] font-bold">A · TAKE THE WHOLE SHIP</div>
          <div className="text-[13px] leading-[1.35] text-putty-800">
            Abandon your ship and pilot {wreck.name}. Keep exactly one module from the old ship in
            the Scrap Deck; the rest is shuffled back into the Parts deck. Its cockpit shield comes
            back up with you — you shot it dry to take the ship.
          </div>
          <div className="font-mono text-[10px] tracking-console text-putty-700">KEEP FROM YOUR SHIP</div>
          <div className="grid grid-cols-4 gap-1.5" style={{ gridAutoRows: '58px' }}>
            {player?.ship.slots.map((slot) => (
              <ModuleTile
                key={slot.index}
                slot={slot}
                selected={keepSlot === slot.index}
                onClick={() => setKeepSlot(slot.index)}
              />
            ))}
          </div>
          <Button
            size="sm"
            disabled={keepSlot === null}
            onClick={() => resolveLoot(who, { option: 'take-ship', keepFromOldShip: keepSlot ?? 0 })}
          >
            Take the ship
          </Button>
        </div>

        <div className="flex flex-col gap-2 border border-border-strong bg-putty-100 p-3">
          <div className="font-display text-[14px] font-bold">B · TAKE ONE MODULE</div>
          <div className="text-[13px] leading-[1.35] text-putty-800">
            Keep your ship. One module off the wreck goes into the Scrap Deck, inactive until a
            rearrangement point.
            {scrapFull && (
              <span className="text-toggle-red-500"> Scrap Deck is full for this seat.</span>
            )}
          </div>
          <div className="font-mono text-[10px] tracking-console text-putty-700">TAKE FROM THE WRECK</div>
          <div className="grid grid-cols-4 gap-1.5" style={{ gridAutoRows: '58px' }}>
            {wreck.ship.slots.map((slot) => (
              <ModuleTile
                key={slot.index}
                slot={slot}
                selected={takeSlot === slot.index}
                onClick={() => setTakeSlot(slot.index)}
              />
            ))}
          </div>
          <Button
            size="sm"
            disabled={takeSlot === null || scrapFull}
            onClick={() => resolveLoot(who, { option: 'take-module', takeSlot: takeSlot ?? 0 })}
          >
            Take the module
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <Button size="sm" variant="ghost" onClick={() => resolveLoot(who, { option: 'decline' })}>
          Leave the wreck
        </Button>
      </div>
    </>
  );
}

function CheckpointPrompt({ newMaxRarity }: { newMaxRarity: number }) {
  const closePrompt = useGameStore((s) => s.closePrompt);
  return (
    <>
      <Header title="CHECKPOINT" sub={`Rarity ceiling raised to ${newMaxRarity}`} />
      <div className="mb-3 text-[15px] text-putty-800">
        Newly unlocked tiers have been shuffled into all three decks. Draws from here on can turn
        up the harder cards.
      </div>
      <Button onClick={closePrompt}>Push on</Button>
    </>
  );
}

/** Checkpoints and the end of a mission both open the grid up for editing. */
function RearrangePrompt({ state, reason }: { state: GameState; reason: string }) {
  const config = useConfig();
  const closePrompt = useGameStore((s) => s.closePrompt);
  const rearrange = useGameStore((s) => s.rearrange);
  const buyThreshold = useGameStore((s) => s.buyThreshold);
  const setTab = useUiStore((s) => s.setTab);
  const setBuilderPlayer = useUiStore((s) => s.setBuilderPlayer);

  return (
    <>
      <Header
        title="REARRANGEMENT POINT"
        sub={reason === 'mission-end' ? 'Mission complete — rebuild before the next sector' : 'Checkpoint'}
      />
      <div className="mb-3 text-[15px] text-putty-800">
        Hoarded modules can be slotted now. Modules swapped out go back into the Scrap Deck.
      </div>

      <div className="flex flex-col gap-3">
        {state.party.players.map((player) => (
          <div key={player.id} className="border border-border-strong bg-putty-100 p-3">
            <div className="mb-2 flex items-center gap-3">
              <span className="font-display text-[14px] font-bold">{player.label}</span>
              <span className="text-[14px] text-putty-700">{player.ship.name}</span>
              <span className="font-mono text-[11px] text-putty-700">
                SCRAP {player.scrapDeck.length}/{scrapCapacityFor(player, config)}
              </span>
              <div className="ml-auto flex gap-2">
                {config.allowThresholdUpgrades && (
                  <Button size="sm" variant="secondary" onClick={() => buyThreshold(player.id)}>
                    +{config.thresholdUpgradeStep} threshold / −{config.thresholdUpgradePowerCost}⚔
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setBuilderPlayer(player.id);
                    setTab('builder');
                  }}
                >
                  Lay out the grid
                </Button>
              </div>
            </div>

            {player.scrapDeck.length === 0 ? (
              <div className="text-[13px] text-putty-700">Scrap Deck is empty.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {player.scrapDeck.map((cardId, i) => (
                  <button
                    key={`${cardId}-${i}`}
                    onClick={() => rearrange(player.id, cardId, -1)}
                    title="Slot into the first free position"
                    className="cursor-pointer border border-putty-600 bg-surface-panel px-2.5 py-1.5 font-mono text-[11px] hover:border-n-900"
                  >
                    SLOT {getPart(cardId)?.name.toUpperCase() ?? cardId}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Button onClick={closePrompt}>
          {reason === 'mission-end' ? 'End mission' : 'Push on'}
        </Button>
      </div>
    </>
  );
}
