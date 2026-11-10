import type { QuranAudio } from '@/features/quran/models/QuranAudio';

/**
 * The Flutter featured collection defaults to latest-first ordering. On natural
 * completion its autoplay setting chooses the next unplayed item after the
 * current item; it does not wrap to the beginning of the collection.
 */
export function findNextUnplayedFeaturedTrack(
  currentTrack: QuranAudio,
  tracks: readonly QuranAudio[],
): QuranAudio | null {
  const ordered = tracks
    .filter((track) => track.sourceType === 'featured-google-drive')
    .map((track, index) => ({ track, index }))
    .sort((left, right) => {
      const dateDifference = (right.track.publishedAt ?? 0) - (left.track.publishedAt ?? 0);
      return dateDifference || left.index - right.index;
    })
    .map(({ track }) => track);

  const currentIndex = ordered.findIndex((track) => track.id === currentTrack.id);
  if (currentIndex < 0) return null;
  return ordered.slice(currentIndex + 1).find((track) => !track.isPlayed) ?? null;
}
