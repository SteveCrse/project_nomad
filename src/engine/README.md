# Engine

The rules engine for Project N.O.M.A.D. Plain TypeScript — **no React, no
Zustand, no DOM**. The UI reads `GameConfig` out of the Zustand store and
passes it in; the engine never reaches back.

That boundary is the point: the same code runs headless for balance sweeps
(roll a thousand fights across a range of `startEnergy` values) without
dragging a renderer along.

The rules are `ship-dungeon-card-game-rules-v3.md` at the repo root. Where they
leave a gap, the doc's *Open Questions* section says how the engine fills it.

## Layout

| Path         | Holds                                                                 |
| ------------ | --------------------------------------------------------------------- |
| `types/`     | The data model — cards, ships, enemies, players, combat, board, config |
| `effects.ts` | The effect catalogue: what a card can be assembled from                |
| `cards.ts`   | Compiling a card's effects, the text it prints, the balancing helpers  |
| `content.ts` | The injected card/boss bundle. The engine never imports `src/data`     |
| `combat/`    | Downs, the attack roll, hits, 1st downs, the enemy's action decks. `index.ts` is a barrel over `sides` (accessors, state writes), `legality`, `strike`, `resolve` (`resolveDown`), `turns`, `enemy` |
| `deck/`      | Decks, shuffling, drawing, rarity checkpoints, action decks            |
| `ship/`      | The grid, layout rules, rerouting, size rules, hits, enemy spawning. Barrel over `build`, `layout`, `size`, `damage`, `spawn`, plus `module`, `reroute` |
| `loot/`      | Ship takeover, boss salvage, the scrap deck, rebuilding                |
| `board/`     | Mission generation, movement, party splits                             |
| `ai/`        | What each enemy action card turns into; the draft auto-pick            |
| `game/`      | Run orchestration: the draft (`draft.ts`) and everything after it — `setup`, `nodes`, `flow` (`continueRun`, fights), `rewards`, `salvage` |
| `rng.ts`     | Seeded RNG so a playtest run is reproducible                           |

## How a run runs

Every step is a pure `(state, …) → state` call:

```
newRun → draftCard* / passDraft* → assemblePart* / moveModule* / placeEnergy* → startMission
       → moveTo ─┬─ combat  → takeDown* → endTurn → enemyStep* → resolveLoot | salvage*
                 ├─ event   → resolveEvent
                 ├─ loot    → claimReward
                 └─ checkpoint → closePrompt
       → (boss) salvage* → fitFromScrap* / stowToScrap* / moveModule* → closePrompt → nextMission
```

`game.continueRun` is where every step ends: it resolves the next occupied step
that hasn't been triggered yet — a split party's steps one after another — or
hands control back to the map.

## Ships

A ship is a **grid**: every `ShipSlot` carries an `x`/`y`, the cockpit sits at
(0, 0), and lower `y` is the front — everything above the cockpit, for a
player; an enemy is the same grid drawn flipped. `slots` is in no order, and a
`SlotIndex` stays put for the length of a fight. Four rules decide where a
module may sit, all read by `ship.layoutErrors`:

1. every module is attached — it touches the cockpit, or a module that does;
2. weapons sit beside or behind the cockpit, never in front of it;
3. nothing sits in front of a shield (same column, further forward);
4. whatever `placement` limits the card prints (`not-in-front-of`, `not-behind`,
   `next-to`, `not-next-to` a role).

Every edit is checked against the whole grid (`canPlaceAt`, `canMoveTo` — a
move onto another module swaps them) and may not break anything that wasn't
already broken (`editAllowed`). Anything placed without a chosen cell goes to
`bestCell`: guns beside the cockpit, shields over what's worth covering, the
rest touching what it feeds.

**Size**: the draft limits a ship — its rounds and tokens. `config.shipSizeRule`
can cap it on top: `slots` counts modules against the cockpit's `slots`;
`budget` sums each module's `powerCostOf` (1–3, from rarity unless printed —
also its price in tokens) against `powerRating`.

## Combat model

- **Energy is hit chance and HP.** An attack rolls a d6 against the ⚡ on the
  module firing it; at or under hits. A hit takes `max(1, attack)` ⚡ off the
  module it lands on (`ship.hitSlot`), never spilling past it. At 0 a module is
  offline — it can't attack, generate or be used — and the next hit destroys
  it. Destroying the cockpit destroys the ship.
- **Targeting.** A shield covers its column: nothing behind it can be reached
  while it stands (`exposedSlots`), and a column with no shield is open all the
  way back. A `damage-module` effect ignores the shields. The enemy always aims
  for the cockpit — the shield in front of it first — of the **aggressor**, the
  seat that attacked last (`aggroTarget`).
- **Downs.** `generate` puts the producer's output on the producer; `reroute`
  plays a list of moves between modules that touch (`ship/reroute.ts`): every
  token one step at most, no module ever over its max, the whole list one down
  (into a shield, it's *charging* it); `use-module` fires a module's other
  abilities; `play-card` plays an item, whose attacks land without a roll.
  An `attack` spends the ⚡ the seat picks (`spend`, within `spendRange`: the
  module's `minSpend`/`maxSpend`) and rolls d6 ≤ the spend; it's gone either
  way. A cockpit may generate at 0⚡.
- **1st downs.** `combat.playerDown` ends the turn when a 1st-down module is
  destroyed or the downs run out (`turnOver`), and the turn waits there:
  `endPlayerTurn` hands it to the next seat after a 1st down, to the enemy
  otherwise.
  `combat.enemyDown` is one step: it plays the face-up card of the current down's
  deck — the planner in `ai/` turns it into an action, or says why it can't, in
  which case it goes to the bottom of that deck, the next card is turned, and the
  enemy stays on that down for the next step (`combat.turned` counts them; once
  every card has been turned the down is lost). A played card spends the down,
  goes back to Down 1 on a 1st down, and after the last down hands the turn to
  the seat after the one that failed.

## Table events

Every step also records what happened as `TableEvent`s — each die rolled (with
what it needed and what it meant), each hit, each ⚡ charged, drained or
rerouted, each enemy card played or discarded, each change of turn — on
`combat.events`, folded into the run's numbered `events`. The log says it in
words; the events say it in a shape the UI can animate, and the store holds
back any step that rolled until its dice have been shown.

## Card behaviour

A card is a **list of effects**, each with its own numbers:

```ts
effects: [
  { type: 'damage', params: { power: 5 } },
  { type: 'drain', params: { amount: 1 } },   // the Infested Railgun, both halves
]
```

`effects.ts` is the catalogue — label, timing, tunable params, printed-text
fragment — and `cards.ts` compiles a card's list into the flat fields the rest
of the engine reads (`power`, `output`, `targetsModule`, an event's `damage`…).
Those flat fields are **derived**: don't author them.

Role carries rules of its own: a shield blocks by being a shield, and only
cockpits and generators may produce ⚡ (`cardWarnings` flags anything else that
does). A cockpit prints its attack, output, slots and rating rather than
carrying effects.

The vocabulary is deliberately small. Anything outside it is `manual` (active)
or `reminder` (passive): the tool still spends the down, prints the effect's
wording, and leaves the payload to the table.

**Printed text is derived, not authored.** `printedLines` builds a card's rules
text from its effects and placement limits every time, each line tagged with
when it happens (ACT / PAS / EVT / LAY, and ENM for an enemy action card).

## Conventions

- **Pure functions.** Take state + config, return new state. No mutation of
  inputs, no module-level mutable state (the seeded `Rng` is the one exception,
  and it tracks its own draw count so a run can be replayed).
- **No tuning literals.** Anything a playtester might want to change belongs in
  `GameConfig` (`types/config.ts`), not in a function body. The d6 is the one
  constant (`HIT_DIE`): the rules' balancing maths is built on it.
- **Content lives in `src/data`,** not here. Adding a card or a boss must never
  require an engine edit — content arrives as a `Content` parameter.
