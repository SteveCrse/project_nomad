import { create } from 'zustand';
import type { CardId, PlayerId } from '@engine/types';

export type TabId = 'table' | 'builder' | 'cards';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'table', label: 'Table' },
  { id: 'builder', label: 'Ship Builder' },
  { id: 'cards', label: 'Cards' },
];

/** View state only — nothing here is game state or tuning. */
interface UiStore {
  tab: TabId;
  configOpen: boolean;
  /** 0 = all rarities. */
  rarityFilter: number;
  /** Whose ship the builder is editing. */
  builderPlayerId: PlayerId;
  selectedPartId: CardId | null;

  setTab: (tab: TabId) => void;
  toggleConfig: () => void;
  setRarityFilter: (rarity: number) => void;
  setBuilderPlayer: (id: PlayerId) => void;
  selectPart: (id: CardId | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  tab: 'table',
  configOpen: true,
  rarityFilter: 0,
  builderPlayerId: 'p2',
  selectedPartId: 'laser-array',

  setTab: (tab) => set({ tab }),
  toggleConfig: () => set((s) => ({ configOpen: !s.configOpen })),
  setRarityFilter: (rarityFilter) => set({ rarityFilter }),
  setBuilderPlayer: (builderPlayerId) => set({ builderPlayerId }),
  selectPart: (selectedPartId) => set({ selectedPartId }),
}));
