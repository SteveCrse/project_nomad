import { useMemo, useRef, useState } from 'react';
import type { CardKind } from '@engine/types';
import { printedText } from '@engine';
import { CardTile } from '@/components/game/CardTile';
import { CardPanel } from '@/components/editor/CardPanel';
import { DeckStats } from '@/components/editor/DeckStats';
import { DeckTable } from '@/components/editor/DeckTable';
import { ChipButton } from '@/components/editor/inputs';
import { RARITY_NAME } from '@/lib/palette';
import { useConfig } from '@/store/configStore';
import { useDeckStore } from '@/store/deckStore';
import { useUiStore } from '@/store/uiStore';

const RARITIES = [{ label: 'ALL', value: 0 }, ...RARITY_NAME.map((n, i) => ({ label: n, value: i + 1 }))];

const KINDS: { label: string; value: CardKind | null }[] = [
  { label: 'ALL DECKS', value: null },
  { label: 'PARTS', value: 'part' },
  { label: 'ITEMS', value: 'item' },
  { label: 'EVENTS', value: 'event' },
];

/**
 * The deck, two ways.
 *
 * **Gallery** is the deck as printed — what a playtester hands round the
 * table. **Spreadsheet** is the same cards as an editable sheet, because the
 * questions a balance pass asks (how many copies, how much ⚔️ per ⚡, how
 * often a cockpit turns up) are questions about the deck rather than about
 * any one card.
 *
 * Both read the live deck, and every edit lands in the engine's content
 * registry: the next draw, spawn and activation use the new numbers.
 */
export function CardBrowserView() {
  const config = useConfig();
  const cards = useDeckStore((s) => s.cards);

  const mode = useUiStore((s) => s.deckMode);
  const setMode = useUiStore((s) => s.setDeckMode);
  const rarityFilter = useUiStore((s) => s.rarityFilter);
  const setRarityFilter = useUiStore((s) => s.setRarityFilter);
  const kind = useUiStore((s) => s.deckKind);
  const setKind = useUiStore((s) => s.setDeckKind);
  const search = useUiStore((s) => s.deckSearch);
  const setSearch = useUiStore((s) => s.setDeckSearch);
  const editingId = useUiStore((s) => s.editingCardId);
  const editCard = useUiStore((s) => s.editCard);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (rarityFilter !== 0 && card.rarity !== rarityFilter) return false;
      if (kind && card.kind !== kind) return false;
      if (!needle) return true;
      return (
        card.name.toLowerCase().includes(needle) ||
        card.id.toLowerCase().includes(needle) ||
        printedText(card).toLowerCase().includes(needle) ||
        (card.effects ?? []).some((e) => e.type.includes(needle))
      );
    });
  }, [cards, rarityFilter, kind, search]);

  const editing = cards.find((c) => c.id === editingId) ?? null;
  const inBag = shown.filter((c) => c.rarity <= config.maxRarityNow).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="font-display text-[20px] font-bold">DECK</div>

        <div className="flex gap-1.5">
          <ChipButton onClick={() => setMode('gallery')} active={mode === 'gallery'}>
            GALLERY
          </ChipButton>
          <ChipButton onClick={() => setMode('sheet')} active={mode === 'sheet'}>
            SPREADSHEET
          </ChipButton>
        </div>

        <div className="flex gap-1.5">
          {KINDS.map((k) => (
            <ChipButton
              key={k.label}
              onClick={() => setKind(k.value)}
              active={kind === k.value}
            >
              {k.label}
            </ChipButton>
          ))}
        </div>

        <div className="flex gap-1.5">
          {RARITIES.map((r) => (
            <ChipButton
              key={r.value}
              onClick={() => setRarityFilter(r.value)}
              active={rarityFilter === r.value}
            >
              {r.label}
            </ChipButton>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search name, text, effect…"
          className="w-52 border border-putty-500 bg-putty-100 px-2 py-[4px] font-mono text-[11px] outline-none focus:border-n-900"
        />

        <div className="ml-auto font-mono text-[12px] text-putty-700">
          {shown.length} OF {cards.length} CARDS · {inBag} IN BAG AT TIER {config.maxRarityNow}
        </div>
      </div>

      {mode === 'gallery' ? (
        <div className="flex flex-1 flex-wrap content-start gap-4 overflow-auto pb-2">
          {shown.map((card) => (
            <button
              key={card.id}
              onClick={() => {
                editCard(card.id);
                setMode('sheet');
              }}
              title="open in the spreadsheet editor"
              className="cursor-pointer text-left"
            >
              <CardTile card={card} />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-0">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <DeckToolbar />
            <DeckTable cards={shown} selectedId={editingId} onSelect={editCard} />
            <DeckStats cards={shown} />
          </div>
          {editing && <CardPanel card={editing} onClose={() => editCard(null)} />}
        </div>
      )}
    </div>
  );
}

/** Deck-level actions: new cards, and getting edits in and out of the browser. */
function DeckToolbar() {
  const addCard = useDeckStore((s) => s.addCard);
  const exportJson = useDeckStore((s) => s.exportJson);
  const importJson = useDeckStore((s) => s.importJson);
  const resetAll = useDeckStore((s) => s.resetAll);
  const editedCount = useDeckStore(
    (s) => Object.keys(s.overlay.edits).length + s.overlay.added.length + s.overlay.removed.length,
  );
  const editCard = useUiStore((s) => s.editCard);
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  const flash = (message: string) => {
    setNote(message);
    setTimeout(() => setNote(null), 2000);
  };

  const download = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nomad-deck.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    const error = importJson(await file.text());
    flash(error ? `import failed: ${error}` : 'deck imported');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-2 border-b-0 border-n-900 bg-putty-200 px-2 py-1.5">
      <span className="pr-1 font-mono text-[10px] tracking-[0.12em] text-putty-700">NEW</span>
      {(['part', 'item', 'event'] as CardKind[]).map((kind) => (
        <ChipButton key={kind} onClick={() => editCard(addCard(kind))}>
          + {kind.toUpperCase()}
        </ChipButton>
      ))}

      <div className="ml-auto flex items-center gap-1.5">
        {note && <span className="font-mono text-[10px] text-amber-700">{note}</span>}
        <span className="font-mono text-[10px] text-putty-700">
          {editedCount > 0 ? `${editedCount} CHANGED · SAVED HERE` : 'UNCHANGED FROM THE REPO'}
        </span>
        <ChipButton onClick={download}>EXPORT JSON</ChipButton>
        <ChipButton onClick={() => fileInput.current?.click()}>IMPORT</ChipButton>
        <ChipButton
          onClick={() => {
            if (editedCount === 0) return flash('nothing to reset');
            if (confirm(`Discard ${editedCount} card change(s) and go back to the shipped deck?`)) {
              resetAll();
              editCard(null);
            }
          }}
        >
          RESET
        </ChipButton>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
