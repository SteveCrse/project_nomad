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
2. **Ship Builder** — the run opens in the draft. Each seat pulls
   `starting_draws` parts off the shared Parts deck, one card at a time and
   round the table, and the card that comes up lands in that seat's hold. The
   first cockpit a seat draws takes over its hull, because capacity is the
   cockpit's. Then lay the grid out: drag a part from the hold onto a position
   (or click the part, then the position), drag fitted modules around to
   reorder them, and drag one back to the hold to pull it off. **A part has to
   attach next to something already fitted** — legal positions light up while
   you're holding one — so a hull grows outward from its cockpit and adjacency
   is a decision. Then *Start the mission*; parts left in the hold ride along
   in the Scrap Deck up to its cap, and the overflow is shuffled back into the
   deck. Set `starting_draws` to 0 to skip the draft and
   roll out on the authored loadouts instead. The same grid editing is
   available at every rearrangement point.
3. Click a reachable step. With 2+ seats, the *split party* switch turns the
   branch into the rules' higher-risk choice — seats move one at a time and
   each occupied node resolves its own encounter, with only the seats standing
   there in the fight.
4. **Table** — the view follows the run, so walking into a combat step puts you
   on the table. Spend downs from the action bar; every button is gated by the
   engine's own legality check, and the refusal reason is the tooltip. A module
   fires as often as its pool can pay for, one down a shot. To reload, build a
   **reroute pass** on your own grid — click a charged module, then the
   neighbour it feeds, as many links as you like — and commit it for a single
   down; each module may be drained once, and ⚡ only moves between neighbours.
   *End set* converts if the set beat the defender's threshold, otherwise it
   passes the turn. The enemy plays itself, one down or one turn at a time.
5. Wrecks open the **loot phase**: A (take the whole ship, keep one module) or
   B (strip one module into the Scrap Deck).
6. Checkpoints raise the rarity ceiling, shuffle the newly unlocked tiers into
   all three decks, and double as a **rearrangement point** — slot hoarded
   modules, and buy an own-threshold upgrade if that switch is on.
7. Kill the boss to end the mission; *Next sector* rolls the next one forward.

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

- **Conversion was unreachable for a one-weapon ship** while offensive modules
  fired once per fresh set: the most a side could deal in a set was the sum of
  its weapons' power, so a single 4⚔ gun could never reach a threshold of 12.
  Settled by letting a module fire as often as its pool can pay for — charge
  and AP ration a volley now, not a per-set flag. `once_per_set` puts the old
  rule back for comparison.
- **Printed energy costs outrun generation.** Generators make 1–2⚡ a turn into
  their own pools; weapons cost 3–4⚡ a shot and rerouting used to cost a down.
  Fights stalled with both sides unable to fire. Two changes make it run:
  `energy_per_turn` (a reactor baseline spread across the grid at upkeep,
  default 6) and free rerouting on any ship carrying a redistributor. Both are
  tunable — `energy_per_turn: 0` puts you back on generator modules alone.
  Weapons sit outside that baseline (`reactor_feeds_wpn`, off by default): a
  gun is loaded by rerouting into it from a neighbour, which is what makes
  where the generators sit on the grid matter.
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
