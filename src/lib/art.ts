/**
 * Card art, resolved off the PNG fronts that ship with the repo.
 *
 * Globbed at build time so a card's `art` can stay a plain filename in the
 * data files (and in an exported deck) rather than a bundler path — the deck
 * editor's picker lists whatever is in the folder.
 */
const FRONTS = import.meta.glob('../../Project N.O.M.A.D._pngs/fronts/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export interface ArtAsset {
  /** Filename as stored on a card, e.g. `042.png`. */
  file: string;
  url: string;
}

export const ART_ASSETS: ArtAsset[] = Object.entries(FRONTS)
  .map(([path, url]) => ({ file: path.split('/').pop() ?? path, url }))
  .sort((a, b) => a.file.localeCompare(b.file));

const BY_FILE: Record<string, string> = Object.fromEntries(
  ART_ASSETS.map((asset) => [asset.file, asset.url]),
);

/**
 * A card's art as something an `<img>` can load, or undefined when the card
 * names art that isn't in the folder — several cards carry `.webp` names from
 * the design bundle whose files were never imported.
 */
export function artUrl(art: string | null | undefined): string | undefined {
  if (!art) return undefined;
  if (BY_FILE[art]) return BY_FILE[art];
  if (/^(https?:|data:|blob:|\/)/.test(art)) return art;
  return undefined;
}
