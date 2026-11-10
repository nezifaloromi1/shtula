import * as SQLite from 'expo-sqlite';
import type { QuranAudio, QuranChapter } from '@/features/quran/models/QuranAudio';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) databasePromise = SQLite.openDatabaseAsync('sheademtula.db');
  return databasePromise;
}

async function ensureColumn(db: SQLite.SQLiteDatabase, table: string, column: string, definition: string): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS quran_audio (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT 'Sheikh Aadam Tuulaa',
      uri TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      last_position_ms INTEGER NOT NULL DEFAULT 0,
      is_played INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'local',
      source_guid TEXT,
      local_uri TEXT,
      description TEXT,
      image_url TEXT,
      published_at INTEGER,
      chapters_url TEXT,
      transcript_url TEXT,
      chapters_json TEXT
    );
    CREATE TABLE IF NOT EXISTS quran_downloads (
      track_id TEXT PRIMARY KEY NOT NULL REFERENCES quran_audio(id) ON DELETE CASCADE,
      request_url TEXT NOT NULL,
      destination_uri TEXT NOT NULL,
      file_name TEXT NOT NULL,
      bytes_written INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER NOT NULL DEFAULT -1,
      resume_state_json TEXT,
      android_download_id TEXT,
      ios_download_id TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playback_queue (
      position INTEGER PRIMARY KEY NOT NULL,
      audio_id TEXT NOT NULL REFERENCES quran_audio(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS audio_transcripts (
      audio_id TEXT PRIMARY KEY NOT NULL REFERENCES quran_audio(id) ON DELETE CASCADE,
      cues_json TEXT NOT NULL,
      imported_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS legacy_imports (
      import_key TEXT PRIMARY KEY NOT NULL,
      imported_at INTEGER NOT NULL,
      imported_episodes INTEGER NOT NULL DEFAULT 0,
      imported_transcripts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_quran_audio_added_at ON quran_audio(added_at DESC);
  `);

  await ensureColumn(db, 'quran_audio', 'source_type', "TEXT NOT NULL DEFAULT 'local'");
  await ensureColumn(db, 'quran_audio', 'source_guid', 'TEXT');
  await ensureColumn(db, 'quran_audio', 'local_uri', 'TEXT');
  await ensureColumn(db, 'quran_audio', 'description', 'TEXT');
  await ensureColumn(db, 'quran_audio', 'image_url', 'TEXT');
  await ensureColumn(db, 'quran_audio', 'published_at', 'INTEGER');
  await ensureColumn(db, 'quran_audio', 'chapters_url', 'TEXT');
  await ensureColumn(db, 'quran_audio', 'transcript_url', 'TEXT');
  await ensureColumn(db, 'quran_audio', 'chapters_json', 'TEXT');
  await ensureColumn(db, 'quran_downloads', 'android_download_id', 'TEXT');
  await ensureColumn(db, 'quran_downloads', 'ios_download_id', 'TEXT');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_quran_audio_source_guid ON quran_audio(source_guid)');

  // Compatibility with earlier local-library migration builds: old local rows stored their
  // private file path in `uri` and had no `local_uri` column.
  await db.runAsync(
    `UPDATE quran_audio SET local_uri = uri
     WHERE source_type = 'local' AND (local_uri IS NULL OR local_uri = '')`,
  );
}

type AudioRow = Record<string, unknown>;
function parseChaptersJson(value: unknown): QuranChapter[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QuranChapter => {
      if (!item || typeof item !== 'object') return false;
      const chapter = item as Record<string, unknown>;
      return typeof chapter.title === 'string' && typeof chapter.startSeconds === 'number';
    });
  } catch { return []; }
}
function rowToAudio(row: AudioRow): QuranAudio {
  const sourceType = row.source_type === 'featured-google-drive' ? 'featured-google-drive' : 'local';
  return {
    id: String(row.id),
    sourceType,
    sourceGuid: row.source_guid == null ? null : String(row.source_guid),
    title: String(row.title),
    artist: String(row.artist ?? 'Sheikh Aadam Tuulaa'),
    uri: String(row.uri),
    localUri: row.local_uri == null || row.local_uri === '' ? null : String(row.local_uri),
    fileName: String(row.file_name ?? 'quran-audio.mp3'),
    mimeType: row.mime_type == null ? null : String(row.mime_type),
    sizeBytes: Number(row.size_bytes ?? 0),
    durationMs: Number(row.duration_ms ?? 0),
    lastPositionMs: Number(row.last_position_ms ?? 0),
    isPlayed: Number(row.is_played ?? 0) === 1,
    addedAt: Number(row.added_at ?? Date.now()),
    description: row.description == null ? null : String(row.description),
    imageUrl: row.image_url == null ? null : String(row.image_url),
    publishedAt: row.published_at == null ? null : Number(row.published_at),
    chaptersUrl: row.chapters_url == null ? null : String(row.chapters_url),
    transcriptUrl: row.transcript_url == null ? null : String(row.transcript_url),
    chapters: parseChaptersJson(row.chapters_json),
  };
}

export async function listQuranAudio(): Promise<QuranAudio[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AudioRow>(
    `SELECT * FROM quran_audio
     WHERE source_type = 'featured-google-drive' OR (local_uri IS NOT NULL AND local_uri != '')
     ORDER BY CASE WHEN source_type = 'featured-google-drive' THEN 0 ELSE 1 END,
              title COLLATE NOCASE ASC`,
  );
  return rows.map(rowToAudio);
}

export async function listDownloadedQuranAudio(): Promise<QuranAudio[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AudioRow>(
    `SELECT * FROM quran_audio WHERE local_uri IS NOT NULL AND local_uri != '' ORDER BY title COLLATE NOCASE ASC`,
  );
  return rows.map(rowToAudio);
}

type NewQuranAudio = Pick<QuranAudio, 'id' | 'title' | 'artist' | 'uri' | 'fileName' | 'mimeType' | 'sizeBytes'> &
  Partial<Pick<QuranAudio, 'durationMs' | 'lastPositionMs' | 'isPlayed' | 'addedAt'>>;

export async function insertQuranAudio(input: NewQuranAudio): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM quran_audio WHERE local_uri = ? LIMIT 1',
    input.uri,
  );
  if (existing) return;
  await db.runAsync(
    `INSERT OR IGNORE INTO quran_audio (
      id, title, artist, uri, file_name, mime_type, size_bytes, duration_ms,
      last_position_ms, is_played, added_at, source_type, local_uri
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?)`,
    input.id, input.title, input.artist, input.uri, input.fileName, input.mimeType,
    input.sizeBytes, input.durationMs ?? 0, input.lastPositionMs ?? 0,
    input.isPlayed ? 1 : 0, input.addedAt ?? Date.now(), input.uri,
  );
}

export async function upsertFeaturedQuranAudio(track: QuranAudio): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO quran_audio (
      id, title, artist, uri, file_name, mime_type, size_bytes, duration_ms,
      last_position_ms, is_played, added_at, source_type, source_guid, local_uri,
      description, image_url, published_at, chapters_url, transcript_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'featured-google-drive', ?, NULL, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      uri = excluded.uri,
      file_name = excluded.file_name,
      mime_type = excluded.mime_type,
      size_bytes = CASE WHEN excluded.size_bytes > 0 THEN excluded.size_bytes ELSE quran_audio.size_bytes END,
      duration_ms = CASE WHEN excluded.duration_ms > 0 THEN excluded.duration_ms ELSE quran_audio.duration_ms END,
      source_type = 'featured-google-drive',
      source_guid = excluded.source_guid,
      description = excluded.description,
      image_url = excluded.image_url,
      published_at = excluded.published_at,
      chapters_url = excluded.chapters_url,
      transcript_url = excluded.transcript_url`,
    track.id, track.title, track.artist, track.uri, track.fileName, track.mimeType,
    track.sizeBytes, track.durationMs, track.lastPositionMs, track.isPlayed ? 1 : 0,
    track.addedAt, track.sourceGuid, track.description, track.imageUrl,
    track.publishedAt, track.chaptersUrl, track.transcriptUrl,
  );
}

export async function setDownloadedUri(id: string, localUri: string, fileName: string, sizeBytes: number): Promise<void> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `UPDATE quran_audio SET local_uri = ?, file_name = ?, size_bytes = ? WHERE id = ?`,
    localUri, fileName, sizeBytes, id,
  );
  if (result.changes !== 1) throw new Error(`The downloaded audio entry ${id} is no longer in the Quran catalog.`);
}

export async function clearDownloadedUri(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE quran_audio SET local_uri = NULL WHERE id = ? AND source_type = 'featured-google-drive'`, id);
}

export async function removeQuranAudio(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM quran_audio WHERE id = ? AND source_type = 'local'`, id);
  await db.runAsync('DELETE FROM playback_queue WHERE audio_id = ?', id);
}


export type StoredAudioDownload = {
  trackId: string;
  requestUrl: string;
  destinationUri: string;
  fileName: string;
  bytesWritten: number;
  totalBytes: number;
  resumeState: unknown | null;
  androidDownloadId: string | null;
  iosDownloadId: string | null;
  updatedAt: number;
};

export async function saveAudioDownload(input: Omit<StoredAudioDownload, 'updatedAt' | 'androidDownloadId' | 'iosDownloadId'> & { androidDownloadId?: string | null; iosDownloadId?: string | null }): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO quran_downloads (
      track_id, request_url, destination_uri, file_name, bytes_written,
      total_bytes, resume_state_json, android_download_id, ios_download_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(track_id) DO UPDATE SET
      request_url = excluded.request_url,
      destination_uri = excluded.destination_uri,
      file_name = excluded.file_name,
      bytes_written = excluded.bytes_written,
      total_bytes = excluded.total_bytes,
      resume_state_json = excluded.resume_state_json,
      android_download_id = excluded.android_download_id,
      ios_download_id = excluded.ios_download_id,
      updated_at = excluded.updated_at`,
    input.trackId,
    input.requestUrl,
    input.destinationUri,
    input.fileName,
    Math.max(0, Math.floor(input.bytesWritten)),
    Math.floor(input.totalBytes),
    input.resumeState == null ? null : JSON.stringify(input.resumeState),
    input.androidDownloadId ?? null,
    input.iosDownloadId ?? null,
    Date.now(),
  );
}

export async function updateAudioDownloadProgress(trackId: string, bytesWritten: number, totalBytes: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE quran_downloads SET bytes_written = ?, total_bytes = ?, updated_at = ? WHERE track_id = ?`,
    Math.max(0, Math.floor(bytesWritten)), Math.floor(totalBytes), Date.now(), trackId,
  );
}

export async function saveAudioDownloadResumeState(
  trackId: string,
  resumeState: unknown,
  bytesWritten: number,
  totalBytes: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE quran_downloads SET resume_state_json = ?, bytes_written = ?, total_bytes = ?, updated_at = ? WHERE track_id = ?`,
    JSON.stringify(resumeState), Math.max(0, Math.floor(bytesWritten)), Math.floor(totalBytes), Date.now(), trackId,
  );
}

export async function listPendingAudioDownloads(): Promise<StoredAudioDownload[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AudioRow>(
    `SELECT * FROM quran_downloads ORDER BY updated_at ASC`,
  );
  return rows.map((row) => {
    let resumeState: unknown | null = null;
    if (typeof row.resume_state_json === 'string' && row.resume_state_json) {
      try { resumeState = JSON.parse(row.resume_state_json) as unknown; } catch { resumeState = null; }
    }
    return {
      trackId: String(row.track_id),
      requestUrl: String(row.request_url),
      destinationUri: String(row.destination_uri),
      fileName: String(row.file_name),
      bytesWritten: Math.max(0, Number(row.bytes_written ?? 0)),
      totalBytes: Number(row.total_bytes ?? -1),
      resumeState,
      androidDownloadId: row.android_download_id == null ? null : String(row.android_download_id),
      iosDownloadId: row.ios_download_id == null ? null : String(row.ios_download_id),
      updatedAt: Number(row.updated_at ?? 0),
    };
  });
}

export async function clearAudioDownload(trackId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM quran_downloads WHERE track_id = ?', trackId);
}


export async function saveDuration(id: string, durationMs: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE quran_audio SET duration_ms = ? WHERE id = ?', Math.max(0, Math.round(durationMs)), id);
}

export async function savePosition(id: string, positionMs: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE quran_audio SET last_position_ms = ? WHERE id = ?', Math.max(0, Math.round(positionMs)), id);
}

export async function setPlayed(id: string, played: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE quran_audio SET is_played = ? WHERE id = ?', played ? 1 : 0, id);
}

/** Updates played state for the single built-in Google Drive Quran collection. */
export async function setAllFeaturedQuranTracksPlayed(played: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE quran_audio SET is_played = ? WHERE source_type = 'featured-google-drive'`,
    played ? 1 : 0,
  );
}

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
}

export async function writeQueue(ids: string[]): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM playback_queue');
    for (let index = 0; index < ids.length; index += 1) {
      await txn.runAsync('INSERT INTO playback_queue(position,audio_id) VALUES(?,?)', index, ids[index]);
    }
  });
}

export async function readQueue(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ audio_id: string }>('SELECT audio_id FROM playback_queue ORDER BY position ASC');
  return rows.map((row) => row.audio_id);
}

export async function getPlaybackPositionMs(id: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ last_position_ms: number }>('SELECT last_position_ms FROM quran_audio WHERE id = ?', id);
  return Math.max(0, Number(row?.last_position_ms ?? 0));
}


export type CachedTranscriptCue = { startMs: number; endMs: number; text: string; speaker: string };

export async function readCachedTranscript(audioId: string): Promise<CachedTranscriptCue[] | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cues_json: string }>(
    'SELECT cues_json FROM audio_transcripts WHERE audio_id = ?', audioId,
  );
  if (!row) return null;
  try {
    const value: unknown = JSON.parse(row.cues_json);
    if (!Array.isArray(value)) return null;
    return value.filter((entry): entry is CachedTranscriptCue => {
      if (!entry || typeof entry !== 'object') return false;
      const cue = entry as Record<string, unknown>;
      return Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs) && typeof cue.text === 'string';
    });
  } catch { return null; }
}


export async function writeCachedTranscript(
  audioId: string,
  cues: CachedTranscriptCue[],
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO audio_transcripts(audio_id,cues_json,imported_at) VALUES(?,?,?)
     ON CONFLICT(audio_id) DO UPDATE SET cues_json=excluded.cues_json, imported_at=excluded.imported_at`,
    audioId,
    JSON.stringify(cues),
    Date.now(),
  );
}

export async function writeCachedChapters(audioId: string, chapters: QuranChapter[]): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE quran_audio SET chapters_json = ? WHERE id = ?', JSON.stringify(chapters), audioId);
}
