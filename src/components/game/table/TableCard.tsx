import type { CardId } from '@engine/types';
import { getCard } from '@data';
import { CardTile } from '@/components/game/CardTile';

/**
 * A card lying on the table (or held in a hand): the printed card, at the
 * table's scale.
 *
 * There is one drawing of a card, `CardTile`. The table doesn't redraw it
 * smaller; it lays that same card down and looks at it from further away, so
 * this is only the card's footprint, what the screen marks on it (a selection,
 * a target, a drop), and the markers sitting on its sockets.
 */
export function TableCard({
  cardId,
  cls = '',
  energy,
  marker,
  ...rest
}: {
  cardId: CardId;
  cls?: string;
  energy?: number;
  marker?: (i: number) => React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>) {
  const card = getCard(cardId);
  if (!card) return <div className="tt-guide" style={rest.style} />;
  return (
    <div {...rest} className={`tt-card ${cls}`} data-peek={cardId}>
      <div className="tt-card-face">
        <CardTile card={card} energy={energy} marker={marker} />
      </div>
    </div>
  );
}
