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
| Screens | `src/views/` | `TableView` (the whole game, on the tabletop), `CardBrowserView` (deck editor). There is no separate map, builder or prompt screen |
| Play UI (tabletop) | `src/components/game/table/` | `Tabletop` (table, seats with purse/rack/berth, centre with draft and loot spreads, mission strip, hand, card flights), `TableCard` (any card on the table: a `CardTile` at the table's scale, with its markers), `TableShip` (ship grid, build-mode drop cells), `TableDie`, `TableHud` (panel under the table: every phase's buttons and headline), `TweakDrawer`, `useCamera`, `play.ts` (combat: engine ↔ clicks), `build.ts` (draft, layout, tokens, rebuild: what may be dropped where); look: `src/styles/tabletop.css`; reference mockup: `docs/mockups/tabletop.html` |
| Shared game UI | `src/components/game/` | `CardTile` (the printed card, and the only drawing of one: the editor, the Cards tab, every card on the table and in the hand, and the read-a-card peek) |
| Animation | `src/components/fx/` | `FxLayer`, `tableFx` (marker/card flights on the tabletop), `DiceOverlay` (off the table tab), `drag` |
| Deck editor UI | `src/components/editor/` | `DeckTable`, `CardPanel`, `inputs` |
| Design system | `src/components/ds/`, `src/styles/tokens.css`, `src/index.css` | |

## Working conventions

- The tool is the physical game table. Anything that happens physically in the real game (dealing, taking a card, paying or placing tokens, moving a mini, stripping a wreck) happens on the table, by dragging or clicking the component itself. The panel under the table is only for what has no physical counterpart (declaring an attack, passing, ending a turn) and for tool shortcuts. No pop-ups, no extra screens.
- A card has one look. Anything that shows a card renders `CardTile` (on the table through `TableCard`); don't draw a second, simplified face for it.
- Every state change is animated; every roll is clicked and shown before it applies; turns end on a button.
- Engine steps are pure `(state, …) → state`. Keep UI logic out of `src/engine/`.

## Keeping token use down

Sessions are the cost, not file size: context is re-read every turn, so a 400-turn session costs far more than the code it touches.

- One task per session. Start a fresh session (or `/clear`) when the task changes; don't carry a finished feature into the next.
- Locate with Grep, then Read with `offset`/`limit`. Don't `cat` several files in one Bash call, and don't re-read a file you just edited.
- Prefer `Edit` over `Write` for existing files; a full rewrite puts the whole file in context again. Batch related changes into one edit.
- Don't read `package-lock.json`, `dist/`, `tsconfig.tsbuildinfo`, or the card PNGs in `Project N.O.M.A.D._pngs/` unless the task is about them.
- Prefer `get_page_text` / `read_page` over screenshots when verifying UI text or structure.
