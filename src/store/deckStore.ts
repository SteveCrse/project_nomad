import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Card, CardEffect, CardId, CardKind, DiceSpec, EffectType } from '@engine/types';
import { blankCard, hydrateDeck, makeEffect, migrateCard } from '@engine';
import { DEFAULT_CARDS, setDeck } from '@data';

/**
 * The deck the game is actually played with, and the edits laid over it.
 *
 * Persisted as an **overlay** rather than a snapshot: cards the designer has
 * touched, cards they added, ids they removed. A card that hasn't been edited
 * keeps tracking the repo, so adding or retuning content in `src/data` still
 * shows up in a browser that already has edits saved — which is what you want
 * from a tool used across a series of playtests.
 *
 * Every mutation recompiles the deck and pushes it into the engine's content
 * registry, so the next draw, the next spawn and the next activation all see
 * the new numbers.
 */

export interface DeckOverlay {
  /** Edited versions of cards that ship with the repo, by id. */
  edits: Record<CardId, Card>;
  /** Cards that exist only in this browser. */
  added: Card[];
  /** Ids of shipped cards taken out of the deck. */
  removed: CardId[];
}

const EMPTY_OVERLAY: DeckOverlay = { edits: {}, added: [], removed: [] };

const DEFAULT_IDS = new Set(DEFAULT_CARDS.map((c) => c.id));

/** Resolve the overlay against the authored deck and compile the result. */
function buildDeck(overlay: DeckOverlay): Card[] {
  const removed = new Set(overlay.removed);
  const shipped = DEFAULT_CARDS.filter((c) => !removed.has(c.id)).map(
    (c) => overlay.edits[c.id] ?? c,
  );
  const added = overlay.added.filter((c) => !removed.has(c.id));
  return hydrateDeck([...shipped, ...added]);
}

/**
 * Trust nothing out of localStorage or an imported file — and bring anything
 * saved under the old card shape forward, so a playtest overlay survives a
 * schema change instead of quietly losing its numbers.
 */
function sanitize(value: unknown): DeckOverlay {
  const raw = (value ?? {}) as Partial<DeckOverlay>;
  const isCard = (c: unknown): c is Card =>
    !!c && typeof c === 'object' && typeof (c as Card).id === 'string';
  return {
    edits: Object.fromEntries(
      Object.entries(raw.edits ?? {})
        .filter(([, card]) => isCard(card))
        .map(([id, card]) => [id, migrateCard(card as Card)]),
    ) as Record<CardId, Card>,
    added: (raw.added ?? []).filter(isCard).map(migrateCard),
    removed: (raw.removed ?? []).filter((id): id is CardId => typeof id === 'string'),
  };
}

interface DeckStore {
  /** The compiled deck in play. */
  cards: Card[];
  overlay: DeckOverlay;

  /** Overwrite fields on one card. */
  patchCard: (id: CardId, patch: Partial<Card>) => void;
  /** Replace a card's whole effect list. */
  setEffects: (id: CardId, effects: CardEffect[]) => void;
  addEffect: (id: CardId, type: EffectType) => void;
  removeEffect: (id: CardId, index: number) => void;
  moveEffect: (id: CardId, index: number, delta: number) => void;
  setEffectParam: (id: CardId, index: number, key: string, value: number) => void;
  /** ⚡ this effect draws to fire. Active effects only. */
  setEffectCost: (id: CardId, index: number, cost: number) => void;
  /** Attach, retune or drop the dice one effect rolls. */
  setEffectDice: (id: CardId, index: number, dice: DiceSpec | undefined) => void;
  /** Printed wording for a coded effect (`manual`, `reminder`). */
  setEffectText: (id: CardId, index: number, text: string) => void;

  addCard: (kind: CardKind) => CardId;
  duplicateCard: (id: CardId) => CardId | null;
  removeCard: (id: CardId) => void;
  /** Drop edits to a shipped card. No-op for one that only exists here. */
  revertCard: (id: CardId) => void;
  isEdited: (id: CardId) => boolean;
  isCustom: (id: CardId) => boolean;

  resetAll: () => void;
  exportJson: () => string;
  /** Replace the deck from an exported file. Returns an error to show, or null. */
  importJson: (text: string) => string | null;
}

/** Commit a new overlay: recompile, hand the deck to the engine, store it. */
const commit = (overlay: DeckOverlay): { overlay: DeckOverlay; cards: Card[] } => {
  const cards = buildDeck(overlay);
  setDeck(cards);
  return { overlay, cards };
};

/** Overlay with one card's edited version written in, wherever it lives. */
function writeCard(overlay: DeckOverlay, card: Card): DeckOverlay {
  if (DEFAULT_IDS.has(card.id)) {
    return { ...overlay, edits: { ...overlay.edits, [card.id]: card } };
  }
  return { ...overlay, added: overlay.added.map((c) => (c.id === card.id ? card : c)) };
}

/**
 * Overwrite fields on one effect of one card.
 *
 * Cost, dice and coded wording all live on the effect now, so they're all the
 * same edit: read the list, replace one entry, hand it back through
 * `setEffects` so the card recompiles and the engine sees the change.
 */
function patchEffect(
  get: () => DeckStore,
  id: CardId,
  index: number,
  patch: Partial<CardEffect>,
): void {
  const card = get().cards.find((c) => c.id === id);
  if (!card) return;
  get().setEffects(
    id,
    (card.effects ?? []).map((effect, i) => (i === index ? { ...effect, ...patch } : effect)),
  );
}

/** A fresh id that collides with nothing currently in the deck. */
function uniqueId(cards: Card[], base: string): CardId {
  const taken = new Set(cards.map((c) => c.id));
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card';
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) {
    const candidate = `${slug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const useDeckStore = create<DeckStore>()(
  persist(
    (set, get) => ({
      ...commit(EMPTY_OVERLAY),

      patchCard: (id, patch) =>
        set((s) => {
          const card = s.cards.find((c) => c.id === id);
          if (!card) return s;
          return commit(writeCard(s.overlay, { ...card, ...patch } as Card));
        }),

      setEffects: (id, effects) => get().patchCard(id, { effects }),

      addEffect: (id, type) => {
        const card = get().cards.find((c) => c.id === id);
        if (!card) return;
        get().setEffects(id, [...(card.effects ?? []), makeEffect(type)]);
      },

      removeEffect: (id, index) => {
        const card = get().cards.find((c) => c.id === id);
        if (!card) return;
        get().setEffects(
          id,
          (card.effects ?? []).filter((_, i) => i !== index),
        );
      },

      moveEffect: (id, index, delta) => {
        const card = get().cards.find((c) => c.id === id);
        if (!card) return;
        const effects = (card.effects ?? []).slice();
        const to = index + delta;
        if (to < 0 || to >= effects.length) return;
        const [moved] = effects.splice(index, 1);
        effects.splice(to, 0, moved!);
        get().setEffects(id, effects);
      },

      setEffectParam: (id, index, key, value) => {
        const card = get().cards.find((c) => c.id === id);
        if (!card) return;
        get().setEffects(
          id,
          (card.effects ?? []).map((effect, i) =>
            i === index ? { ...effect, params: { ...effect.params, [key]: value } } : effect,
          ),
        );
      },

      setEffectCost: (id, index, cost) => patchEffect(get, id, index, { cost }),

      setEffectDice: (id, index, dice) => patchEffect(get, id, index, { dice }),

      setEffectText: (id, index, text) => patchEffect(get, id, index, { text }),

      addCard: (kind) => {
        const id = uniqueId(get().cards, `new ${kind}`);
        const card = blankCard(kind, id, `New ${kind[0]!.toUpperCase()}${kind.slice(1)}`);
        set((s) => commit({ ...s.overlay, added: [...s.overlay.added, card] }));
        return id;
      },

      duplicateCard: (id) => {
        const card = get().cards.find((c) => c.id === id);
        if (!card) return null;
        const copy = { ...card, id: uniqueId(get().cards, `${card.id}-copy`), name: `${card.name} (copy)` };
        set((s) => commit({ ...s.overlay, added: [...s.overlay.added, copy] }));
        return copy.id;
      },

      removeCard: (id) =>
        set((s) =>
          commit({
            ...s.overlay,
            edits: Object.fromEntries(Object.entries(s.overlay.edits).filter(([key]) => key !== id)),
            added: s.overlay.added.filter((c) => c.id !== id),
            removed: DEFAULT_IDS.has(id) ? [...new Set([...s.overlay.removed, id])] : s.overlay.removed,
          }),
        ),

      revertCard: (id) =>
        set((s) =>
          commit({
            ...s.overlay,
            edits: Object.fromEntries(Object.entries(s.overlay.edits).filter(([key]) => key !== id)),
            removed: s.overlay.removed.filter((key) => key !== id),
          }),
        ),

      isEdited: (id) => id in get().overlay.edits,
      isCustom: (id) => !DEFAULT_IDS.has(id),

      resetAll: () => set(commit(EMPTY_OVERLAY)),

      exportJson: () => JSON.stringify({ version: 1, ...get().overlay }, null, 2),

      importJson: (text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return 'not valid JSON';
        }
        const overlay = sanitize(parsed);
        const touched =
          Object.keys(overlay.edits).length + overlay.added.length + overlay.removed.length;
        if (touched === 0) return 'no cards in that file';
        set(commit(overlay));
        return null;
      },
    }),
    {
      name: 'nomad.deck.v1',
      partialize: (s) => ({ overlay: s.overlay }),
      // The deck itself is derived, so a save only carries the overlay and the
      // cards are rebuilt against whatever `src/data` says today.
      merge: (persisted, current) => {
        const overlay = sanitize((persisted as { overlay?: unknown } | undefined)?.overlay);
        return { ...current, overlay, cards: buildDeck(overlay) };
      },
      onRehydrateStorage: () => (state) => {
        if (state) setDeck(state.cards);
      },
    },
  ),
);

/** The deck in play. */
export const useDeck = (): Card[] => useDeckStore((s) => s.cards);
