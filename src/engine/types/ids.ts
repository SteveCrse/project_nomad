/** Stable string keys used across data files and engine state. */

export type CardId = string;
export type PartId = CardId;
export type ItemId = CardId;
export type EventId = CardId;

export type EnemyId = string;
export type PlayerId = string;
export type ShipId = string;
export type NodeId = string;

/** Index into `Ship.slots` — a module, wherever on the grid it sits. */
export type SlotIndex = number;
