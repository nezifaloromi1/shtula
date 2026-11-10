export type QuranAudioSource = 'local' | 'featured-google-drive';

export type QuranChapter = {
  title: string;
  startSeconds: number;
  endSeconds: number | null;
  imageUrl: string | null;
  url?: string | null;
  toc?: boolean;
};

export type QuranAudio = {
  id: string;
  sourceType: QuranAudioSource;
  sourceGuid: string | null;
  title: string;
  artist: string;
  /** Remote enclosure URL or local private-file URI. */
  uri: string;
  /** Private app-owned copy, when this remote item has been downloaded. */
  localUri: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  durationMs: number;
  lastPositionMs: number;
  isPlayed: boolean;
  addedAt: number;
  description: string | null;
  imageUrl: string | null;
  publishedAt: number | null;
  chaptersUrl: string | null;
  transcriptUrl: string | null;
  chapters: QuranChapter[];
};

export type ImportedAudioAsset = {
  uri: string;
  fileName: string;
  sizeBytes: number;
};

export function playableUri(track: QuranAudio): string {
  return track.localUri || track.uri;
}

export function isAudioDownloaded(track: QuranAudio): boolean {
  return track.sourceType === 'local' || Boolean(track.localUri);
}
