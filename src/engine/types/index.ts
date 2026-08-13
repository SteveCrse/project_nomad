export type * from './ids';
export type * from './ship';
export type * from './enemy';
export type * from './player';
export type * from './combat';
export type * from './board';
export type * from './game';

export type {
  Card,
  CardKind,
  PartCard,
  ItemCard,
  EventCard,
  ModuleRole,
  ModuleEffect,
  Specialization,
  Rarity,
  DieKind,
  DiceSpec,
} from './card';
export { isPart, isItem, isEvent, isCockpit } from './card';

export type { GameConfig } from './config';
export {
  DEFAULT_CONFIG,
  effectiveThreshold,
  playerThreshold,
  partsForSpawn,
} from './config';
