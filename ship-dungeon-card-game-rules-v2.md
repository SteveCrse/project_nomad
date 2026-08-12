# [Working Title] — Rules Draft v2

## Core Loop
- Players place steps on the dungeon progression board to generate a **mission** — similar to Slay the Spire's map generation.
- Steps: **Combat**, **Loot**, **Event** (possibly blank/no-op steps too).
- The mission ends when the party reaches and defeats the boss.
- When the path branches with multiple players, the party may split up or stay together. Splitting is higher risk/reward. Solo play, this choice doesn't come up.
- Entering a step triggers its type: draw an Item card (Loot), draw an Event card (Event), or begin Combat.

## Combat — Symmetric Downs System
Players and enemies use the same structure, working for and against both sides:

1. Each side has an **HP pool** (the win condition — reduce it to 0) and a **conversion threshold** (an amount of damage, defined by the enemy's stat block, needed within one set of downs to keep attacking).
2. Each side gets 4 downs — attempts to deal damage.
3. Each offensive module can be used once per fresh set of downs.
4. Attacking: activate modules, which define attack power, targeting, energy cost, and whether the action calls for dice.
5. Downs can also be spent to charge shields, use non-offensive modules, or play cards instead of attacking.
6. **Conversion:** if a side hits the conversion threshold within its 4 downs, it gets a fresh set of downs instead of passing the turn — like a first-down conversion in football. This lets a side chain multiple "turns" together.
7. If a side doesn't hit the threshold within 4 downs, the turn passes.
8. *Open question:* should players be able to upgrade their own conversion threshold (harder for enemies to convert against them), at a cost (e.g. attack power)? Original notes suggest yes on the defensive side — confirm the design.

## Ships & Modules
- A ship is built from **parts** drawn from the Parts deck.
- Every ship starts with a **Cockpit**, which defines ship capacity (module slot count).
- To spawn an enemy ship: draw from the Parts deck, attaching parts to the current cockpit, until another Cockpit is drawn — that starts a new ship.
- Each module individually defines its own energy cost/pool, whether its actions call for dice (and what kind), and its role (offense, shield, utility, specialization like tank/DPS/luck).
- Carried-but-unequipped parts are capped — don't hoard, or you can't pick up more.

## Loot Phase
When an enemy ship is destroyed, the party chooses one:

**A — Take the whole ship.** Abandon your ship, pilot the enemy's instead. Keep 1 module from your old ship in the Scrap Deck; the rest is lost, shuffled back into the Parts deck.

**B — Take one module.** Keep your ship, take a single module from the enemy's ship into the Scrap Deck instead. It's inactive until the party reaches a rearrangement point, at which point the ship's modules can be reorganized and hoarded modules slotted in.

Shared: **Scrap Deck** is capped at 4 cards (some modules raise this cap). At the end of a mission, the party may use the Scrap Deck to help build their ship for the next mission.

> Assumption to confirm: I merged the "leftover module from abandoning a ship" and "hoarded module from Option B" into one Scrap Deck pool, since both are capped reserves spent at a rearrangement point. Flag it if you meant two separate pools.

## Progression & Checkpoints
- Certain board steps are checkpoints: crossing one adds new/rarer/more powerful cards into the decks going forward.
- *Proposed:* checkpoints double as rearrangement points for hoarded modules, in addition to the guaranteed rearrangement at end of mission. Confirm cadence.
- At the end of a mission: defeat the boss, take its ship in pieces into the next mission, assemble a new ship from collected pieces before the next boss fight.

## Multiplayer Scaling
- When spawning an enemy ship, continue drawing past the first Cockpit, adding one extra part per player beyond the first, before the ship is complete.
- Reuses the existing ship-generation mechanic instead of a bolted-on difficulty system, and scales per-fight difficulty rather than just dungeon length.

## Open Questions
1. **Board vs. no board** — doc lists both a physical branching board and a "no board, campaign built from deck" option, but Materials already assumes a physical board (needed for the split-up choice as written). Lock this in before prototyping.
2. **Threshold upgrades** — confirm whether players can raise their own conversion threshold, lower the enemy's effective threshold against them, or both, and the cost.
3. **Parts/Enemy deck vs. Items deck** — confirming: Parts deck generates enemies and becomes ship components (combat + Loot Phase + building); Items deck is loot from Loot-type steps. Worth stating plainly since "parts" and "items" are easy to conflate.

## Materials Needed for Playtest
- Parts deck, Events deck, Items deck
- 1 boss sheet
- Dungeon progression board/steps
- Item rarity checkpoint markers
- Player minis
- Dice (as called for by specific modules)
- HP / down trackers (per player and per enemy ship)
