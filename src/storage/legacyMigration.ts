import * as SQLite from 'expo-sqlite';
import type { QuranAudio, QuranChapter } from '@/features/quran/models/QuranAudio';
import { featuredQuranAudioId } from '@/features/quran/services/featuredQuranFeed';
import { getDatabase } from './database';

const EXPORT_FORMAT = 'sheademtula-legacy-export';
const EXPORT_VERSION = 1;
const FEATURED_COLLECTION_GUID = 'sheikh-aadam-tuulaa';

type LegacyRecord = { key: number; value: Record<string, unknown> };
type ImportedEpisode = {
  oldGuid: string;
  id: string;
  sourceType: 'local' | 'featured-google-drive';
  sourceGuid: string | null;
  title: string;
  artist: string;
  uri: string;
  localUri: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  durationMs: number;
  positionMs: number;
  played: boolean;
  addedAt: number;
  description: string | null;
  imageUrl: string | null;
  publishedAt: number | null;
  chaptersUrl: string | null;
  transcriptUrl: string | null;
  chapters: QuranChapter[];
  transcriptId: number | null;
};

export type LegacyImportResult = {
  alreadyImported: boolean;
  importedEpisodes: number;
  importedTranscripts: number;
  restoredQueueItems: number;
  skippedRemoteEpisodes: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function recordsFrom(value: unknown, storeName: string): LegacyRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const record = asRecord(row?.value);
    const key = Number(row?.key);
    return record && Number.isSafeInteger(key) && key >= 0 ? [{ key, value: record }] : [];
  });
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const valueAsNumber = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(valueAsNumber) ? valueAsNumber : fallback;
}

function positiveMillis(value: unknown): number {
  return Math.max(0, Math.round(numberValue(value, 0)));
}

function boolValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return typeof value === 'string' && ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}

function filenameFromEpisode(episode: Record<string, unknown>): string {
  const filename = stringValue(episode.filename).trim();
  if (filename) return filename.split(/[\\/]/).pop() ?? filename;
  const path = stringValue(episode.filepath).trim();
  return path ? path.split(/[\\/]/).pop() ?? '' : '';
}

function findDownloadedAsset(fileName: string, downloaded: QuranAudio[]): QuranAudio | null {
  if (!fileName) return null;
  const normalized = fileName.toLowerCase();
  return downloaded.find((track) => {
    const candidate = track.fileName.toLowerCase();
    return candidate === normalized || candidate.endsWith(`-${normalized}`) || candidate.endsWith(normalized);
  }) ?? null;
}

function parseChapters(value: unknown): QuranChapter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const startSeconds = numberValue(item.startTime, NaN);
    if (!Number.isFinite(startSeconds) || startSeconds < 0) return [];
    const end = numberValue(item.endTime, NaN);
    return [{
      title: stringValue(item.title, 'Chapter'),
      startSeconds,
      endSeconds: Number.isFinite(end) && end > 0 ? end : null,
      imageUrl: stringValue(item.imageUrl) || null,
      url: stringValue(item.url) || null,
      toc: stringValue(item.toc, 'true') !== 'false',
    } satisfies QuranChapter];
  }).sort((left, right) => left.startSeconds - right.startSeconds);
}

function firstUsableTranscriptUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const raw of value) {
    const item = asRecord(raw);
    const url = stringValue(item?.url);
    const type = numberValue(item?.type, 2);
    if ([0, 1, 3].includes(type) && url.startsWith('https://')) return url;
  }
  return null;
}

function transcriptCues(value: Record<string, unknown> | undefined): Array<{ startMs: number; endMs: number; text: string; speaker: string }> {
  if (!Array.isArray(value?.subtitles)) return [];
  return value.subtitles.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const startMs = positiveMillis(item.start);
    const endMs = Math.max(startMs, positiveMillis(item.end));
    const text = stringValue(item.data).trim();
    if (!text) return [];
    return [{ startMs, endMs, text, speaker: stringValue(item.speaker) }];
  }).sort((left, right) => left.startMs - right.startMs);
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function parseExport(rawJson: string): { source: string; storeValues: Record<string, LegacyRecord[]> } {
  let raw: unknown;
  try { raw = JSON.parse(rawJson); } catch { throw new Error('The selected file is not valid JSON.'); }
  const root = asRecord(raw);
  if (root?.format !== EXPORT_FORMAT || root.version !== EXPORT_VERSION) {
    throw new Error('This file is not a supported Shead emtula legacy export (format/version mismatch).');
  }
  const stores = asRecord(root.stores);
  if (!stores) throw new Error('The legacy export is missing its Sembast stores.');
  const storeValues = {
    podcast: recordsFrom(stores.podcast, 'podcast'),
    episode: recordsFrom(stores.episode, 'episode'),
    queue: recordsFrom(stores.queue, 'queue'),
    transcript: recordsFrom(stores.transcript, 'transcript'),
  };
  if (!storeValues.episode.length && !storeValues.podcast.length) {
    throw new Error('The export contains no legacy collection or episode records.');
  }
  return {
    source: rawJson,
    storeValues,
  };
}

function makeEpisodes(
  records: LegacyRecord[],
  downloaded: QuranAudio[],
): { episodes: ImportedEpisode[]; guidToId: Map<string, string>; skippedRemote: number } {
  const episodes: ImportedEpisode[] = [];
  const guidToId = new Map<string, string>();
  let skippedRemote = 0;

  for (const { value } of records) {
    const guid = stringValue(value.guid).trim();
    if (!guid) continue;
    const parentGuid = stringValue(value.pguid).trim();
    const isFeaturedCollection = parentGuid === FEATURED_COLLECTION_GUID;
    const legacyFileName = filenameFromEpisode(value);
    const downloadedAsset = findDownloadedAsset(legacyFileName, downloaded);

    // Remote metadata for other legacy RSS subscriptions is intentionally not restored.
    // A file that was already downloaded is still user-owned local audio and may be kept.
    if (!isFeaturedCollection && !downloadedAsset) {
      skippedRemote += 1;
      continue;
    }

    const contentUrl = stringValue(value.contentUrl).trim();
    const secureContentUrl = contentUrl.startsWith('https://') ? contentUrl : '';
    const localUri = downloadedAsset?.localUri || downloadedAsset?.uri || null;
    if (isFeaturedCollection && !secureContentUrl && !localUri) continue;

    const sourceType = isFeaturedCollection ? 'featured-google-drive' : 'local';
    const trackId = isFeaturedCollection
      ? featuredQuranAudioId(guid, secureContentUrl || localUri || guid)
      : downloadedAsset?.id ?? `legacy-local-${hash(guid)}`;
    const transcriptIdValue = numberValue(value.tid, 0);
    const transcriptId = transcriptIdValue > 0 ? transcriptIdValue : null;
    const publicationDate = positiveMillis(value.publicationDate);
    const artist = stringValue(value.author) || stringValue(value.podcast) || 'Sheikh Aadam Tuulaa';
    const title = stringValue(value.title).trim() || (downloadedAsset?.title ?? 'Quran audio');

    const episode: ImportedEpisode = {
      oldGuid: guid,
      id: trackId,
      sourceType,
      sourceGuid: guid,
      title,
      artist,
      uri: isFeaturedCollection ? secureContentUrl || localUri! : localUri!,
      localUri,
      fileName: stringValue(value.filename) || downloadedAsset?.fileName || 'quran-audio.mp3',
      mimeType: stringValue(value.mimeType) || null,
      sizeBytes: localUri ? downloadedAsset?.sizeBytes ?? Math.max(0, numberValue(value.length, 0)) : Math.max(0, numberValue(value.length, 0)),
      durationMs: positiveMillis(value.duration),
      positionMs: positiveMillis(value.position),
      played: boolValue(value.played),
      addedAt: publicationDate || Date.now(),
      description: stringValue(value.description) || stringValue(value.content) || null,
      imageUrl: stringValue(value.imageUrl) || null,
      publishedAt: publicationDate || null,
      chaptersUrl: stringValue(value.chaptersUrl) || null,
      transcriptUrl: firstUsableTranscriptUrl(value.transcriptUrls),
      chapters: parseChapters(value.chapters),
      transcriptId,
    };
    episodes.push(episode);
    guidToId.set(guid, trackId);
  }

  return { episodes, guidToId, skippedRemote };
}

async function saveImportedEpisode(txn: SQLite.SQLiteDatabase, episode: ImportedEpisode): Promise<void> {
  await txn.runAsync(
    `INSERT INTO quran_audio (
      id, title, artist, uri, file_name, mime_type, size_bytes, duration_ms,
      last_position_ms, is_played, added_at, source_type, source_guid, local_uri,
      description, image_url, published_at, chapters_url, transcript_url, chapters_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      uri = excluded.uri,
      file_name = excluded.file_name,
      mime_type = COALESCE(excluded.mime_type, quran_audio.mime_type),
      size_bytes = CASE WHEN excluded.size_bytes > 0 THEN excluded.size_bytes ELSE quran_audio.size_bytes END,
      duration_ms = CASE WHEN excluded.duration_ms > 0 THEN excluded.duration_ms ELSE quran_audio.duration_ms END,
      last_position_ms = CASE WHEN excluded.last_position_ms > 0 THEN excluded.last_position_ms ELSE quran_audio.last_position_ms END,
      is_played = CASE WHEN excluded.is_played = 1 THEN 1 ELSE quran_audio.is_played END,
      source_type = excluded.source_type,
      source_guid = COALESCE(excluded.source_guid, quran_audio.source_guid),
      local_uri = COALESCE(excluded.local_uri, quran_audio.local_uri),
      description = COALESCE(excluded.description, quran_audio.description),
      image_url = COALESCE(excluded.image_url, quran_audio.image_url),
      published_at = COALESCE(excluded.published_at, quran_audio.published_at),
      chapters_url = COALESCE(excluded.chapters_url, quran_audio.chapters_url),
      transcript_url = COALESCE(excluded.transcript_url, quran_audio.transcript_url),
      chapters_json = COALESCE(excluded.chapters_json, quran_audio.chapters_json)`,
    episode.id,
    episode.title,
    episode.artist,
    episode.uri,
    episode.fileName,
    episode.mimeType,
    episode.sizeBytes,
    episode.durationMs,
    episode.positionMs,
    episode.played ? 1 : 0,
    episode.addedAt,
    episode.sourceType,
    episode.sourceGuid,
    episode.localUri,
    episode.description,
    episode.imageUrl,
    episode.publishedAt,
    episode.chaptersUrl,
    episode.transcriptUrl,
    episode.chapters.length ? JSON.stringify(episode.chapters) : null,
  );
}

export async function importLegacySembastExport(rawJson: string, downloadedTracks: QuranAudio[]): Promise<LegacyImportResult> {
  const { source, storeValues } = parseExport(rawJson);
  const { episodes, guidToId, skippedRemote } = makeEpisodes(storeValues.episode, downloadedTracks);
  const fingerprint = `legacy-v${EXPORT_VERSION}-${hash(source)}`;
  const db = await getDatabase();
  const prior = await db.getFirstAsync<{ import_key: string }>(
    'SELECT import_key FROM legacy_imports WHERE import_key = ?', fingerprint,
  );
  if (prior) {
    return { alreadyImported: true, importedEpisodes: 0, importedTranscripts: 0, restoredQueueItems: 0, skippedRemoteEpisodes: skippedRemote };
  }

  const transcriptById = new Map(storeValues.transcript.map((record) => [record.key, record.value]));
  const queueRecord = storeValues.queue.find((record) => record.key === 1)?.value;
  const queueGuids = Array.isArray(queueRecord?.q) ? queueRecord.q.map((item) => stringValue(item)).filter(Boolean) : null;
  let importedTranscripts = 0;
  let restoredQueueItems = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const episode of episodes) {
      await saveImportedEpisode(txn, episode);
      // A legacy file scan initially inserts every downloaded file as a generic local
      // item. When its Sembast episode is restored, attach that same file to the
      // featured Quran row and remove the duplicate catalog row (never the file).
      if (episode.sourceType === 'featured-google-drive' && episode.localUri) {
        await txn.runAsync(
          `DELETE FROM quran_audio WHERE source_type = 'local' AND local_uri = ? AND id <> ?`,
          episode.localUri,
          episode.id,
        );
      }
      if (episode.transcriptId !== null) {
        const cues = transcriptCues(transcriptById.get(episode.transcriptId));
        if (cues.length) {
          await txn.runAsync(
            `INSERT INTO audio_transcripts(audio_id,cues_json,imported_at) VALUES(?,?,?)
             ON CONFLICT(audio_id) DO UPDATE SET cues_json=excluded.cues_json, imported_at=excluded.imported_at`,
            episode.id,
            JSON.stringify(cues),
            Date.now(),
          );
          importedTranscripts += 1;
        }
      }
    }

    if (queueGuids !== null) {
      await txn.runAsync('DELETE FROM playback_queue');
      const uniqueQueueIds: string[] = [];
      for (const guid of queueGuids) {
        const id = guidToId.get(guid);
        if (id && !uniqueQueueIds.includes(id)) uniqueQueueIds.push(id);
      }
      for (let position = 0; position < uniqueQueueIds.length; position += 1) {
        await txn.runAsync(
          'INSERT INTO playback_queue(position,audio_id) VALUES(?,?)',
          position,
          uniqueQueueIds[position],
        );
      }
      restoredQueueItems = uniqueQueueIds.length;
    }

    await txn.runAsync(
      'INSERT INTO legacy_imports(import_key, imported_at, imported_episodes, imported_transcripts) VALUES(?,?,?,?)',
      fingerprint,
      Date.now(),
      episodes.length,
      importedTranscripts,
    );
  });

  return {
    alreadyImported: false,
    importedEpisodes: episodes.length,
    importedTranscripts,
    restoredQueueItems,
    skippedRemoteEpisodes: skippedRemote,
  };
}
