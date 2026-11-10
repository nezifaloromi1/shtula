import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch {
  for (const candidate of [process.env.TYPESCRIPT_PATH, '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript', '/usr/local/lib/node_modules/typescript'].filter(Boolean)) {
    try { ts = require(candidate); break; } catch { /* Try the next compiler. */ }
  }
}
if (!ts) throw new Error('TypeScript is required to run this test. Run npm install first.');

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { test('real SQLite import integration (requires Node.js with node:sqlite)', { skip: 'Use Node.js 22.5+ to run this optional integration test.' }, () => {}); }

if (DatabaseSync) {
  const sourcePath = path.resolve('src/storage/legacyMigration.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));

  const schema = `
    PRAGMA foreign_keys = ON;
    CREATE TABLE quran_audio (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, uri TEXT NOT NULL,
      file_name TEXT NOT NULL, mime_type TEXT, size_bytes INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0, last_position_ms INTEGER NOT NULL DEFAULT 0,
      is_played INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'local', source_guid TEXT, local_uri TEXT,
      description TEXT, image_url TEXT, published_at INTEGER, chapters_url TEXT,
      transcript_url TEXT, chapters_json TEXT
    );
    CREATE TABLE playback_queue (position INTEGER PRIMARY KEY NOT NULL, audio_id TEXT NOT NULL REFERENCES quran_audio(id) ON DELETE CASCADE);
    CREATE TABLE audio_transcripts (audio_id TEXT PRIMARY KEY NOT NULL REFERENCES quran_audio(id) ON DELETE CASCADE, cues_json TEXT NOT NULL, imported_at INTEGER NOT NULL);
    CREATE TABLE legacy_imports (import_key TEXT PRIMARY KEY NOT NULL, imported_at INTEGER NOT NULL, imported_episodes INTEGER NOT NULL DEFAULT 0, imported_transcripts INTEGER NOT NULL DEFAULT 0);
  `;

  function adaptDatabase(db) {
    const execute = (sql, params = []) => db.prepare(sql).run(...params);
    const txn = {
      async runAsync(sql, ...params) { return execute(sql, params); },
      async getFirstAsync(sql, ...params) { return db.prepare(sql).get(...params) ?? null; },
      async getAllAsync(sql, ...params) { return db.prepare(sql).all(...params); },
    };
    return {
      ...txn,
      async withExclusiveTransactionAsync(callback) {
        db.exec('BEGIN IMMEDIATE');
        try { await callback(txn); db.exec('COMMIT'); }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    };
  }

  function loadImporter(database) {
    const module = { exports: {} };
    const mockRequire = (id) => {
      if (id === './database') return { getDatabase: async () => database };
      if (id === '@/features/quran/services/featuredQuranFeed') return {
        featuredQuranAudioId: (guid) => `quran-${guid}`,
      };
      if (id === 'expo-sqlite') return {};
      throw new Error(`Unexpected importer dependency: ${id}`);
    };
    new Function('require', 'module', 'exports', compiled.outputText)(mockRequire, module, module.exports);
    return module.exports.importLegacySembastExport;
  }

  test('imports legacy records into a real SQLite database transaction and remains idempotent', async () => {
    const nativeDb = new DatabaseSync(':memory:');
    nativeDb.exec(schema);
    const db = adaptDatabase(nativeDb);
    const importLegacySembastExport = loadImporter(db);
    const backup = {
      format: 'sheademtula-legacy-export', version: 1,
      stores: {
        podcast: [{ key: 1, value: { guid: 'sheikh-aadam-tuulaa', title: 'Sheikh Aadam Tuulaa' } }],
        episode: [
          { key: 1, value: {
            guid: 'featured-lesson', pguid: 'sheikh-aadam-tuulaa', podcast: 'Sheikh Aadam Tuulaa',
            title: 'Restored Quran lesson', filename: 'lesson.mp3', contentUrl: 'https://drive.usercontent.google.com/download?id=lesson',
            duration: '120000', position: '45000', played: 'true', publicationDate: '1700000000000', tid: 7,
            chapters: [{ title: 'Opening', startTime: '10.5', endTime: '20.75', toc: 'true' }],
          } },
          { key: 2, value: { guid: 'foreign-item', pguid: 'another-feed', title: 'Do not restore', contentUrl: 'https://example.org/foreign.mp3' } },
        ],
        queue: [{ key: 1, value: { q: ['featured-lesson', 'foreign-item'] } }],
        transcript: [{ key: 7, value: { guid: 'featured-lesson', subtitles: [{ i: 1, start: 0, end: 2500, speaker: 'Reader', data: 'Bismillah' }] } }],
      },
    };
    const downloaded = [{
      id: 'local-copy', sourceType: 'local', sourceGuid: null, title: 'lesson', artist: 'Sheikh Aadam Tuulaa',
      uri: 'file:///private/quran/lesson.mp3', localUri: 'file:///private/quran/lesson.mp3', fileName: 'lesson.mp3',
      mimeType: 'audio/mpeg', sizeBytes: 4096, durationMs: 0, lastPositionMs: 0, isPlayed: false,
      addedAt: 1, description: null, imageUrl: null, publishedAt: null, chaptersUrl: null, transcriptUrl: null, chapters: [],
    }];

    const first = await importLegacySembastExport(JSON.stringify(backup), downloaded);
    assert.deepEqual(first, {
      alreadyImported: false, importedEpisodes: 1, importedTranscripts: 1, restoredQueueItems: 1, skippedRemoteEpisodes: 1,
    });

    const episode = nativeDb.prepare('SELECT * FROM quran_audio WHERE id = ?').get('quran-featured-lesson');
    assert.equal(episode.last_position_ms, 45_000);
    assert.equal(episode.is_played, 1);
    assert.equal(episode.local_uri, 'file:///private/quran/lesson.mp3');
    assert.equal(JSON.parse(episode.chapters_json)[0].startSeconds, 10.5);
    assert.equal(nativeDb.prepare('SELECT COUNT(*) AS count FROM quran_audio').get().count, 1, 'the duplicate local scan row is removed');
    assert.equal(nativeDb.prepare('SELECT audio_id FROM playback_queue ORDER BY position').get().audio_id, 'quran-featured-lesson');
    const transcript = nativeDb.prepare('SELECT cues_json FROM audio_transcripts WHERE audio_id = ?').get('quran-featured-lesson');
    assert.equal(JSON.parse(transcript.cues_json)[0].text, 'Bismillah');

    const second = await importLegacySembastExport(JSON.stringify(backup), downloaded);
    assert.equal(second.alreadyImported, true);
    assert.equal(nativeDb.prepare('SELECT COUNT(*) AS count FROM quran_audio').get().count, 1);
    nativeDb.close();
  });
}
