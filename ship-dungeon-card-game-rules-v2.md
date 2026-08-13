# [Working Title] — Rules Draft v2

## Setup
- Before the mission, each player **drafts a ship** from the Parts deck.
- Draws go round the table **one card at a time** — the deck is shared, so draw
  order matters — until every player has taken their agreed number of draws
  (5 in the current test setup).
- The first **Cockpit** a player draws anchors their ship and sets its capacity.
  A player who draws a second one may re-anchor on it instead; a player who
  draws none takes a basic Cockpit from the box.
- When the draws are spent, players assemble: fit drafted parts into the
  cockpit's module grid (see Ships & Modules).
- Parts left unfitted go into the Scrap Deck up to its cap; the overflow is
  shuffled back into the Parts deck. Nobody hoards.
- Then the mission begins.

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
3. A module can be activated **as often as its own energy pool can pay for** — one down per activation. What rations a volley is charge, not a per-set limit. A card that should only fire once per set says so in its own text.
   - *Replaces the v2 draft rule "each offensive module can be used once per fresh set of downs": with one gun and a threshold of 12, a set could never convert.*
4. Attacking: activate modules, which define attack power, targeting, energy cost, and whether the action calls for dice.
5. Downs can also be spent to charge shields, reroute energy, use non-offensive modules, or play cards instead of attacking.
6. **Conversion:** if a side hits the conversion threshold within its 4 downs, it gets a fresh set of downs instead of passing the turn — like a first-down conversion in football. This lets a side chain multiple "turns" together.
7. If a side doesn't hit the threshold within 4 downs, the turn passes.
8. *Open question:* should players be able to upgrade their own conversion threshold (harder for enemies to convert against them), at a cost (e.g. attack power)? Original notes suggest yes on the defensive side — confirm the design.

## Ships & Modules
- A ship is built from **parts** drawn from the Parts deck.
- Every ship starts with a **Cockpit**, which defines ship capacity (module slot count).
- To spawn an enemy ship: draw from the Parts deck, attaching parts to the current cockpit, until another Cockpit is drawn — that starts a new ship.
- Each module individually defines its own energy cost/pool, whether its actions call for dice (and what kind), and its role (offense, shield, utility, specialization like tank/DPS/luck).
- Carried-but-unequipped parts are capped — don't hoard, or you can't pick up more. That reserve is the Scrap Deck (see Loot Phase); a part is either fitted to the grid or sitting in it.

### The grid
- A ship's slots are a **grid**, not a list. Where a module sits is a decision.
- **A part must be attached next to a part already on the ship** (orthogonally —
  no diagonals). A hull therefore grows outward from its cockpit, and can't be
  built as scattered islands. This applies to enemy ships too: they're built the
  same way.
- Players may **rearrange their own grid freely** — move a module to an empty
  position, or swap two — during setup and at any rearrangement point.
- Adjacency is what the layout is for: energy only moves between neighbours
  (see Energy), and unbroken **GEN → RDS → WPN** chains pay a bonus.

## Energy
- Every module has its own **pool**, and pays for its own activations out of it.
  A module with an empty pool can't fire, however much charge sits elsewhere on
  the ship.
- At the start of a side's turn the **reactor** puts out a baseline of ⚡, spread
  across the grid, and generator modules fill their own pools.
- **Weapons are outside that.** A gun never recharges on its own — it is loaded
  by rerouting charge into it. Where the generators sit relative to the guns is
  what arms the ship, which is the point of laying the grid out by hand.
- **Rerouting: one down buys a whole pass.** In that pass every module may hand
  its charge away **once**. Links resolve in the order they're made, so a
  generator can fill a redistributor that then fills a gun inside the same down.
- **⚡ only ever moves between adjacent modules.** Charge crosses a ship by being
  handed along the grid, never teleported across it. Charging a shield draws on
  its neighbours for the same reason.
- A ship carrying a **Redistributor** reroutes without spending the down.

## Loot Phase
When an enemy ship is destroyed, the party chooses one:

**A — Take the whole ship.** Abandon your ship, pilot the enemy's instead. Keep 1 module from your old ship in the Scrap Deck; the rest is lost, shuffled back into the Parts deck.

**B — Take one module.** Keep your ship, take a single module from the enemy's ship into the Scrap Deck instead. It's inactive until the party reaches a rearrangement point, at which point the ship's modules can be reorganized and hoarded modules slotted in.

Shared: **Scrap Deck** is capped at 4 cards (some modules raise this cap). It also carries whatever a player didn't fit during setup. At the end of a mission, the party may use the Scrap Deck to help build their ship for the next mission.

> Assumption to confirm: I merged the "leftover module from abandoning a ship" and "hoarded module from Option B" into one Scrap Deck pool, since both are capped reserves spent at a rearrangement point. Flag it if you meant two separate pools.

## Progression & Checkpoints
- Certain board steps are checkpoints: crossing one adds new/rarer/more powerful cards into the decks going forward.
- *Proposed:* checkpoints double as rearrangement points for hoarded modules, in addition to the guaranteed rearrangement at end of mission. Confirm cadence.
- At a rearrangement point a player may slot hoarded modules **and** move what's already fitted — the whole grid is open, subject to the attachment rule.
- At the end of a mission: defeat the boss, take its ship in pieces into the next mission, assemble a new ship from collected pieces before the next boss fight.

## Multiplayer Scaling
- When spawning an enemy ship, continue drawing past the first Cockpit, adding one extra part per player beyond the first, before the ship is complete.
- Reuses the existing ship-generation mechanic instead of a bolted-on difficulty system, and scales per-fight difficulty rather than just dungeon length.

## Open Questions
1. **Board vs. no board** — doc lists both a physical branching board and a "no board, campaign built from deck" option, but Materials already assumes a physical board (needed for the split-up choice as written). Lock this in before prototyping.
2. **Threshold upgrades** — confirm whether players can raise their own conversion threshold, lower the enemy's effective threshold against them, or both, and the cost.
3. **Parts/Enemy deck vs. Items deck** — confirming: Parts deck generates enemies and becomes ship components (combat + Loot Phase + building); Items deck is loot from Loot-type steps. Worth stating plainly since "parts" and "items" are easy to conflate.
4. **Draft size** — how many parts each player draws at setup. 5 plays as a
   sensible starting ship; it also decides how many spare cockpits turn up,
   since the Parts deck is roughly one part in five.
5. **Do ships roll out loaded?** Currently every module starts the mission with
   a full pool — a one-time load, not a recharge — so turn one isn't spent
   entirely on rerouting. Starting the guns dry is the harsher alternative.
6. **Does the attachment rule bite on removal?** A part must be attached next to
   something already fitted, but nothing stops a player moving a module out from
   under another one and leaving it stranded. Local rule, checked on placement
   only; full connectivity is the stricter version if it's wanted.

## Materials Needed for Playtest
- Parts deck, Events deck, Items deck
- 1 boss sheet
- Dungeon progression board/steps
- Item rarity checkpoint markers
- Player minis
- Dice (as called for by specific modules)
- HP / down trackers (per player and per enemy ship)
- **A ship mat per player and per enemy ship** — modules are laid out in a grid
  and adjacency decides both energy movement and chain bonuses, so parts need
  somewhere to sit in a fixed arrangement
- **⚡ tokens** — every module holds its own charge, tracked per module
