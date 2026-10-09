/**
 * How ship size is limited. The draft decides most of it now — a seat spends
 * energy tokens over a fixed number of rounds — and the two other options the
 * rules listed can cap a ship on top of that.
 *
 *   draft  — only the draft's rounds and tokens limit a ship (the decision)
 *   slots  — the cockpit also prints a max number of modules
 *   budget — modules also draw upkeep from the cockpit's rating; checked on the built ship
 */
export type ShipSizeRule = 'draft' | 'slots' | 'budget';

/**
 * What a seat does once its cockpit is destroyed — open in the rules.
 *
 *   out    — sits out the rest of the mission, rebuilds at its end
 *   revive — a teammate may spend a down to restore the cockpit with 1⚡
 */
export type DownedRule = 'out' | 'revive';

/**
 * What happens to a seat that went down once its fight is won.
 *
 *   revive     — back in with 0⚡ on every module
 *   enemy-ship — takes the beaten enemy's ship over (regular fights; a boss
 *                ends the mission, and everyone rebuilds there anyway)
 *   stay       — stays down until something revives it (tbd: an event card,
 *                a special step); the mission-end rebuild still applies
 */
export type DownedAfterWinRule = 'revive' | 'enemy-ship' | 'stay';

/**
 * Every tunable knob for a playtest run. This is the contract between the
 * config sidebar (which writes it) and the engine (which reads it) — nothing
 * in the rules that we expect to tune should be a literal in engine code.
 */
export interface GameConfig {
  // ---- party ----
  /** Seats at the table, 1-4. */
  playerCount: number;
  /** Downs per turn, both sides. Rules: 4 — and the enemy gets one action deck per down. */
  downCount: number;
  /** Snake-draft the starting ships. Off rolls the authored loadouts out instead. */
  draft: boolean;
  /** Energy tokens every seat drafts with. Whatever isn't spent is its starting ⚡. */
  draftTokens: number;
  /** Module rounds in the draft, after the cockpit round. */
  draftRounds: number;
  /** ⚡ on every module of a drafted ship before the leftover tokens go on. */
  draftStartEnergy: number;
  /** How a ship's size is limited on top of the draft. */
  shipSizeRule: ShipSizeRule;

  // ---- energy & combat ----
  /**
   * ⚡ a module comes into play with outside the draft: every enemy module,
   * an authored loadout, a cockpit brought back by a takeover or a rebuild, a
   * part fitted from the scrap deck. Rules: 1.
   */
  startEnergy: number;
  /** Enemy modules per step of mission depth. Rules: depth + players. */
  enemyModulesPerDepth: number;
  /** Enemy modules per player in the fight. */
  enemyModulesPerPlayer: number;
  /** Hold enemy ships to the same size limit as the players' ships. */
  enemySizeCapped: boolean;
  /** Open question: what a seat does after its cockpit is destroyed. */
  downedPlayer: DownedRule;
  /** What a downed seat gets back when its fight is won. */
  downedAfterWin: DownedAfterWinRule;
  /** `downedAfterWin: revive` — modules destroyed in the fight are lost, rather than coming back at 0⚡. */
  reviveLosesDestroyed: boolean;

  // ---- loot ----
  /** Scrap deck cap. Rules: 4; some modules raise it. */
  scrapCap: number;
  /** Item cards held in hand. */
  handSize: number;
  /** Item cards drawn per Loot step. */
  lootPerNode: number;
  /** From the ideas list: a kill may also pay out one surviving module instead of the ship. */
  lootOneModule: boolean;

  // ---- board / rarity ----
  /** Columns on the generated map, start and boss included. */
  missionLength: number;
  /** Widest a column of the map may get — the ceiling on branching. */
  maxBranches: number;
  /** A rarity checkpoint every N steps. */
  checkpointEvery: number;
  /** Not in the rules: let checkpoints double as rearrangement points too. */
  checkpointsAreRearrangePoints: boolean;
  /** Rarity ceiling at the start of a run. Rules: commons only. */
  maxRarityNow: number;
  /** Rarity ceiling gained at each checkpoint. */
  rarityPerCheckpoint: number;
  /** Commons taken out of the parts deck at each checkpoint ("optionally"). */
  commonsRemovedPerCheckpoint: number;
}

/** Defaults taken from the rules doc. */
export const DEFAULT_CONFIG: GameConfig = {
  playerCount: 4,
  downCount: 4,
  draft: true,
  draftTokens: 10,
  draftRounds: 3,
  draftStartEnergy: 0,
  shipSizeRule: 'draft',

  startEnergy: 1,
  enemyModulesPerDepth: 1,
  enemyModulesPerPlayer: 1,
  enemySizeCapped: false,
  downedPlayer: 'out',
  downedAfterWin: 'stay',
  reviveLosesDestroyed: true,

  scrapCap: 4,
  handSize: 3,
  lootPerNode: 1,
  lootOneModule: false,

  missionLength: 10,
  maxBranches: 3,
  checkpointEvery: 4,
  checkpointsAreRearrangePoints: false,
  maxRarityNow: 1,
  rarityPerCheckpoint: 1,
  commonsRemovedPerCheckpoint: 0,
};

/** Modules an enemy spawns with: mission depth + players, as tuned. */
export function enemyModuleCount(config: GameConfig, depth: number, players: number): number {
  return Math.max(
    0,
    Math.round(config.enemyModulesPerDepth * depth + config.enemyModulesPerPlayer * players),
  );
}
