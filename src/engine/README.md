# Engine

The rules engine for Project N.O.M.A.D. Plain TypeScript — **no React, no
Zustand, no DOM**. The UI reads `GameConfig` out of the Zustand store and
passes it in; the engine never reaches back.

That boundary is the point: the same code should be runnable headless for
balance sweeps (roll 10k combats across a range of `convThreshold` values)
without dragging a renderer along.

## Layout

| Path        | Holds                                                              |
| ----------- | ------------------------------------------------------------------ |
| `types/`    | The data model — cards, ships, enemies, players, combat, board, config |
| `combat/`   | Symmetric downs system: downs, conversion, damage                  |
| `deck/`     | Deck building, shuffling, drawing, checkpoint rarity gates         |
| `ship/`     | Ship assembly, enemy spawning, energy rerouting, adjacency         |
| `loot/`     | Loot phase A/B, scrap deck, rearrangement points                   |
| `board/`    | Mission generation, movement, party splits                         |
| `rng.ts`    | Seeded RNG so a playtest run is reproducible                       |

## Status

Types and function signatures only. Every function body currently throws
`not implemented` — deliberately, so nothing silently depends on a placeholder
result. Fill them in one subsystem at a time.

## Conventions

- **Pure functions.** Take state + config, return new state. No mutation of
  inputs, no module-level mutable state.
- **No tuning literals.** Anything a playtester might want to change belongs in
  `GameConfig` (`types/config.ts`), not in a function body.
- **Content lives in `src/data`,** not here. Adding a card or an enemy must
  never require an engine edit.
