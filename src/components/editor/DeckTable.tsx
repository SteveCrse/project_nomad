import { Fragment, type ReactNode } from 'react';
import type { Card, CardKind, ModuleRole, PartCard, Rarity } from '@engine/types';
import { attackOf, cardWarnings, effectParam, isDamageEffect, renderText } from '@engine';
import { RARITY_NAME, ROLE_COLOR, rarityColor } from '@/lib/palette';
import { artUrl } from '@/lib/art';
import { useDeckStore } from '@/store/deckStore';
import { EffectChips } from './EffectChips';
import { NumberCell, SelectCell, TextCell } from './inputs';

/**
 * The deck as a spreadsheet.
 *
 * One row per card, every balance-critical number editable in place: rarity,
 * copies in the deck, ⚡ cost, ⚡ pool, ⚔️ attack, and the printed text that
 * quotes them. Anything with more shape than a number — the effect list, dice,
 * art, flavour — lives in the card panel, one click away on the row.
 */

const KIND_SECTIONS: { kind: CardKind; label: string }[] = [
  { kind: 'part', label: 'PARTS DECK' },
  { kind: 'item', label: 'ITEMS DECK' },
  { kind: 'event', label: 'EVENTS DECK' },
];

const ROLES: ModuleRole[] = ['GEN', 'WPN', 'SHD', 'RDS', 'OTH'];

const PART_TYPES: { value: PartCard['partType']; label: string }[] = [
  { value: 'cockpit', label: 'COCKPIT' },
  { value: 'active-module', label: 'ACTIVE' },
  { value: 'passive-module', label: 'PASSIVE' },
];

const HEADERS = [
  { label: '', width: 30, title: 'art' },
  { label: 'NAME', width: 168 },
  { label: 'TYPE', width: 104 },
  { label: 'ROLE', width: 60 },
  { label: 'RARITY', width: 104 },
  { label: '×N', width: 46, title: 'copies in the deck', right: true },
  { label: 'COST⚡', width: 58, right: true },
  { label: 'POOL⚡', width: 58, right: true },
  { label: 'ATK⚔️', width: 56, right: true },
  { label: 'SLOTS', width: 50, right: true },
  { label: 'GEN⚡', width: 52, right: true, title: 'cockpit generator, per down' },
  { label: 'EFFECTS', width: 210 },
  { label: 'PRINTED TEXT', width: 0 },
  { label: '', width: 60 },
];

export function DeckTable({
  cards,
  selectedId,
  onSelect,
}: {
  cards: Card[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto border-2 border-n-900 bg-cream-100">
      <table className="w-full border-collapse">
        <colgroup>
          {HEADERS.map((h, i) => (
            <col key={i} style={h.width ? { width: h.width } : undefined} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-n-900 text-cream-100">
            {HEADERS.map((h, i) => (
              <th
                key={i}
                title={h.title}
                className={[
                  'border-r border-n-700 px-1.5 py-1.5 font-mono text-[10px] font-normal tracking-[0.1em] whitespace-nowrap',
                  h.right ? 'text-right' : 'text-left',
                ].join(' ')}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {KIND_SECTIONS.map(({ kind, label }) => {
            const rows = cards.filter((c) => c.kind === kind);
            if (rows.length === 0) return null;
            const copies = rows.reduce((sum, c) => sum + c.amount, 0);
            return (
              <Fragment key={kind}>
                <tr className="bg-putty-300">
                  <td
                    colSpan={HEADERS.length}
                    className="border-y border-putty-500 px-2 py-1 font-mono text-[10px] tracking-[0.14em] text-n-800"
                  >
                    {label} · {rows.length} CARDS · {copies} COPIES
                  </td>
                </tr>
                {rows.map((card) => (
                  <Row
                    key={card.id}
                    card={card}
                    selected={card.id === selectedId}
                    onSelect={() => onSelect(card.id)}
                  />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {cards.length === 0 && (
        <div className="p-6 text-center font-mono text-[12px] text-putty-700">
          nothing matches those filters
        </div>
      )}
    </div>
  );
}

function Row({
  card,
  selected,
  onSelect,
}: {
  card: Card;
  selected: boolean;
  onSelect: () => void;
}) {
  const patchCard = useDeckStore((s) => s.patchCard);
  const setEffectParam = useDeckStore((s) => s.setEffectParam);
  const duplicateCard = useDeckStore((s) => s.duplicateCard);
  const removeCard = useDeckStore((s) => s.removeCard);
  const revertCard = useDeckStore((s) => s.revertCard);
  const edited = useDeckStore((s) => card.id in s.overlay.edits);
  const custom = useDeckStore((s) => s.overlay.added.some((c) => c.id === card.id));

  const warnings = cardWarnings(card);
  const isPart = card.kind === 'part';
  const isCockpit = isPart && card.partType === 'cockpit';
  const part = isPart ? card : null;

  // ⚔️ lives in the damage effect for a module, but a cockpit's basic attack is
  // printed on the cockpit itself — it isn't something fitted to one.
  const attackIndex = (card.effects ?? []).findIndex((e) => isDamageEffect(e.type));
  const attack = attackIndex >= 0 ? effectParam(card.effects![attackIndex]!, 'power') : attackOf(card);
  const canEditAttack = attackIndex >= 0 || isCockpit;

  const cell = 'border-b border-r border-putty-300 align-middle';
  const art = artUrl(card.art);

  return (
    <tr
      onClick={onSelect}
      className={[
        'cursor-pointer',
        selected ? 'bg-amber-300/35' : 'bg-cream-100 hover:bg-putty-100',
      ].join(' ')}
    >
      <td className={cell}>
        <div className="flex h-7 w-full items-center justify-center">
          {art ? (
            <img src={art} alt="" className="h-6 w-6 border border-putty-400 object-cover" />
          ) : (
            <span className="font-mono text-[10px] text-putty-400">—</span>
          )}
        </div>
      </td>

      <td className={cell}>
        <div className="flex items-center">
          <TextCell
            value={card.name}
            onChange={(name) => patchCard(card.id, { name })}
            title={card.id}
          />
          {(edited || custom) && (
            <span
              title={custom ? 'card added here' : 'edited from the shipped deck'}
              className="mr-1 flex-none font-mono text-[10px] text-amber-700"
            >
              {custom ? '+' : '•'}
            </span>
          )}
        </div>
      </td>

      <td className={cell}>
        {card.kind === 'part' ? (
          <SelectCell
            value={card.partType}
            options={PART_TYPES}
            onChange={(partType) => patchCard(card.id, { partType })}
          />
        ) : card.kind === 'item' ? (
          <SelectCell
            value={card.consumable ? 'yes' : 'no'}
            options={[
              { value: 'yes', label: 'CONSUMABLE' },
              { value: 'no', label: 'KEEPS' },
            ]}
            onChange={(v) => patchCard(card.id, { consumable: v === 'yes' })}
          />
        ) : (
          <TextCell
            value={card.subtype}
            mono
            onChange={(subtype) => patchCard(card.id, { subtype })}
            placeholder="subtype"
          />
        )}
      </td>

      <td className={cell}>
        {card.kind === 'event' ? (
          <div className="px-1.5 py-1 text-center font-mono text-[12px] text-putty-500">—</div>
        ) : (
          <div style={{ color: ROLE_COLOR[card.role] }}>
            <SelectCell
              value={card.role}
              options={ROLES.map((r) => ({ value: r, label: r }))}
              onChange={(role) => patchCard(card.id, { role })}
            />
          </div>
        )}
      </td>

      <td className={cell}>
        <div className="flex items-center gap-1 pr-1">
          <span
            className="h-3.5 w-1 flex-none"
            style={{ background: rarityColor(card.rarity) }}
            aria-hidden
          />
          <SelectCell
            value={String(card.rarity)}
            options={RARITY_NAME.map((name, i) => ({ value: String(i + 1), label: name }))}
            onChange={(v) => patchCard(card.id, { rarity: Number(v) as Rarity })}
          />
        </div>
      </td>

      <td className={cell}>
        <NumberCell
          value={card.amount}
          min={0}
          max={99}
          title="copies of this card in the deck"
          onChange={(amount) => patchCard(card.id, { amount: amount ?? 0 })}
        />
      </td>

      <td className={cell}>
        <NumberCell
          value={card.kind === 'event' ? null : card.energyCost}
          disabled={card.kind === 'event'}
          nullable
          title="⚡ an activation draws"
          onChange={(energyCost) => patchCard(card.id, { energyCost })}
        />
      </td>

      <td className={cell}>
        <NumberCell
          value={part ? part.energyCapacity : null}
          disabled={!part}
          nullable
          title={isCockpit ? 'the cockpit shield — the ship’s last charge' : '⚡ this module holds'}
          onChange={(energyCapacity) => patchCard(card.id, { energyCapacity })}
        />
      </td>

      <td className={cell}>
        <NumberCell
          value={canEditAttack ? attack : null}
          disabled={!canEditAttack}
          title={attackIndex >= 0 ? 'damage effect’s ⚔️' : 'the cockpit’s basic attack'}
          onChange={(value) =>
            attackIndex >= 0
              ? setEffectParam(card.id, attackIndex, 'power', value ?? 0)
              : patchCard(card.id, { power: value ?? 0 })
          }
        />
      </td>

      <td className={cell}>
        <NumberCell
          value={isCockpit ? (part?.slots ?? null) : null}
          disabled={!isCockpit}
          min={1}
          max={24}
          title="module slots this cockpit grants"
          onChange={(slots) => patchCard(card.id, { slots: slots ?? 1 })}
        />
      </td>

      <td className={cell}>
        <NumberCell
          value={isCockpit ? (part?.genPerDown ?? null) : null}
          disabled={!isCockpit}
          title="⚡ one down of the basic generator puts back"
          onChange={(genPerDown) => patchCard(card.id, { genPerDown: genPerDown ?? 0 })}
        />
      </td>

      <td className={cell}>
        <EffectChips card={card} onOpen={onSelect} />
      </td>

      <td className={cell}>
        <TextCell
          value={card.text}
          onChange={(text) => patchCard(card.id, { text })}
          title={`prints as: ${renderText(card)}`}
          placeholder="printed text — {cost}, {power}, {amount} fill from the numbers"
        />
      </td>

      <td className={cell}>
        <div className="flex items-center justify-end gap-0.5 px-1">
          {warnings.length > 0 && (
            <span
              title={warnings.join('\n')}
              className="cursor-help font-mono text-[12px] text-toggle-red-500"
            >
              ⚠
            </span>
          )}
          <RowButton onClick={() => duplicateCard(card.id)} title="duplicate this card">
            ⧉
          </RowButton>
          {edited ? (
            <RowButton onClick={() => revertCard(card.id)} title="revert to the shipped card">
              ↺
            </RowButton>
          ) : (
            <RowButton onClick={() => removeCard(card.id)} title="remove from the deck" danger>
              ✕
            </RowButton>
          )}
        </div>
      </td>
    </tr>
  );
}

function RowButton({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        'cursor-pointer px-1 font-mono text-[11px] text-putty-600',
        danger ? 'hover:text-toggle-red-500' : 'hover:text-n-900',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
