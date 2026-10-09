# Project N.O.M.A.D.

Browser-based prototype and playtesting tool for a sci-fi roguelike deckbuilding card game.
React 19 + Zustand + Tailwind 4 + Vite, TypeScript. No test suite; verify with `npm run typecheck` and the dev server (`nomad-dev` in `.claude/launch.json`).

**Design authority:** `ship-dungeon-card-game-rules-v3.md`. Implement what it says and nothing more; gaps go in its *Open Questions* section.

## Where things live (read this instead of exploring)

`src/engine/` is pure TypeScript — no React, no DOM, no store. Everything else renders it. Detail: `src/engine/README.md` (read only the section you need).

| Area | Path | Notes |
| --- | --- | --- |
| Data model | `engine/types/*.ts` | `card.ts` (cards/effects), `ship.ts`, `combat.ts`, `game.ts` (RunState), `config.ts` (GameConfig) |
| Effect catalogue / card compile | `engine/effects.ts`, `engine/cards.ts` | what a card is assembled from; its printed text; balance helpers |
| Combat | `engine/combat/` | `sides` (accessors/writes/dice events), `legality` (actionError), `strike`, `resolve` (resolveDown), `turns` (down/turn flow, startCombat), `enemy` (enemyDown); `index.ts` is a barrel |
| Ship grid | `engine/ship/` | `build` (create/place/move), `layout` (legal cells, layoutErrors), `size`, `damage` (hits/energy), `spawn`, plus `module.ts`, `reroute.ts`; barrel `index.ts` |
| Run flow | `engine/game/` | `draft.ts` (draft/assembly), `setup` (newRun), `nodes`, `flow` (continueRun, fights), `rewards` (loot/events/rewards), `salvage`, `shared.ts`; barrel `index.ts` |
| Loot / boards / AI / decks | `engine/loot`, `board`, `ai`, `deck` | each is a single `index.ts` |
| Content (cards, parts, bosses…) | `src/data/*.ts` | injected through `engine/content.ts`; engine never imports `src/data` |
| State | `src/store/` | `gameStore` (run), `configStore` (+ `configFields.ts` form schema), `deckStore` (editor), `uiStore` |
| Derived view logic | `src/lib/` | `combatView`, `combatControls`, `cardHints`, `palette` |
| Screens | `src/views/` | `TableView` (play), `MissionView` (map), `ShipBuilderView` (+ `views/shipBuilder/`: `DraftPanel`, `GridEditor`, `Rack`, `RebuildBar`, `SelectedPanel`), `CardBrowserView` |
| Play UI | `src/components/game/` | `ActionBar`, `PromptOverlay`, `CardTile`, `ModuleTile`, `ShipGrid`, panels |
| Animation | `src/components/fx/` | `FxLayer`, `DiceOverlay`, `drag` |
| Deck editor UI | `src/components/editor/` | `DeckTable`, `CardPanel`, `inputs` |
| Design system | `src/components/ds/`, `src/styles/tokens.css`, `src/index.css` | |

## Working conventions

- Every state change is animated; every roll is clicked and shown before it applies; turns end on a button.
- Engine steps are pure `(state, …) → state`. Keep UI logic out of `src/engine/`.

## Keeping token use down

Sessions are the cost, not file size: context is re-read every turn, so a 400-turn session costs far more than the code it touches.

- One task per session. Start a fresh session (or `/clear`) when the task changes; don't carry a finished feature into the next.
- Locate with Grep, then Read with `offset`/`limit`. Don't `cat` several files in one Bash call, and don't re-read a file you just edited.
- Prefer `Edit` over `Write` for existing files; a full rewrite puts the whole file in context again. Batch related changes into one edit.
- Don't read `package-lock.json`, `dist/`, `tsconfig.tsbuildinfo`, or the card PNGs in `Project N.O.M.A.D._pngs/` unless the task is about them.
- Prefer `get_page_text` / `read_page` over screenshots when verifying UI text or structure.
