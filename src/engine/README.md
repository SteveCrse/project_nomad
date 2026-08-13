# Engine

The rules engine for Project N.O.M.A.D. Plain TypeScript — **no React, no
Zustand, no DOM**. The UI reads `GameConfig` out of the Zustand store and
passes it in; the engine never reaches back.

That boundary is the point: the same code should be runnable headless for
balance sweeps (roll 10k combats across a range of `convThreshold` values)
without dragging a renderer along.

## Layout

| Path         | Holds                                                                 |
| ------------ | --------------------------------------------------------------------- |
| `types/`     | The data model — cards, ships, enemies, players, combat, board, config |
| `content.ts` | The injected card/enemy bundle. The engine never imports `src/data`    |
| `combat/`    | Symmetric downs system: downs, conversion, damage, shields             |
| `deck/`      | Deck building, shuffling, drawing, checkpoint rarity gates             |
| `ship/`      | Ship assembly, enemy spawning, upkeep, energy rerouting, adjacency     |
| `loot/`      | Loot phase A/B, scrap deck, rearrangement, threshold upgrades          |
| `board/`     | Mission generation, movement, party splits                            |
| `ai/`        | Enemy decision-making, so one side of the table can play itself        |
| `game/`      | Run orchestration: the piece that makes a whole round playable         |
| `rng.ts`     | Seeded RNG so a playtest run is reproducible                           |

## How a round runs

`game.newRun` builds the three decks, the party's ships and a mission, then
every step is a pure `(state, …) → state` call:

```
newRun → drawStartingPart* → assemblePart* → startMission
       → moveTo ─┬─ combat  → takeDown* → endTurn → enemyStep* → resolveLoot
                 ├─ event   → resolveEvent
                 ├─ loot    → claimReward
                 └─ checkpoint → applyRearrange* → closePrompt
```

The run opens in `setup`: each seat draws `config.startingPartsDraws` parts off
the shared Parts deck one card at a time (`game.nextDrafter` says whose draw it
is, round the table), fits them, and `startMission` puts the party on the board.
The first cockpit a seat draws re-anchors its hull, since capacity is the
cockpit's, and parts left over ride along in the Scrap Deck so a rearrangement
point can still spend them. `startingPartsDraws: 0` skips the draft and rolls
the authored loadouts in `data/ships.ts` out instead.

`game.takeDown` is the single entry point for spending a down; it asks
`combat.actionError` first, so an illegal action comes back as a reason string
instead of a corrupted state. The store never mutates game state itself.

## Combat model

- Threshold is a **defensive** stat. The attacker has to deal the *defender's*
  threshold within one set of downs to convert. That's what makes rules open
  question #2 (buying a higher own-threshold, paid for in attack power)
  mechanically real — see `loot.buyThresholdUpgrade`.
- A side's threshold each set is the softest living opponent's, recomputed
  when the set opens.
- Damage order: negation → flat reduction (Shock Absorber) → charged shields →
  hull. `config.thresholdCountsShielded` decides whether shielded damage still
  counts toward conversion.
- A module fires as often as its own pool can pay for — one down per shot. A
  card printed `oncePerSet` is capped at one, and `offensiveOncePerSet` puts
  every gun back under that cap for comparison. What actually rations a volley
  is charge and downs, not a per-set flag.
- Energy: `config.energyPerTurn` is spread across the grid at upkeep (actives
  first), generator modules top up their own pools, and a ship carrying a
  redistributor can reroute without spending a down and feed a module from
  loose ⚡. **Weapons are outside the upkeep spread** unless
  `weaponsDrawFromReactor` is on — a gun is loaded by rerouting into it.

## The grid is the rules surface

Slots are a `gridCols`-wide grid, and `ship.neighbourSlots` is the one piece of
geometry every adjacency rule reads:

- **Attaching.** A part has to touch something already fitted (`canAttachAt`),
  so a hull grows outward from its cockpit — enemy ships included.
- **Rerouting.** ⚡ only ever moves between neighbours. One down buys a whole
  pass: every module may be drained once, and the legs resolve in order, so a
  generator can fill a redistributor that then fills a gun inside one down.
- **Charging a shield** draws on the player's loose pool and on *adjacent*
  generators, for the same reason.
- **Chains.** `findAdjacencyBonuses` reads GEN→RDS→WPN off the same geometry.

## Card behaviour

Cards carry structured fields (`energyCost`, `power`, `dice`, `effect`,
`generates`, `damageReduction`, …) that the engine resolves. The effect
vocabulary is deliberately small; anything outside it is
`effect: { kind: 'manual' }`, which still spends the down and the energy but
leaves the payload to the table. A knowingly-manual card beats a
silently-wrong one.

## Conventions

- **Pure functions.** Take state + config, return new state. No mutation of
  inputs, no module-level mutable state (the seeded `Rng` is the one exception,
  and it tracks its own draw count so a run can be replayed).
- **No tuning literals.** Anything a playtester might want to change belongs in
  `GameConfig` (`types/config.ts`), not in a function body.
- **Content lives in `src/data`,** not here. Adding a card or an enemy must
  never require an engine edit — content arrives as a `Content` parameter.
