# Project N.O.M.A.D. — Test Tool

Browser-based prototype and playtesting tool for a sci-fi roguelike deckbuilding
looter shooter card game. This is a **rules and balance workbench**, not a
shippable game — it optimises for changing a number and seeing what happens.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. (`PORT=5174 npm run dev` if that port is busy.)

| Script              | Does                                  |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Vite dev server with HMR              |
| `npm run build`     | Typecheck + production build          |
| `npm run typecheck` | Types only                            |

## Playing a round

1. **Mission** — press *Start a run*. A board is generated from the config:
   length, branching, checkpoint cadence, enemy scaling, rarity ceiling.
2. Click a reachable step. With 2+ seats, the *split party* switch turns the
   branch into the rules' higher-risk choice — seats move one at a time and
   each occupied node resolves its own encounter, with only the seats standing
   there in the fight.
3. **Table** — the view follows the run, so walking into a combat step puts you
   on the table. Spend downs from the action bar; every button is gated by the
   engine's own legality check, and the refusal reason is the tooltip. *End set*
   converts if the set beat the defender's threshold, otherwise it passes the
   turn. The enemy plays itself, one down or one turn at a time.
4. Wrecks open the **loot phase**: A (take the whole ship, keep one module) or
   B (strip one module into the Scrap Deck).
5. Checkpoints raise the rarity ceiling, shuffle the newly unlocked tiers into
   all three decks, and double as a **rearrangement point** — slot hoarded
   modules, and buy an own-threshold upgrade if that switch is on.
6. Kill the boss to end the mission; *Next sector* rolls the next one forward.

Everything lands in the run transcript on the right — rolls, soaks,
conversions, refusals — which is the artefact a playtest actually produces.

## Layout

```
src/
  engine/      rules engine — plain TS, no React (see engine/README.md)
  data/        cards, enemies, starting loadouts — content, not logic
  store/       Zustand: config (tuning) + game (the run) + ui (view state)
  components/
    ds/        design-system primitives ported from Claude Design
    game/      module tiles, panels, action bar, log, prompt overlay
    layout/    top bar + config sidebar
  views/       Mission, Table, Ship Builder, Card Browser
  styles/      design tokens as CSS custom properties
```

Three boundaries hold this together:

1. **Engine never imports UI — or content.** It takes state, `GameConfig` and a
   `Content` bundle and returns new state, so the same rules can run headless
   for balance sweeps.
2. **Content lives in `src/data`.** Adding a card or enemy is a data edit. The
   structured fields on each card (`energyCost`, `effect`, `dice`, …) are what
   the engine resolves; anything outside that vocabulary is marked `manual` and
   left to the table.
3. **Tunables live in `GameConfig`.** If a playtester might want to change a
   number, it belongs there — not as a literal in engine code.

## Config sidebar

A live editor over the Zustand config store, rendered from the field
descriptors in `src/store/configFields.ts`. Adding a tunable is: add it to
`GameConfig` + `DEFAULT_CONFIG`, add a descriptor, done. Config persists to
localStorage; `EXPORT JSON` copies it to the clipboard. A new run picks up the
current config; changes mid-run bite from the next turn.

## Status

Playable end to end: generate a mission, walk it, fight, loot, cross a
checkpoint, kill the boss, roll into the next sector. Solo and up to four
seats, together or split.

### What the first playthroughs turned up

Findings, not bugs — they're decisions for the rules doc:

- **Conversion is unreachable for a one-weapon ship.** Offensive modules fire
  once per fresh set, so the most a side can deal in a set is the sum of its
  weapons' power. A starting ship with a single 4⚔ gun cannot hit a threshold
  of 12 no matter how the downs are spent. Either thresholds scale to weapon
  count, or something other than raw damage counts toward conversion.
- **Printed energy costs outrun generation.** Generators make 1–2⚡ a turn into
  their own pools; weapons cost 3–4⚡ a shot and rerouting used to cost a down.
  Fights stalled with both sides unable to fire. Two changes make it run:
  `energy_per_turn` (a reactor baseline spread across the grid at upkeep,
  default 6) and free rerouting on any ship carrying a redistributor. Both are
  tunable — `energy_per_turn: 0` puts you back on generator modules alone.
- **Enemy size is drawn, not dialled.** "Draw until the next cockpit" means an
  enemy can arrive with 3 modules or 9. `enemy_parts_base` acts as a floor
  rather than a count. That variance is the rule as written; worth confirming
  it's wanted.
- **Infested Railgun can't pay its own cost** — printed pool 1⚡, printed cost
  2⚡. Raised to 4 in the data with a comment; the card text needs a decision.

### Rules questions, as modelled

- **Board vs. deck-built campaign** (#1) — modelled as a board, since the split
  choice needs one.
- **Threshold upgrades** (#2) — threshold is a defensive stat, and a seat can
  buy `+threshold_step` at a cost of `threshold_cost`⚔ per attack at any
  rearrangement point. Switch it off with `threshold_upgrades`.
- **One Scrap Deck or two** (#3) — one pool, as the doc leans.
