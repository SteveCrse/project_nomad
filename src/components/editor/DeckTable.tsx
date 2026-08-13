import { Fragment, type ReactNode } from 'react';
import type { Card, CardKind, ModuleRole, Rarity } from '@engine/types';
import {
  attackOf,
  cardCost,
  cardWarnings,
  effectParam,
  isActiveEffect,
  isDamageEffect,
  printedText,
} from '@engine';
import { RARITY_NAME, ROLE_COLOR, rarityColor } from '@/lib/palette';
import { artUrl } from '@/lib/art';
import { useDeckStore } from '@/store/deckStore';
import { useUiStore } from '@/store/uiStore';
import { EffectChips } from './EffectChips';
import { NumberCell, SelectCell, TextCell } from './inputs';

/**
 * The deck as a spreadsheet.
 *
 * One row per card, every balance-critical number editable in place: rarity,
 * copies in the deck, ⚡ cost, max ⚡, ⚔️ attack — and the rules text those
 * numbers produce, read-only, because a card's text is derived from its
 * effects rather than typed. Anything with more shape than a number — the
 * effect list, its costs and dice, art, flavour — lives in the card panel, one
 * click away on the row.
 */

const KIND_SECTIONS: { kind: CardKind; label: string }[] = [
  { kind: 'part', label: 'PARTS DECK' },
  { kind: 'item', label: 'ITEMS DECK' },
  { kind: 'event', label: 'EVENTS DECK' },
];

/** A cockpit is a role now, so it's one option in the same dropdown. */
const PART_ROLES: ModuleRole[] = ['COCKPIT', 'GEN', 'WPN', 'SHD', 'RDS', 'OTH'];
const ITEM_ROLES: ModuleRole[] = ['GEN', 'WPN', 'SHD', 'RDS', 'OTH'];

interface Column {
  key: string;
  label: string;
  width: number;
  title?: string;
  right?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'art', label: '', width: 30, title: 'art' },
  { key: 'name', label: 'NAME', width: 168 },
  { key: 'subtype', label: 'SUBTYPE', width: 104, title: 'events only — the classification printed on the card' },
  { key: 'role', label: 'ROLE', width: 86 },
  { key: 'rarity', label: 'RARITY', width: 104 },
  { key: 'amount', label: '×N', width: 46, title: 'copies in the deck', right: true },
  { key: 'cost', label: 'COST⚡', width: 58, right: true, title: '⚡ one activation draws, across the card’s active effects' },
  { key: 'max', label: 'MAX⚡', width: 58, right: true, title: 'the most ⚡ this module’s own pool holds' },
  { key: 'atk', label: 'ATK⚔️', width: 56, right: true },
  { key: 'slots', label: 'SLOTS', width: 50, right: true },
  { key: 'gen', label: 'GEN⚡', width: 52, right: true, title: 'cockpit generator, per down' },
  { key: 'effects', label: 'EFFECTS', width: 210 },
  { key: 'text', label: 'PRINTS AS', width: 320, title: 'derived from the effects — edit the effect, not the text' },
  { key: 'actions', label: '', width: 60 },
];

const MIN_WIDTH = 28;

export function DeckTable({
  cards,
  selectedId,
  onSelect,
}: {
  cards: Card[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const widths = useUiStore((s) => s.deckColumnWidths);
  const setWidth = useUiStore((s) => s.setDeckColumnWidth);
  const resetColumn = useUiStore((s) => s.resetDeckColumn);

  const widthOf = (column: Column) => widths[column.key] ?? column.width;
  const total = COLUMNS.reduce((sum, c) => sum + widthOf(c), 0);

  /**
   * Drag the right edge of a header to size its column.
   *
   * The listeners go on the window rather than the handle: a fast drag leaves
   * a 6px target behind, and the column should keep tracking the pointer.
   * Double-click puts one column back to its default.
   */
  const startResize = (column: Column, event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthOf(column);
    const onMove = (e: MouseEvent) =>
      setWidth(column.key, Math.max(MIN_WIDTH, startWidth + e.clientX - startX));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto border-2 border-n-900 bg-cream-100">
      <table className="table-fixed border-collapse" style={{ width: total }}>
        <colgroup>
          {COLUMNS.map((c) => (
            <col key={c.key} style={{ width: widthOf(c) }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-n-900 text-cream-100">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                title={c.title}
                className={[
                  'relative border-r border-n-700 px-1.5 py-1.5 font-mono text-[10px] font-normal tracking-[0.1em] whitespace-nowrap',
                  c.right ? 'text-right' : 'text-left',
                ].join(' ')}
              >
                <span className="block overflow-hidden text-ellipsis">{c.label}</span>
                <span
                  onMouseDown={(e) => startResize(c, e)}
                  onDoubleClick={() => resetColumn(c.key)}
                  title="drag to resize · double-click to reset"
                  className="absolute top-0 -right-[3px] z-20 h-full w-[6px] cursor-col-resize hover:bg-crt-green-500"
                />
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
                    colSpan={COLUMNS.length}
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
  const setEffectCost = useDeckStore((s) => s.setEffectCost);
  const duplicateCard = useDeckStore((s) => s.duplicateCard);
  const removeCard = useDeckStore((s) => s.removeCard);
  const revertCard = useDeckStore((s) => s.revertCard);
  const edited = useDeckStore((s) => card.id in s.overlay.edits);
  const custom = useDeckStore((s) => s.overlay.added.some((c) => c.id === card.id));

  const warnings = cardWarnings(card);
  const isPart = card.kind === 'part';
  const isCockpit = isPart && card.role === 'COCKPIT';
  const part = isPart ? card : null;

  // ⚔️ lives in the damage effect for a module, but a cockpit's basic attack is
  // printed on the cockpit itself — it isn't something fitted to one.
  const attackIndex = (card.effects ?? []).findIndex((e) => isDamageEffect(e.type));
  const attack = attackIndex >= 0 ? effectParam(card.effects![attackIndex]!, 'power') : attackOf(card);
  const canEditAttack = attackIndex >= 0 || isCockpit;

  // Cost belongs to an effect now. One active effect means the row can still
  // edit it in place; with two, the sheet shows what an activation totals and
  // sends the designer to the panel, where each line has its own price.
  const activeIndexes = (card.effects ?? [])
    .map((e, i) => (isActiveEffect(e.type) ? i : -1))
    .filter((i) => i >= 0);
  const costIndex = activeIndexes.length === 1 ? activeIndexes[0]! : -1;
  const cost = cardCost(card);

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
        {card.kind === 'event' ? (
          <TextCell
            value={card.subtype}
            mono
            onChange={(subtype) => patchCard(card.id, { subtype })}
            placeholder="subtype"
          />
        ) : (
          <div className="px-1.5 py-1 text-center font-mono text-[12px] text-putty-500">—</div>
        )}
      </td>

      <td className={cell}>
        {card.kind === 'event' ? (
          <div className="px-1.5 py-1 text-center font-mono text-[12px] text-putty-500">—</div>
        ) : (
          <div style={{ color: ROLE_COLOR[card.role] }}>
            <SelectCell
              value={card.role}
              options={(card.kind === 'part' ? PART_ROLES : ITEM_ROLES).map((r) => ({
                value: r,
                label: r,
              }))}
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
        {costIndex >= 0 ? (
          <NumberCell
            value={cost}
            title="⚡ this card’s active effect draws to fire"
            onChange={(value) => setEffectCost(card.id, costIndex, value ?? 0)}
          />
        ) : (
          <div
            title={
              activeIndexes.length > 1
                ? 'total across this card’s active effects — price them one by one in the panel'
                : 'nothing here is activated'
            }
            className="px-1.5 py-1 text-right font-mono text-[12px] text-putty-600"
          >
            {activeIndexes.length > 1 ? cost : '—'}
          </div>
        )}
      </td>

      <td className={cell}>
        <NumberCell
          value={part ? part.energyCapacity : null}
          disabled={!part}
          nullable
          title={isCockpit ? 'the cockpit shield — the ship’s last charge' : 'the most ⚡ this module holds'}
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
        <div
          title={printedText(card) || 'this card prints nothing — give it an effect'}
          className="truncate px-1.5 py-1 text-[13px] text-putty-800"
        >
          {printedText(card) || <span className="text-putty-500 italic">nothing</span>}
        </div>
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
