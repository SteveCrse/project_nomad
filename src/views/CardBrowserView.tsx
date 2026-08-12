import { ALL_CARDS } from '@data';
import { CardTile } from '@/components/game/CardTile';
import { RARITY_NAME } from '@/lib/palette';
import { useConfig } from '@/store/configStore';
import { useUiStore } from '@/store/uiStore';

const FILTERS = [{ label: 'ALL', value: 0 }, ...RARITY_NAME.map((n, i) => ({ label: n, value: i + 1 }))];

/** Every card in the three decks, filterable by rarity. */
export function CardBrowserView() {
  const config = useConfig();
  const rarityFilter = useUiStore((s) => s.rarityFilter);
  const setRarityFilter = useUiStore((s) => s.setRarityFilter);

  const cards = rarityFilter === 0 ? ALL_CARDS : ALL_CARDS.filter((c) => c.rarity === rarityFilter);
  const inBag = cards.filter((c) => c.rarity <= config.maxRarityNow).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3.5 flex items-center gap-3.5">
        <div className="font-display text-[20px] font-bold">CARD BROWSER</div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => {
            const active = rarityFilter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setRarityFilter(f.value)}
                className={[
                  'cursor-pointer border px-2.5 py-[5px] font-mono text-[11px] tracking-[0.08em] whitespace-nowrap',
                  active
                    ? 'border-n-900 bg-n-900 text-cream-100'
                    : 'border-putty-500 bg-putty-100 text-putty-700 hover:border-n-900',
                ].join(' ')}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto font-mono text-[12px] text-putty-700">
          {cards.length} OF {ALL_CARDS.length} CARDS · {inBag} IN BAG AT TIER {config.maxRarityNow}
        </div>
      </div>

      <div className="flex flex-1 flex-wrap content-start gap-4 overflow-auto pb-2">
        {cards.map((card) => (
          <CardTile key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
