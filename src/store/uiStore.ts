import { create } from 'zustand';
import type { CardId, CardKind, PlayerId, RerouteMove, SlotIndex } from '@engine/types';
import { ship as shipEngine } from '@engine';

export type TabId = 'table' | 'cards';

/** How the Cards tab shows the deck: as printed cards, or as a spreadsheet. */
export type DeckMode = 'gallery' | 'sheet';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'table', label: 'Table' },
  { id: 'cards', label: 'Cards' },
];

/**
 * What the seat holding the turn is in the middle of doing. Each action picks
 * a module first and, if it aims, a target on the enemy after.
 */
export type CombatMode =
  /** `spend`: the ⚡ the shot spends — blank, the most the module may. */
  | { kind: 'attack'; slot: SlotIndex | null; spend?: number }
  | { kind: 'generate' }
  /** `amount`: ⚡ each click or drop moves — blank, as much as fits. */
  | { kind: 'reroute'; from: SlotIndex | null; moves: RerouteMove[]; amount?: number }
  | { kind: 'use'; slot: SlotIndex | null }
  | { kind: 'item'; cardId: CardId | null };

/** How the tabletop looks and moves — the Tweak drawer's switches. */
export interface TableTweaks {
  surface: 'putty' | 'felt' | 'walnut' | 'night';
  size: 's' | 'm' | 'l';
  chit: 'cube' | 'disc' | 'hex';
  die: 'ivory' | 'red' | 'crt';
  hand: 'fan' | 'row';
  /** Screen guides: empty cells, FRONT tags, seat names, deck numbers. */
  grid: 'on' | 'off';
  /** The seated camera's tilt. */
  tilt: 'on' | 'off';
  /** Turn the table so the seat on the clock sits at the bottom. */
  follow: 'on' | 'off';
  /** Rest the pointer on a card to hold it up and read it. */
  peek: 'on' | 'off';
}

export const TWEAK_DEFAULTS: TableTweaks = {
  surface: 'putty',
  size: 'm',
  chit: 'cube',
  die: 'ivory',
  hand: 'fan',
  grid: 'on',
  tilt: 'on',
  follow: 'on',
  peek: 'on',
};

const TWEAK_KEY = 'nomad-table-tweaks-v1';

function loadTweaks(): TableTweaks {
  try {
    const saved = JSON.parse(localStorage.getItem(TWEAK_KEY) ?? '{}') as Partial<TableTweaks>;
    const out = { ...TWEAK_DEFAULTS };
    for (const key of Object.keys(TWEAK_DEFAULTS) as (keyof TableTweaks)[]) {
      if (typeof saved[key] === 'string') (out as Record<string, string>)[key] = saved[key];
    }
    return out;
  } catch {
    return { ...TWEAK_DEFAULTS };
  }
}

function saveTweaks(tweaks: TableTweaks): void {
  try {
    localStorage.setItem(TWEAK_KEY, JSON.stringify(tweaks));
  } catch {
    // Private mode, or storage full: the tweaks just don't outlive the tab.
  }
}

/** View state only — nothing here is game state or tuning. */
interface UiStore {
  tab: TabId;
  configOpen: boolean;
  /** The table's own panel, down its left side. */
  hudOpen: boolean;
  toggleHud: () => void;
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

  // ---- combat ----
  /** The action the seat on the clock is building, or null between actions. */
  combatMode: CombatMode | null;
  /** Damage entered by hand for cards the engine leaves to the table. */
  manualDamage: number;
  /** The run transcript is open beside the table. */
  logOpen: boolean;

  // ---- tabletop ----
  tweaks: TableTweaks;
  tweaksOpen: boolean;
  /** The module the seat on the clock has picked up on the table, before choosing what it does. */
  tableSel: SlotIndex | null;
  /** A line for the panel about a click the table refused. */
  tableNote: string | null;
  /** Rolls of the step in hand whose dice have landed on the table. */
  rollsLanded: number;
  /** The seat the table is turned to while nobody is on the clock. */
  viewSeat: PlayerId | null;

  setViewSeat: (id: PlayerId | null) => void;
  setTweak: <K extends keyof TableTweaks>(key: K, value: TableTweaks[K]) => void;
  resetTweaks: () => void;
  toggleTweaks: (open?: boolean) => void;
  selectTableModule: (slot: SlotIndex | null) => void;
  setTableNote: (note: string | null) => void;
  setRollsLanded: (n: number) => void;

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
  setManualDamage: (n: number) => void;
  setCombatMode: (mode: CombatMode | null) => void;
  /** Reroute: pick (or let go of) the module ⚡ comes out of. */
  pickRerouteSource: (slot: SlotIndex | null) => void;
  /** Reroute: how much ⚡ the next click or drop moves. */
  setRerouteAmount: (amount: number) => void;
  /** Reroute: more ⚡ along a leg. */
  addRerouteLeg: (move: RerouteMove) => void;
  /** Reroute: take back the last leg. */
  undoRerouteLeg: () => void;
  toggleLog: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  tab: 'table',
  configOpen: true,
  hudOpen: true,
  toggleHud: () => set((s) => ({ hudOpen: !s.hudOpen })),
  rarityFilter: 0,
  deckMode: 'gallery',
  deckKind: null,
  deckSearch: '',
  deckColumnWidths: {},
  editingCardId: null,

  combatMode: null,
  manualDamage: 0,
  logOpen: true,

  tweaks: loadTweaks(),
  tweaksOpen: false,
  tableSel: null,
  tableNote: null,
  rollsLanded: 0,
  viewSeat: null,

  setViewSeat: (viewSeat) => set({ viewSeat }),
  setTweak: (key, value) =>
    set((s) => {
      const tweaks = { ...s.tweaks, [key]: value };
      saveTweaks(tweaks);
      return { tweaks };
    }),
  resetTweaks: () => {
    saveTweaks(TWEAK_DEFAULTS);
    set({ tweaks: { ...TWEAK_DEFAULTS } });
  },
  toggleTweaks: (open) => set((s) => ({ tweaksOpen: open ?? !s.tweaksOpen })),
  selectTableModule: (tableSel) => set({ tableSel }),
  setTableNote: (tableNote) => set({ tableNote }),
  setRollsLanded: (rollsLanded) => set({ rollsLanded }),

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
  setManualDamage: (manualDamage) => set({ manualDamage: Math.max(0, manualDamage) }),
  setCombatMode: (combatMode) => set({ combatMode }),
  pickRerouteSource: (from) =>
    set((s) => (s.combatMode?.kind === 'reroute' ? { combatMode: { ...s.combatMode, from, amount: undefined } } : s)),
  setRerouteAmount: (amount) =>
    set((s) => (s.combatMode?.kind === 'reroute' ? { combatMode: { ...s.combatMode, amount } } : s)),
  addRerouteLeg: (move) =>
    set((s) =>
      s.combatMode?.kind === 'reroute'
        ? { combatMode: { ...s.combatMode, moves: shipEngine.addRerouteLeg(s.combatMode.moves, move) } }
        : s,
    ),
  undoRerouteLeg: () =>
    set((s) => {
      if (s.combatMode?.kind !== 'reroute') return s;
      return { combatMode: { ...s.combatMode, moves: s.combatMode.moves.slice(0, -1) } };
    }),
  toggleLog: () => set((s) => ({ logOpen: !s.logOpen })),
}));
