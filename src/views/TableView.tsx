import { SEED_PLAYERS, SEED_TABLE } from '@data';
import { EnemyPanel } from '@/components/game/EnemyPanel';
import { PlayerPanel } from '@/components/game/PlayerPanel';
import { DeckStack, DiscardStack, LootBag } from '@/components/game/DeckStack';
import { RARITY_COLOR } from '@/lib/palette';
import { useConfig } from '@/store/configStore';

/**
 * The table: enemy ship up top, the three decks and the loot bag in the
 * middle, player seats around the edge. Seats shown follow config.playerCount.
 */
export function TableView() {
  const config = useConfig();
  const players = SEED_PLAYERS.slice(0, config.playerCount);
  const half = Math.ceil(players.length / 2);
  const topPlayers = players.slice(0, half);
  const bottomPlayers = players.slice(half);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3.5 flex flex-none justify-center">
        <EnemyPanel />
      </div>

      <div className="relative min-h-0 flex-1">
        {/* the table's edge — purely decorative */}
        <div className="absolute top-1/2 left-1/2 h-[78%] w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-putty-500 opacity-70" />

        <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3.5">
          <DeckStack
            label="LOOT"
            accent="var(--crt-green-700)"
            caption={`${SEED_TABLE.lootRemaining} LEFT`}
          />
          <DeckStack
            label={'ENCOUN­TER'}
            accent="var(--amber-500)"
            caption={`${SEED_TABLE.encounterRemaining} LEFT`}
          />
          <DeckStack
            label="ENEMY"
            accent="var(--toggle-red-500)"
            caption={`DRAW ${SEED_TABLE.enemyDraw}`}
          />
          <DiscardStack count={SEED_TABLE.discard} />
          <LootBag maxRarity={config.maxRarityNow} colors={RARITY_COLOR} />
        </div>

        <div className="absolute top-0 right-0 left-0 flex justify-between gap-5">
          {topPlayers.map((p) => (
            <PlayerPanel key={p.id} player={p} />
          ))}
        </div>

        <div className="absolute right-0 bottom-0 left-0 flex justify-between gap-5">
          {bottomPlayers.map((p) => (
            <PlayerPanel key={p.id} player={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
