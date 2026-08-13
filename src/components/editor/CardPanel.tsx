import { useState } from 'react';
import type { Card, CardEffect, DieKind, EffectType, Specialization } from '@engine/types';
import { EFFECTS, cardWarnings, effectParam, effectsForKind } from '@engine';
import { ART_ASSETS, artUrl } from '@/lib/art';
import { useDeckStore } from '@/store/deckStore';
import { CardTile } from '@/components/game/CardTile';
import { ChipButton, Field, IconButton, NumberCell, SelectCell, TextCell } from './inputs';

/**
 * Everything about one card that isn't a number in a column: the effects it's
 * assembled from, their parameters, their ⚡ costs and their dice — with the
 * card face rendered live above it, since the wording is the half of a balance
 * pass you can't read off a spreadsheet.
 *
 * There is no printed-text field. A card's rules text is derived from its
 * effects every time it's drawn, so the face above updates as the numbers do,
 * and the only text worth typing is the wording of an effect the engine can't
 * resolve for itself.
 */
export function CardPanel({ card, onClose }: { card: Card; onClose: () => void }) {
  const patchCard = useDeckStore((s) => s.patchCard);
  const warnings = cardWarnings(card);

  return (
    <div className="flex w-[380px] min-h-0 flex-none flex-col border-2 border-l-0 border-n-900 bg-putty-200">
      <div className="flex flex-none items-center gap-2 border-b-2 border-n-900 bg-n-900 px-2.5 py-2 text-cream-100">
        <span className="font-mono text-[11px] tracking-[0.12em]">CARD</span>
        <span className="truncate font-mono text-[11px] text-crt-green-500">{card.id}</span>
        <button
          onClick={onClose}
          aria-label="close the card panel"
          className="ml-auto cursor-pointer border border-n-600 px-1.5 text-[11px] hover:border-cream-100"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2.5">
        <div className="mb-3 flex justify-center">
          <CardTile card={card} />
        </div>

        {warnings.length > 0 && (
          <div className="mb-3 border-l-2 border-toggle-red-500 bg-toggle-red-300/25 px-2 py-1.5">
            {warnings.map((warning) => (
              <div key={warning} className="text-[12px] leading-tight text-toggle-red-700">
                ⚠ {warning}
              </div>
            ))}
          </div>
        )}

        <Effects card={card} />

        <SectionTitle>Card</SectionTitle>
        <Field label="Flavour">
          <TextCell
            value={card.flavor ?? ''}
            onChange={(flavor) => patchCard(card.id, { flavor })}
            placeholder="non-mechanical line"
          />
        </Field>

        {card.kind === 'event' && (
          <Field label="Marker text" hint="dropped on the sector by a place-marker effect">
            <TextCell
              value={card.marker ?? ''}
              onChange={(marker) => patchCard(card.id, { marker })}
              placeholder="GRAVITY WELL"
            />
          </Field>
        )}

        {card.kind === 'part' && (
          <Field label="Specialization" hint="what this part pushes a build toward">
            <SelectCell
              value={card.specialization ?? 'none'}
              options={[
                { value: 'none', label: '—' },
                { value: 'tank', label: 'TANK' },
                { value: 'dps', label: 'DPS' },
                { value: 'luck', label: 'LUCK' },
                { value: 'support', label: 'SUPPORT' },
              ]}
              onChange={(value) =>
                patchCard(card.id, {
                  specialization: value === 'none' ? undefined : (value as Specialization),
                })
              }
            />
          </Field>
        )}

        {card.kind === 'part' && card.role !== 'COCKPIT' && (
          <label className="flex cursor-pointer items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={!!card.oncePerSet}
              onChange={(e) => patchCard(card.id, { oncePerSet: e.target.checked })}
            />
            <span className="text-[13px]">Fires at most once per fresh set of downs</span>
          </label>
        )}

        <Art card={card} />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 mb-1.5 border-b border-putty-500 pb-0.5 font-mono text-[10px] tracking-[0.14em] text-putty-800 uppercase">
      {children}
    </div>
  );
}

const TIMING_LABEL = { active: 'ACT', passive: 'PAS', event: 'EVT' } as const;
const TIMING_HINT = {
  active: 'costs a down, and whatever ⚡ this effect charges',
  passive: 'always on while the card is fitted',
  event: 'resolves when the card is drawn',
} as const;

// ------------------------------------------------------------------ effects

/**
 * The card's behaviour, assembled.
 *
 * Each row is one effect from the vocabulary with everything that makes it
 * this card's version: its numbers, the ⚡ it draws to fire, and the dice it
 * rolls. Cost and dice are modifiers on the effect, not on the card — a module
 * that shoots cheap and gambles expensively says so, per line.
 */
function Effects({ card }: { card: Card }) {
  const [adding, setAdding] = useState(false);
  const addEffect = useDeckStore((s) => s.addEffect);
  const removeEffect = useDeckStore((s) => s.removeEffect);
  const moveEffect = useDeckStore((s) => s.moveEffect);
  const setEffectParam = useDeckStore((s) => s.setEffectParam);
  const setEffectCost = useDeckStore((s) => s.setEffectCost);
  const setEffectText = useDeckStore((s) => s.setEffectText);

  const effects = card.effects ?? [];
  const available = effectsForKind(card.kind);

  return (
    <div className="pb-2">
      <SectionTitle>Effects</SectionTitle>

      {effects.length === 0 && (
        <div className="pb-1.5 text-[12px] text-putty-700 italic">
          {card.kind === 'part' && card.role === 'COCKPIT'
            ? 'None — a cockpit’s weapon, shield and generator are intrinsic, and print from its own numbers.'
            : 'Nothing yet — this card does nothing in play, and prints nothing.'}
        </div>
      )}

      {effects.map((effect, i) => {
        const def = EFFECTS[effect.type];
        const timing = def?.timing ?? 'passive';
        return (
          <div key={`${effect.type}-${i}`} className="mb-1.5 border border-putty-500 bg-putty-100">
            <div className="flex items-center gap-1 border-b border-putty-400 bg-putty-200 px-1.5 py-1">
              <span
                className="font-mono text-[9px] tracking-[0.1em] text-putty-700"
                title={TIMING_HINT[timing]}
              >
                {TIMING_LABEL[timing]}
              </span>
              <span className="flex-1 truncate text-[13px] font-semibold" title={def?.summary}>
                {def?.label ?? `unknown effect: ${effect.type}`}
              </span>
              <IconButton onClick={() => moveEffect(card.id, i, -1)} title="move up" disabled={i === 0}>
                ↑
              </IconButton>
              <IconButton
                onClick={() => moveEffect(card.id, i, 1)}
                title="move down"
                disabled={i === effects.length - 1}
              >
                ↓
              </IconButton>
              <IconButton onClick={() => removeEffect(card.id, i)} title="remove this effect" danger>
                ✕
              </IconButton>
            </div>

            <div className="px-1.5 py-1">
              {def?.params.map((p) => (
                <Row key={p.key} label={p.label} symbol={p.symbol} narrow>
                  <NumberCell
                    value={effectParam(effect, p.key)}
                    min={p.min}
                    max={p.max}
                    title={p.hint}
                    onChange={(value) => setEffectParam(card.id, i, p.key, value ?? 0)}
                  />
                </Row>
              ))}

              {timing === 'active' && (
                <Row
                  label="Costs"
                  symbol="⚡"
                  narrow
                  hint={effect.dice?.count === 'variable' ? 'per die' : undefined}
                >
                  <NumberCell
                    value={effect.cost ?? 0}
                    min={0}
                    max={99}
                    title="⚡ this effect draws from the card’s own pool when it fires"
                    onChange={(cost) => setEffectCost(card.id, i, cost ?? 0)}
                  />
                </Row>
              )}

              {def?.coded && (
                <div className="pt-1">
                  <div className="pb-0.5 text-[11px] leading-tight text-putty-700">
                    Resolved in code or at the table — this wording is what the card prints.
                  </div>
                  <textarea
                    value={effect.text ?? ''}
                    onChange={(e) => setEffectText(card.id, i, e.target.value)}
                    rows={3}
                    placeholder="what the table is meant to do"
                    className="w-full resize-y border border-putty-400 bg-cream-100 px-1.5 py-1 text-[13px] outline-none"
                  />
                </div>
              )}
            </div>

            <Dice cardId={card.id} index={i} effect={effect} />
          </div>
        );
      })}

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <ChipButton onClick={() => setAdding(!adding)} active={adding}>
          + ADD EFFECT
        </ChipButton>
      </div>

      {adding && (
        <div className="mt-1.5 border border-n-900 bg-cream-100">
          {available.map((def) => (
            <button
              key={def.type}
              type="button"
              onClick={() => {
                addEffect(card.id, def.type as EffectType);
                setAdding(false);
              }}
              className="block w-full cursor-pointer border-b border-putty-300 px-2 py-1.5 text-left last:border-b-0 hover:bg-putty-100"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[9px] tracking-[0.1em] text-putty-700">
                  {TIMING_LABEL[def.timing]}
                </span>
                <span className="text-[13px] font-semibold">{def.label}</span>
              </div>
              <div className="text-[11px] leading-tight text-putty-700">{def.summary}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- dice

const DICE: DieKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

/**
 * Dice belong to the effect that rolls them.
 *
 * They're a modifier on one effect's payload, no different from the ⚡ it
 * costs: a card that shoots flat and gambles on a second line rolls only for
 * the line that gambles.
 */
function Dice({
  cardId,
  index,
  effect,
}: {
  cardId: string;
  index: number;
  effect: CardEffect;
}) {
  const setEffectDice = useDeckStore((s) => s.setEffectDice);
  const dice = effect.dice;
  const set = (patch: Partial<NonNullable<CardEffect['dice']>>) => {
    if (!dice) return;
    setEffectDice(cardId, index, { ...dice, ...patch });
  };

  if (!dice) {
    return (
      <div className="border-t border-putty-400 px-1.5 py-1">
        <ChipButton onClick={() => setEffectDice(cardId, index, { count: 1, die: 'd6' })}>
          + ROLL DICE
        </ChipButton>
      </div>
    );
  }

  return (
    <div className="border-t border-putty-400 bg-putty-200/60 px-1.5 py-1">
      <Row label="How many">
        <SelectCell
          value={dice.count === 'variable' ? 'variable' : 'fixed'}
          options={[
            { value: 'fixed', label: 'FIXED' },
            { value: 'variable', label: 'X — PLAYER BUYS' },
          ]}
          onChange={(mode) => set({ count: mode === 'variable' ? 'variable' : 1 })}
        />
      </Row>
      {dice.count !== 'variable' && (
        <Row label="Dice" narrow>
          <NumberCell
            value={dice.count}
            min={1}
            max={20}
            onChange={(count) => set({ count: count ?? 1 })}
          />
        </Row>
      )}
      <Row label="Die">
        <SelectCell
          value={dice.die}
          options={DICE.map((die) => ({ value: die, label: die.toUpperCase() }))}
          onChange={(die) => set({ die: die as DieKind })}
        />
      </Row>
      <Row label="Hits on ≤" narrow>
        <NumberCell
          value={dice.hitUnder ?? null}
          nullable
          min={0}
          max={20}
          onChange={(hitUnder) => set({ hitUnder: hitUnder ?? undefined })}
        />
      </Row>
      <Row label="Hits on ≥" narrow>
        <NumberCell
          value={dice.hitOver ?? null}
          nullable
          min={0}
          max={20}
          onChange={(hitOver) => set({ hitOver: hitOver ?? undefined })}
        />
      </Row>
      <Row label="Per hit" narrow>
        <NumberCell
          value={dice.perHit ?? null}
          nullable
          onChange={(perHit) => set({ perHit: perHit ?? undefined })}
        />
      </Row>
      <div className="pt-1 text-[11px] leading-tight text-putty-700">
        {dice.hitUnder === undefined && dice.hitOver === undefined
          ? 'No hit rule: the dice are summed onto this effect’s payload.'
          : 'With a hit rule the roll can miss — a gain-⚡ effect gambles its loss instead.'}
      </div>
      <div className="pt-1">
        <ChipButton onClick={() => setEffectDice(cardId, index, undefined)}>✕ NO DICE</ChipButton>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  symbol,
  narrow,
  children,
}: {
  label: string;
  hint?: string;
  symbol?: string;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="flex-1 text-[12px]">
        {label}
        {hint && <span className="pl-1 font-mono text-[10px] text-putty-700">{hint}</span>}
      </span>
      {symbol && <span className="font-mono text-[11px] text-putty-700">{symbol}</span>}
      <div
        className={`${narrow ? 'w-[64px]' : 'w-[132px]'} border border-putty-400 bg-cream-100`}
      >
        {children}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- art

function Art({ card }: { card: Card }) {
  const patchCard = useDeckStore((s) => s.patchCard);
  const [open, setOpen] = useState(false);
  const current = artUrl(card.art);

  return (
    <div className="pb-2">
      <SectionTitle>Art</SectionTitle>
      <div className="flex items-start gap-2 pb-1.5">
        <div className="flex h-16 w-16 flex-none items-center justify-center border border-putty-500 bg-cream-100">
          {current ? (
            <img src={current} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-mono text-[10px] text-putty-500">none</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="border border-putty-400 bg-cream-100">
            <TextCell
              value={card.art ?? ''}
              mono
              onChange={(art) => patchCard(card.id, { art })}
              placeholder="000.png or an image URL"
            />
          </div>
          <div className="flex gap-1.5 pt-1.5">
            <ChipButton onClick={() => setOpen(!open)} active={open}>
              {open ? 'CLOSE' : 'BROWSE FRONTS'}
            </ChipButton>
            {card.art && (
              <ChipButton onClick={() => patchCard(card.id, { art: undefined })}>CLEAR</ChipButton>
            )}
          </div>
          {card.art && !current && (
            <div className="pt-1 text-[11px] leading-tight text-toggle-red-500">
              no such file in the fronts folder
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="grid max-h-64 grid-cols-6 gap-1 overflow-auto border border-putty-500 bg-cream-100 p-1">
          {ART_ASSETS.map((asset) => (
            <button
              key={asset.file}
              type="button"
              title={asset.file}
              onClick={() => {
                patchCard(card.id, { art: asset.file });
                setOpen(false);
              }}
              className={[
                'cursor-pointer border',
                card.art === asset.file ? 'border-n-900' : 'border-transparent hover:border-amber-500',
              ].join(' ')}
            >
              <img src={asset.url} alt={asset.file} className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
