# [Working Title] — Rules Draft v3

Revamped after the October design session. Replaces v2 (threshold conversion,
HP-less shield pools) wholesale. A follow-up round of decisions — the ship
grid, the energy-token draft, rerouting between connected modules, three enemy
actions — is folded in below.

## Core Loop
Players fly through a procedurally built mission, fight enemy ships made from
the parts deck, salvage what survives and beat the boss at the end.

- Dungeons are called **missions**.
- Players place steps on the mission step board to build the route, similar to
  Slay the Spire. Steps are **Combat**, **Loot** or **Event** (possibly empty).
- Entering a step: draw from the item deck (Loot), draw from the event deck
  (Event), or start combat.
- Players must reach the end of the mission to fight its boss.
- When the path splits, players decide to stay together or split up: higher
  risk, higher reward. Solo players simply choose a path.

## Ships & Layout
Every ship is a cockpit plus modules, laid out on a **grid** around the
cockpit; the same rules apply to players and enemies.

- **Front and back.** For players, the front of the ship is everything above
  the cockpit, the back everything below it; the cockpit's own row is its
  sides. For enemies it's flipped: their front faces the players.
- Cockpits have higher base energy and attack than regular modules.
- A cockpit can always attack and generate, so a player is never left without
  an action. A cockpit with no energy on it can still generate.
- **Weapons** may not be placed in front of the cockpit — only to its sides or
  rear.
- **Shields** may be placed in front of the cockpit, or in front of weapons or
  other modules. **Nothing may be placed in front of a shield.** Attacks hit a
  shield first; only when it is destroyed does damage reach what is behind it.
- Modules have **placement limits** printed on the card, e.g. no shield in front
  of another shield.
- Some modules are marked with a **1st-down icon** (e.g. shields): destroying one
  earns a 1st down.
- Cards facilitate specialisation: tank, high DPS, luck, etc.

## Player Setup (Draft)
Players build their starting ships by snake-drafting from open cards, paying
for them with energy tokens.

1. **Energy tokens:** every player starts the draft with **10 energy tokens**
   (tunable).
2. **Cockpit round:** reveal player count + 1 cockpit cards. Players pick one
   each in turn order.
3. **Module rounds:** the draft goes **3 rounds** (tunable). Each round reveals
   player count + 1 module cards; players spend energy tokens to draft them
   (cost 1–3, rarer = more expensive).
4. **Snake draft:** pick order reverses every round (1→4, then 4→1, then 1→4, …).
5. Arrange each ship using the layout rules.
6. **Starting energy:** however many energy tokens a player did not spend
   during the draft, they distribute to their modules as they please, as their
   starting energy. Every module may also start with additional energy (tunable,
   0 for now).

## Ship Size Limit
Decided: the draft limits a ship — its rounds, and the tokens a player is
willing to trade away from starting energy. The other two options stay in the
test tool as switches on top of that:

- **Slot limit:** the cockpit lists a max number of modules.
- **Energy budget:** modules draw upkeep from the cockpit's capacity.

## Energy & Attack Roll
Energy is both a module's **hit chance** and its **HP**.

- Energy is produced only by the cockpit or generator modules. A generate
  action adds the producer's output to the producer's module.
- A player's modules start with the energy placed on them after the draft (see
  Player Setup); every enemy module starts with 1 energy.
- Each module has a maximum energy it can hold printed on its card.
- Common weapons hold a lot of energy but deal low damage; rare weapons hold
  little energy but deal high damage.
- Unused energy carries over between rounds.
- **Attack roll:** the attacker chooses how many energy tokens to spend from
  the attacking module, then rolls a d6; the attack hits if the roll is ≤ the
  tokens spent. 1 energy hits 1 in 6, 3 hits half the time, 6 always hits. The
  spent tokens are removed from the module, hit or miss.
- A module may print a minimum and/or maximum spend per attack. Attacks have no
  other energy cost.
- **Taking hits:** each hit removes at least 1 energy from the target module,
  depending on the attack strength. At 0 energy, one more hit destroys it.

## Enemy Setup
Enemy ships grow with mission depth and player count.

1. Draw 1 card from the cockpit deck.
2. Draw modules from the parts deck: number of modules = mission depth + number
   of players.
3. Arrange the ship using the layout rules.
4. Each module starts with 1 energy.
5. Shuffle the 4 enemy action decks (see Enemy Combat).

## Player Combat
Each player gets 4 downs to reach a 1st down; success passes the turn to the
next player, failure hands it to the enemy.

1. The active player has 4 downs (4 actions).
2. In each down, energy can power only one module.
3. Actions: attack, generate energy, reroute energy (charging shields is a
   reroute into a shield), use another module, or play a card.
4. **1st down:** destroy a module with the 1st-down icon (e.g. a shield).
5. 1st down reached → the next player takes their turn.
6. No 1st down within 4 downs → enemy turn.
7. A player ends their turn themselves; it never just flips over to the next
   player.

**Rerouting:** energy may only be rerouted from a module to a connected one. In
one reroute action a player may reroute as much energy as they want, from as
many modules as they want, with two caveats:

- Any energy token may only be rerouted one module deep per reroute action.
- A module may never be overloaded (exceed its max capacity) while rerouting.

**Dice:** rolling is a visible player action. Every roll's outcome is shown
before its effect is applied (e.g. "Rolled a 3 — No hit!").

**EMP card:** drains a target module to 0 energy without destroying it. It stays
offline until recharged and can still be looted.

## Enemy Combat
The enemy plays its turn through 4 action decks, one per down, and follows the
same 1st-down rule as the players.

1. **4 action decks:** one deck per down (Down 1–4). Each deck contains every
   possible enemy action — for now only **attack, generate and reroute** (no
   special cards). The top card of each deck lies face up, so players always see
   the enemy's next 4 actions.
2. **Resolving a down:** resolve the face-up card of the current down's deck. If
   the enemy can't carry out the action (e.g. no energy to attack or reroute),
   move it to the bottom of that deck and reveal the next card, until an
   action can be resolved. Afterwards, flip the next card of that deck face up.
3. Move on to the next down's deck.
4. **1st down:** if the enemy destroys a 1st-down target, it starts again at
   Down 1.
5. After Down 4 without a 1st down, it's the next player's turn.
6. **Targeting:** attacks go to the **aggressor**, the player who attacked last.
   The enemy hits the cockpit, or whatever stands in front of it and must be
   destroyed first.
7. The enemy reroutes by the same rules as the players.

Tactic this enables: a tank player can attack last on purpose to pull aggro.

## Loot & Progression
Only what survives can be salvaged, and the deck gets rarer as the mission goes
on.

- Destroyed enemy modules are gone: no loot. Players choose between winning
  fast and winning clean (EMP helps here).
- After a kill, players may abandon their ship and take over the enemy ship.
  They keep one module from the old ship in their scrap deck; the rest is
  shuffled back into the parts deck.
- Scrap deck holds 4 cards (some modules extend this). Don't hoard, or you
  can't pick up more.
- At the end of a mission, build a new ship from the scrap deck.
- Kill the boss and take his ship, in pieces, for the next mission.
- **Rising rarity:** the parts deck starts with common cards. At each rarity
  checkpoint on the board, shuffle in a stack of rarer cards (optionally remove
  some commons).

## Balancing
One energy is worth the average module attack divided by 6, because hit
chance = energy ÷ 6.

$$
\text{Expected damage} = \text{attack} \times \frac{\text{energy}}{6}
$$

- Example: average attack 3 → 1 energy ≈ 0.5 damage.
- Use it to price generators, tune shield capacity, and check that a 1st-down
  target can be drained in 3–4 downs.

## Lose Condition (TBD)
The team loses when every player's cockpit is destroyed. Still open: what a
single downed player does in the meantime.

Ideas for a downed player:

- **Escape pod:** keeps 1 action per round, e.g. repair or transfer energy to a
  teammate.
- **Rebuild:** out for this fight, then builds a new ship from their scrap deck
  at the next step.
- **Revive:** a teammate spends a down to restore the cockpit with 1 energy.

## Ideas
- Campaign built from decks instead of a board (enemies, events, parts).
- Inspirations: 5 Minute Dungeon, Dorfromantik, Marvel Champions.
- Option when defeating an enemy: take the whole ship now, or one piece for the
  boss fight.
- Damaged looted ships come with broken modules that need repair.
- Overcharge: exceed a module's cap for a bonus, at the risk of breaking it.

## Test Materials
- Decks: parts, cockpits, events, items, enemy actions
- 1 boss sheet
- Mission progression steps
- Rarity checkpoint markers
- Player minis
- Energy markers
- Dice (d6)

---

## Open Questions — how the test tool reads them

The rules above are the authority. Where they leave a gap the tool still has to
resolve something, so each gap below says what the tool does today and, where
it was cheap, which config switch flips it. None of these are decisions — they
are the questions the next design session should close.

**Energy**

1. **How much does an attack spend?** Whatever the seat picks: at least the
   module's minimum (1 if it prints none), at most its maximum and what it
   holds. A module that can't meet its minimum can't fire.
2. **How is a reroute played?** As a list of moves, each from a module into
   one it touches, played in order — every move is checked against the two
   caveats as it's played, so order matters: a full module can pass its own
   energy on and then take some in, not the other way round. "One module deep"
   is read as: energy a module received during this reroute stays there; only
   what it held when the reroute began can move on. The whole reroute is one
   down.
3. **What does a hit remove?** Energy equal to its attack strength, never less
   than 1. A hit never spills into the module behind.
4. **What does 0 energy mean?** Offline, for every module: it can't attack,
   generate or be used — except that a cockpit can still generate.
   A cockpit whose card prints no attack or output fires and generates for 1. It still blocks
   (a shield) and can still be recharged by a reroute. One more hit destroys it.
5. **Starting energy outside the draft.** The draft decides a player's
   starting energy; everything else that comes into play — every enemy module,
   a ship flown on an authored loadout (draft off), a taken-over cockpit, a
   cockpit brought back at a rebuild, a module fitted from the scrap deck —
   comes in with `start_energy` (1). Leftover tokens may go on the cockpit too;
   tokens left unplaced when the mission starts are lost. "Higher base energy"
   on a cockpit is read as a higher printed maximum.
6. **Can energy go above 6?** Yes, up to the printed maximum: past 6 it still
   hits every time, and the rest is HP.

**Combat**

7. **Who can be targeted?** Only shields block, and a shield covers its own
   column: what sits behind it in that column is out of reach until it's
   destroyed; a column with no shield is open all the way back. A player may
   aim at any module not behind a living shield; the enemy always aims for the
   cockpit and hits the shield in front of it on the way.
8. **When does a 1st down pass the turn?** Immediately: the downs left in that
   turn are forfeit, and the turn waits for the seat to end it. Solo, "the next
   player" is the same seat with 4 fresh downs.
9. **Aggressor before anyone has attacked:** the seat whose turn handed the
   enemy its turn. Misses count as attacking.
10. **Enemy choices the action card doesn't make.** Attack: the module with the
    best attack × energy ÷ 6, spending all it may. Generate: the producer that
    gains the most. Reroute: out of generators (else the cockpit) into every
    weapon they touch, hardest-hitting first, then into the shields they touch,
    leaving 1 energy behind — unless that leaves nothing to move, then a
    generator gives its last token too (the cockpit always keeps 1). The enemy never uses module abilities.
11. **Items have no energy to roll against,** so an item's attack hits
    automatically.

**Ships & loot**

12. **Ship size** — `ship_size_rule`: *draft* (the decision, default) leaves
    the draft as the only limit; *slots* also caps a ship at its cockpit's slot
    count; *budget* also caps the total cost of its modules at the cockpit's
    *power rating*. A module's cost (1–3, from rarity unless the card prints
    one) is both its price in energy tokens and its upkeep under a budget.
13. **The draft's details.** "3 rounds" are module rounds, after the cockpit
    round; cockpits are free. Each round deals the seats still drafting + 1 —
    a seat drops out once it has no tokens left (or, under *slots*, a full
    ship). On its turn a seat buys one card or passes; passing keeps its tokens.
    A seat that can't afford anything on the table passes automatically.
14. **Enemy size vs. the cockpit.** The enemy recipe (depth + players) wins by
    default; `enemy_size_capped` holds enemies to the same size limit as
    players. Mission depth is the step's column on the board.
15. **Taking a ship over.** Its destroyed cockpit comes back online with start
    energy; surviving modules keep their energy; destroyed ones are gone (they
    go to the parts discard).
16. **The boss "in pieces".** Its surviving parts are dealt round the table into
    scrap decks, cap and all; whatever nobody takes leaves the game.
17. **When can a ship be rearranged?** At setup and at the end of a mission.
    `checkpoint_rearrange` adds checkpoints.
18. **Downed players** sit out the rest of the mission and rebuild at its end
    (`downed_player: out`). `revive` lets a teammate spend a down to restore
    the cockpit with 1 energy. Escape pod and rebuild-next-step are not modelled.
19. **Rising rarity** gates every deck except the enemy action decks.
    `commons_removed` takes that many commons out of the parts deck at each
    checkpoint.
20. **Enemy action decks** hold one card of each action — attack, generate,
    reroute. The deck editor sets the copies. A card the enemy plays is
    discarded; the discards are shuffled back in when a deck runs dry. A saved custom card for a retired
    action (shield becomes reroute; special is dropped) is migrated.

**Layout grid**

21. **What "in front of" means on a grid.** For the cockpit, the doc's own
    words: everything in the rows above it. Between modules, it's the same
    column, further forward — a shield is in front of what it covers.
    *Placement limits* read the same way; *next to* means one of the four cells
    touching it.
22. **Every module is attached.** A module has to touch the cockpit, or a
    module that does, side to side — diagonals don't count. That's also what
    "connected" means for a reroute. A module shot out mid-mission can leave
    others unattached; they stay where they are, and the next rebuild may not
    make things worse but needn't fix it.
23. **Where the arranger puts things** (enemies, the boss, a draft hold): guns
    beside the cockpit, shields over what's worth covering — the cockpit first —
    then generators touching what they feed, everything else behind.
