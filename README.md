# Project N.O.M.A.D. — Test Tool

Browser-based prototype and playtesting tool for a sci-fi roguelike deckbuilding
looter shooter card game. This is a **rules and balance workbench**, not a
shippable game — it optimises for changing a number and seeing what happens.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Script              | Does                                  |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Vite dev server with HMR              |
| `npm run build`     | Typecheck + production build          |
| `npm run typecheck` | Types only                            |

## Layout

```
src/
  engine/      rules engine — plain TS, no React (see engine/README.md)
  data/        cards, enemies, seeded ships — content, not logic
  store/       Zustand: config (tuning) + ui (view state)
  components/
    ds/        design-system primitives ported from Claude Design
    game/      module tiles, player/enemy panels, decks, card faces
    layout/    top bar + config sidebar
  views/       Table, Ship Builder, Card Browser
  styles/      design tokens as CSS custom properties
```

Three boundaries hold this together:

1. **Engine never imports UI.** It takes state + `GameConfig` and returns new
   state, so the same rules can run headless for balance sweeps.
2. **Content lives in `src/data`.** Adding a card or enemy is a data edit.
3. **Tunables live in `GameConfig`.** If a playtester might want to change a
   number, it belongs there — not as a literal in engine code.

## Design system

Imported from the Claude Design project `NOMAD Test Tool.dc.html`. Tokens
(colors, typography, spacing, effects) are ported verbatim into
`src/styles/tokens.css` and bridged into Tailwind's theme in `src/index.css`
via `@theme inline`, so every token is reachable both as `var(--putty-300)` and
as a utility (`bg-putty-300`). Tailwind's default 4px spacing scale already
matches the design's scale, so it is deliberately not remapped.

The design's `support.js` is the Claude Design preview runtime — it interprets
`<x-dc>`, `sc-if`, `sc-for` and the `{{ }}` bindings in the `.dc.html`. React
replaces it wholesale, so it was not ported.

## Config sidebar

A live editor over the Zustand config store, rendered from the field
descriptors in `src/store/configFields.ts`. Adding a tunable is: add it to
`GameConfig` + `DEFAULT_CONFIG`, add a descriptor, done.

Nothing downstream consumes the config yet — the engine will. The Table view
does already read a few values (seat count, downs, scrap cap, enemy hull
scaling, rarity ceiling) so the knobs visibly bite. Config persists to
localStorage; `EXPORT JSON` copies it to the clipboard.

## Status

Scaffolding pass. Types and folder structure are in place; every engine
function throws `not implemented` on purpose. Combat resolution, the board, and
the loot phase come next.

Open questions from `ship-dungeon-card-game-rules-v2.md` that affect the model:
board vs. deck-built campaign, conversion-threshold upgrades, and whether the
Scrap Deck is really one pool. All three are modelled the way the doc leans and
flagged in comments where they bite.
