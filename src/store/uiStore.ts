import { create } from 'zustand';
import type { CardId, EnergyTransfer, PlayerId, SlotIndex } from '@engine/types';

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

  // ---- reroute pass ----
  /**
   * Legs queued for the current down's reroute pass. One down moves charge out
   * of every module at most once, so this is built up on the grid and then
   * committed in one go.
   */
  rerouteTransfers: EnergyTransfer[];
  /** Module picked as the next leg's source, waiting on a neighbour. */
  rerouteFrom: SlotIndex | null;

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
  pickRerouteFrom: (slot: SlotIndex | null) => void;
  queueTransfer: (transfer: EnergyTransfer) => void;
  dropTransfer: (index: number) => void;
  clearReroute: () => void;
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
  rerouteTransfers: [],
  rerouteFrom: null,

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

  pickRerouteFrom: (rerouteFrom) => set({ rerouteFrom }),
  queueTransfer: (transfer) =>
    set((s) => ({
      // One drain per module per down: a second leg off the same source
      // replaces the first rather than stacking.
      rerouteTransfers: [
        ...s.rerouteTransfers.filter((t) => t.from !== transfer.from),
        transfer,
      ],
      rerouteFrom: null,
    })),
  dropTransfer: (index) =>
    set((s) => ({ rerouteTransfers: s.rerouteTransfers.filter((_, i) => i !== index) })),
  clearReroute: () => set({ rerouteTransfers: [], rerouteFrom: null }),
}));
