import { create } from 'zustand';
import type { CardId, CardKind, PlayerId, RerouteMove, SlotIndex } from '@engine/types';
import { ship as shipEngine } from '@engine';

export type TabId = 'mission' | 'table' | 'builder' | 'cards';

/** How the Cards tab shows the deck: as printed cards, or as a spreadsheet. */
export type DeckMode = 'gallery' | 'sheet';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'mission', label: 'Mission' },
  { id: 'table', label: 'Table' },
  { id: 'builder', label: 'Ship Builder' },
  { id: 'cards', label: 'Cards' },
];

/**
 * What the seat holding the turn is in the middle of doing. Each action picks
 * a module first and, if it aims, a target on the enemy after.
 */
export type CombatMode =
  | { kind: 'attack'; slot: SlotIndex | null }
  | { kind: 'generate' }
  | { kind: 'reroute'; from: SlotIndex | null; moves: RerouteMove[] }
  | { kind: 'use'; slot: SlotIndex | null }
  | { kind: 'item'; cardId: CardId | null };

/** View state only — nothing here is game state or tuning. */
interface UiStore {
  tab: TabId;
  configOpen: boolean;
  /** 0 = all rarities. */
  rarityFilter: number;

  // ---- deck editor ----
  deckMode: DeckMode;
  /** null = every deck. */
  deckKind: CardKind | null;
  deckSearch: string;
  /**
   * Spreadsheet column widths in px, by column key. Only the columns the
   * designer has dragged are in here; the rest fall back to their defaults.
   */
  deckColumnWidths: Record<string, number>;
  /** Card open in the editor panel. */
  editingCardId: CardId | null;
  /** Whose ship the builder is editing. */
  builderPlayerId: PlayerId;
  selectedPartId: CardId | null;
  /** Follow the run's phase when it changes views on its own. */
  autoFollow: boolean;

  // ---- combat ----
  /** The action the seat on the clock is building, or null between actions. */
  combatMode: CombatMode | null;
  /** Damage entered by hand for cards the engine leaves to the table. */
  manualDamage: number;
  /** The run transcript is open beside the table. */
  logOpen: boolean;

  setTab: (tab: TabId) => void;
  toggleConfig: () => void;
  setRarityFilter: (rarity: number) => void;
  setDeckMode: (mode: DeckMode) => void;
  setDeckKind: (kind: CardKind | null) => void;
  setDeckSearch: (search: string) => void;
  setDeckColumnWidth: (key: string, width: number) => void;
  /** Drop one column back to its default width, or all of them. */
  resetDeckColumn: (key?: string) => void;
  editCard: (id: CardId | null) => void;
  setBuilderPlayer: (id: PlayerId) => void;
  selectPart: (id: CardId | null) => void;
  setManualDamage: (n: number) => void;
  setAutoFollow: (on: boolean) => void;
  setCombatMode: (mode: CombatMode | null) => void;
  /** Reroute: pick (or let go of) the module ⚡ comes out of. */
  pickRerouteSource: (slot: SlotIndex | null) => void;
  /** Reroute: one more token along a leg. */
  addRerouteLeg: (move: RerouteMove) => void;
  undoRerouteLeg: () => void;
  toggleLog: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  tab: 'mission',
  configOpen: true,
  rarityFilter: 0,
  deckMode: 'gallery',
  deckKind: null,
  deckSearch: '',
  deckColumnWidths: {},
  editingCardId: null,
  builderPlayerId: 'p1',
  selectedPartId: null,
  autoFollow: true,

  combatMode: null,
  manualDamage: 0,
  logOpen: true,

  setTab: (tab) => set({ tab }),
  toggleConfig: () => set((s) => ({ configOpen: !s.configOpen })),
  setRarityFilter: (rarityFilter) => set({ rarityFilter }),
  setDeckMode: (deckMode) => set({ deckMode }),
  setDeckKind: (deckKind) => set({ deckKind }),
  setDeckSearch: (deckSearch) => set({ deckSearch }),
  setDeckColumnWidth: (key, width) =>
    set((s) => ({ deckColumnWidths: { ...s.deckColumnWidths, [key]: Math.max(28, Math.round(width)) } })),
  resetDeckColumn: (key) =>
    set((s) => ({
      deckColumnWidths: key
        ? Object.fromEntries(Object.entries(s.deckColumnWidths).filter(([k]) => k !== key))
        : {},
    })),
  editCard: (editingCardId) => set({ editingCardId }),
  setBuilderPlayer: (builderPlayerId) => set({ builderPlayerId }),
  selectPart: (selectedPartId) => set({ selectedPartId }),
  setManualDamage: (manualDamage) => set({ manualDamage: Math.max(0, manualDamage) }),
  setAutoFollow: (autoFollow) => set({ autoFollow }),
  setCombatMode: (combatMode) => set({ combatMode }),
  pickRerouteSource: (from) =>
    set((s) => (s.combatMode?.kind === 'reroute' ? { combatMode: { ...s.combatMode, from } } : s)),
  addRerouteLeg: (move) =>
    set((s) =>
      s.combatMode?.kind === 'reroute'
        ? { combatMode: { ...s.combatMode, moves: shipEngine.addRerouteLeg(s.combatMode.moves, move) } }
        : s,
    ),
  undoRerouteLeg: () =>
    set((s) => {
      if (s.combatMode?.kind !== 'reroute') return s;
      const moves = s.combatMode.moves.slice();
      const last = moves.pop();
      if (last && last.amount > 1) moves.push({ ...last, amount: last.amount - 1 });
      return { combatMode: { ...s.combatMode, moves } };
    }),
  toggleLog: () => set((s) => ({ logOpen: !s.logOpen })),
}));
