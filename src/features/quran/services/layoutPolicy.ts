import type { QuranAudio } from '../models/QuranAudio';

export type QuranLayoutMode = 0 | 1 | 2;
export type QuranLayoutOrder = 'alphabetical' | 'followed' | 'unplayed' | 'episodes';

export function normalizeLayoutMode(value: number, fallback: QuranLayoutMode = 0): QuranLayoutMode {
  return value === 0 || value === 1 || value === 2 ? value : fallback;
}

export function normalizeLayoutOrder(value: string, fallback: QuranLayoutOrder = 'alphabetical'): QuranLayoutOrder {
  return value === 'alphabetical' || value === 'followed' || value === 'unplayed' || value === 'episodes'
    ? value
    : fallback;
}

export function sortQuranTracks(
  tracks: readonly QuranAudio[],
  order: QuranLayoutOrder,
): QuranAudio[] {
  const sorted = [...tracks];
  const byTitle = (left: QuranAudio, right: QuranAudio) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  const publishedAt = (track: QuranAudio) => track.publishedAt ?? track.addedAt ?? 0;

  switch (order) {
    case 'followed':
      // For the single built-in collection, addedAt is the persisted date the
      // feed item entered the local catalogue; most recently added appears first.
      sorted.sort((left, right) => right.addedAt - left.addedAt || byTitle(left, right));
      break;
    case 'unplayed':
      sorted.sort((left, right) => Number(left.isPlayed) - Number(right.isPlayed)
        || publishedAt(right) - publishedAt(left)
        || byTitle(left, right));
      break;
    case 'episodes':
      sorted.sort((left, right) => publishedAt(right) - publishedAt(left) || byTitle(left, right));
      break;
    case 'alphabetical':
    default:
      sorted.sort(byTitle);
      break;
  }
  return sorted;
}

export function findNewFeedIds(
  previouslyCachedIds: ReadonlySet<string>,
  incomingTracks: readonly QuranAudio[],
): string[] {
  // Don't mark every item as new on first install. Highlight only items first
  // discovered after there is an existing feed cache to compare against.
  if (previouslyCachedIds.size === 0) return [];
  return incomingTracks
    .filter((track) => track.sourceType === 'featured-google-drive' && !previouslyCachedIds.has(track.id))
    .map((track) => track.id);
}
