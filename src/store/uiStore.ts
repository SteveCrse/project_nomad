import { create } from 'zustand';
import type { CardId, PlayerId, SlotIndex } from '@engine/types';

export type TabId = 'mission' | 'table' | 'builder' | 'cards';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'mission', label: 'Mission' },
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
  /** Follow the run's phase when it changes views on its own. */
  autoFollow: boolean;

  // ---- combat targeting ----
  /** Enemy instance the active seat is shooting at. */
  targetEnemyId: string | null;
  /** Enemy module under the crosshair, for module-targeted weapons. */
  targetSlot: SlotIndex | null;
  /** Dice bought for a variable-dice weapon. */
  diceCount: number;
  /** Damage entered by hand for cards the engine leaves to the table. */
  manualDamage: number;

  setTab: (tab: TabId) => void;
  toggleConfig: () => void;
  setRarityFilter: (rarity: number) => void;
  setBuilderPlayer: (id: PlayerId) => void;
  selectPart: (id: CardId | null) => void;
  setTarget: (enemyId: string | null) => void;
  setTargetSlot: (slot: SlotIndex | null) => void;
  setDiceCount: (n: number) => void;
  setManualDamage: (n: number) => void;
  setAutoFollow: (on: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  tab: 'mission',
  configOpen: true,
  rarityFilter: 0,
  builderPlayerId: 'p1',
  selectedPartId: null,
  autoFollow: true,

  targetEnemyId: null,
  targetSlot: null,
  diceCount: 1,
  manualDamage: 0,

  setTab: (tab) => set({ tab }),
  toggleConfig: () => set((s) => ({ configOpen: !s.configOpen })),
  setRarityFilter: (rarityFilter) => set({ rarityFilter }),
  setBuilderPlayer: (builderPlayerId) => set({ builderPlayerId }),
  selectPart: (selectedPartId) => set({ selectedPartId }),
  setTarget: (targetEnemyId) => set({ targetEnemyId, targetSlot: null }),
  setTargetSlot: (targetSlot) => set({ targetSlot }),
  setDiceCount: (diceCount) => set({ diceCount: Math.max(1, diceCount) }),
  setManualDamage: (manualDamage) => set({ manualDamage: Math.max(0, manualDamage) }),
  setAutoFollow: (autoFollow) => set({ autoFollow }),
}));
