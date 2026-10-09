# Project N.O.M.A.D. — Test Tool

Browser-based prototype and playtesting tool for a sci-fi roguelike deckbuilding
looter shooter card game. This is a **rules and balance workbench**, not a
shippable game — it optimises for changing a number and seeing what happens.

The rules it implements are [`ship-dungeon-card-game-rules-v3.md`](ship-dungeon-card-game-rules-v3.md).
That doc is the design authority; its last section lists every gap the tool had
to fill and how it fills it today.

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

1. **Draft** — press *Start a run*; the run opens in the Ship Builder on the
   snake draft. Every seat has **10 energy tokens** (`draft_tokens`). The
   cockpit round deals seats + 1 cockpits, free; then **3 module rounds**
   (`draft_rounds`) each deal seats-still-drafting + 1 modules, which cost 1–3
   tokens (rarer being dearer). Pick order reverses each round. Drag a card
   onto a cell of your ship (or into the hold), or click it and *Take* it — or
   *Pass* the round to keep your tokens. *Draft the rest* finishes it for
   everyone.
2. **Arrange & charge** — a ship is a grid around its cockpit: rows above it
   are the front, below it the back. Weapons go beside or behind the cockpit;
   nothing goes in front of a shield, and a shield covers its column. Every
   module has to touch the ship. Pick a card up and every cell it may land on
   lights up; drop a module on another to swap them. Then put your **leftover
   tokens** on your modules as starting ⚡ — drag a token onto a module, or use
   its + / − (`draft_start_energy` adds a flat amount to every module, 0 by
   default). *Start the mission*.
3. **Mission** — click a reachable step. Each combat step shows how big an
   enemy to expect there: mission depth + players modules. With 2+ seats the
   *split party* switch lets seats take different branches.
4. **Table** — the enemy has the top of the table, its ship flipped to face
   you; every seat sits side by side below it, the one on the clock lit and the
   rest greyed. Along the bottom: **Attack**, **Generate**, **Reroute** (plus
   *Ability* and *Item* when you have one). Press one and the modules that can
   do it light up — pick one, and an attack then asks for its target. Every
   module's energy is its hit chance *and* its HP: an attack rolls a d6 and hits
   at or under the ⚡ on the module firing. The dice come up on screen — click
   to roll, read the result, *Continue*, and only then does the shot fly. A hit
   takes ⚡ off the target equal to its attack (at least 1); at 0 a module has
   nothing to spend, and the next hit destroys it. A **reroute** moves ⚡ between modules
   that touch — as much as you like, from as many modules as you like, each
   token one step, nothing over its max — click a source then a neighbour per
   token, or drag; confirm and it's one down. Destroying a module with the
   **1st-down icon** ends your turn and hands it to the next seat; running out
   of downs hands it to the enemy. Either way you press *End turn*.
5. **Enemy turn** — four action decks, one per down, top card face up so you
   can read its next four moves: attack, generate or reroute. *Play down* steps
   it one down at a time; its rolls come up on the dice too. A card it can't
   carry out is discarded and the next turned; a 1st down sends it back to
   Down 1. Its attacks go to the **aggressor**, the seat that attacked last.
6. **Loot** — destroyed modules are gone. After a kill one seat may abandon its
   ship and take the wreck over, keeping one old module in its scrap deck. The
   boss is taken in pieces: its surviving parts go round the table into scrap
   decks.
7. **Rebuild** — at the end of the mission, rebuild from what you fly plus the
   scrap deck (a cockpit there can be installed). *Next sector* rolls on.

Rarity checkpoints raise the ceiling and shuffle the rarer stack into the decks
(`commons_removed` optionally culls commons). Everything lands in the run
transcript on the right — rolls, hits, discarded enemy cards, 1st downs — which
is the artefact a playtest actually produces.

Everything that happens is animated rather than swapped in: cards dealt and
flown to where they land, chits popping as ⚡ comes and goes, shots crossing the
table, modules shaking and crumpling, charge streaming along a reroute, the
turn changing hands. The engine records each of these as a *table event*; the
effects layer (`components/fx`) plays them back.

## Layout

```
src/
  engine/      rules engine — plain TS, no React (see engine/README.md)
  data/        cockpits, parts, items, events, enemy actions, the boss sheet
  store/       Zustand: config (tuning) + game (the run) + ui (view state) + deck (edits)
  components/
    ds/        design-system primitives ported from Claude Design
    fx/        drag and drop, the dice overlay, the table's effects layer
    game/      module tiles, ship grids, panels, action bar, log, prompt overlay
    editor/    the deck spreadsheet, card panel, effect + art pickers
    layout/    top bar + config sidebar
  views/       Mission, Table, Ship Builder, Cards
  styles/      design tokens as CSS custom properties
```

Three boundaries hold this together:

1. **Engine never imports UI — or content.** It takes state, `GameConfig` and a
   `Content` bundle and returns new state, so the same rules can run headless
   for balance sweeps.
2. **Content lives in `src/data`.** Adding a card is a data edit — or no edit at
   all, since the deck editor writes cards at runtime. A card is a list of
   `effects` from the vocabulary in `engine/effects.ts`; anything outside it is
   marked `manual` and left to the table.
3. **Tunables live in `GameConfig`.** If a playtester might want to change a
   number — or flip an open question — it belongs there, not in engine code.

## Config sidebar

A live editor over the config store, rendered from the descriptors in
`src/store/configFields.ts`. Numbers, switches, and *selects* for the rules'
open questions with named options (ship size rule, downed player). Adding a
tunable is: add it to `GameConfig` + `DEFAULT_CONFIG`, add a descriptor, done.
Config persists to localStorage (`nomad.config.v2` — v1 saves from the old
rules aren't read, and a saved option that's since been retired falls back to
its default); `EXPORT JSON` copies it to the clipboard. A new run picks up the
current config.

## Deck editor

The **Cards** tab shows the decks two ways. *Gallery* is the deck as printed,
every element explaining itself on hover. *Spreadsheet* is the deck as an
economy: one section per deck (cockpits, parts, items, events, enemy actions),
one row per card, with the numbers a balance pass moves — copies, max ⚡, attack,
generate output, the 1st-down icon, power cost, a cockpit's slots and rating —
editable in place. Beside them, read-only, the rules' balancing line: expected
damage per shot at full charge (attack × ⚡ ÷ 6), and in the footer what one ⚡
is worth across the deck (average attack ÷ 6).

Selecting a row opens the card panel: the card face as it will print, its
effect list, its **placement limits**, and the wording. Printed text is derived
from the effects, so a card can't be retuned into contradicting itself.

Edits are saved in the browser as an **overlay** on the shipped deck — the cards
you touched, the cards you added, the ids you removed — so content added to
`src/data` later still shows up. Edits saved before v3 are migrated forward
(generation became an action, blocking became the shield role) and pick up the
new fields from the shipped card; *reset* puts the repo's deck back. `EXPORT
JSON` / `IMPORT` move a balance pass between machines. A ⚠ on a row flags a card
that would waste a playtest: a module holding no ⚡, an ability that costs more
⚡ than the module can hold, a non-generator that generates.

## Status

Playable end to end under the v3 rules: energy-token draft, grid layout and
starting energy, walk the mission, fight with the attack roll and 1st downs
against the enemy action decks, take ships over, cross rarity checkpoints,
split the boss, rebuild, next sector. Solo and up to four seats, together or
split. Every open question in the rules doc runs, most of them behind a switch.

The sweep findings below predate the grid, the token draft and the new
reroute; they're worth re-running before they're relied on.

### What a headless sweep turned up

Engine-level runs (auto-drafted ships, a simple greedy bot per seat, 10 seeds
per variant) — findings for the rules doc, not bugs:

- **`attack_spends_energy` stalls fights.** Spending the energy placed on every
  attack drains ships to 0 faster than generate can refill them, and most
  sweeps never finished a fight. The default (energy is only hit chance and HP)
  plays through.
- **Enemy action decks spend a lot of downs turning cards.** With one card of
  each action per deck, an enemy with no charged weapon discards its way through
  Attack and Reroute before anything resolves. That's the rule as written;
  worth deciding whether "can't" should be rarer.
- **Fewer seats is much harder.** In the last sweep 4 seats won 6 runs in 10,
  2 seats 2, solo 1 (10 seeds each — small, but consistent). Enemies grow by one
  module per player, but every extra seat brings four more downs before the
  enemy moves — and a 1st down skips the enemy entirely.
