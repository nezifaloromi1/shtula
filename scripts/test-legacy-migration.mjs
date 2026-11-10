import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  const candidates = [
    process.env.TYPESCRIPT_PATH,
    '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript',
    '/usr/local/lib/node_modules/typescript',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { ts = require(candidate); break; } catch { /* Try the next installed compiler. */ }
  }
}
if (!ts) throw new Error('TypeScript is required to run this test. Run npm install first.');

const migrationPath = path.resolve('src/storage/legacyMigration.ts');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');

function makeFeaturedId(guid) {
  let hash = 2166136261;
  for (let index = 0; index < guid.length; index += 1) {
    hash ^= guid.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `quran-feed-${(hash >>> 0).toString(16)}`;
}

function loadMigration(mockDb) {
  const compiled = ts.transpileModule(migrationSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  const mockRequire = (id) => {
    if (id === './database') return { getDatabase: async () => mockDb };
    if (id === '@/features/quran/services/featuredQuranFeed') return { featuredQuranAudioId: makeFeaturedId };
    if (id === 'expo-sqlite') return {};
    throw new Error(`Unexpected runtime dependency in migration module: ${id}`);
  };
  new Function('require', 'module', 'exports', compiled.outputText)(mockRequire, module, module.exports);
  return module.exports;
}

function makeDatabase() {
  const statements = [];
  const importedKeys = new Set();
  const db = {
    async getFirstAsync(sql, ...params) {
      if (sql.includes('FROM legacy_imports')) {
        return importedKeys.has(params[0]) ? { import_key: params[0] } : null;
      }
      return null;
    },
    async withExclusiveTransactionAsync(callback) {
      await callback({
        async runAsync(sql, ...params) {
          statements.push({ sql, params });
          if (sql.includes('INSERT INTO legacy_imports')) importedKeys.add(params[0]);
          return { changes: 1 };
        },
      });
    },
  };
  return { db, statements };
}

const backup = {
  format: 'sheademtula-legacy-export',
  version: 1,
  stores: {
    podcast: [{ key: 1, value: { guid: 'sheikh-aadam-tuulaa', title: 'Sheikh Aadam Tuulaa' } }],
    episode: [
      { key: 1, value: {
        guid: 'featured-downloaded-guid', pguid: 'sheikh-aadam-tuulaa', podcast: 'Sheikh Aadam Tuulaa',
        title: 'Downloaded Quran lesson', filename: 'lesson.mp3', filepath: '/old/AnyTime',
        contentUrl: 'https://drive.usercontent.google.com/download?id=lesson', length: '7654321',
        duration: '120000', position: '45000', played: 'true', publicationDate: '1700000000000', tid: 7,
        chapters: [{ title: 'Opening', startTime: '10.5', endTime: '20.75', toc: 'true', imageUrl: null, url: null }],
        transcriptUrls: [{ url: 'https://example.org/lesson.vtt', type: 3, lang: 'en', rel: 'captions' }],
      } },
      { key: 2, value: {
        guid: 'featured-streaming-guid', pguid: 'sheikh-aadam-tuulaa', podcast: 'Sheikh Aadam Tuulaa',
        title: 'Streaming Quran lesson', contentUrl: 'https://drive.usercontent.google.com/download?id=stream',
        duration: '60000', position: '0', played: 'false',
      } },
      { key: 3, value: {
        guid: 'other-remote-guid', pguid: 'unrelated-feed-guid', podcast: 'Unrelated feed',
        title: 'Must not restore remote feed', contentUrl: 'https://example.org/other.mp3',
      } },
      { key: 4, value: {
        guid: 'other-downloaded-guid', pguid: 'unrelated-feed-guid', podcast: 'Old feed',
        title: 'Keep local audio', filename: 'other.mp3', filepath: '/old/AnyTime',
        duration: '90000', position: '1000', played: 'false',
      } },
    ],
    queue: [{ key: 1, value: { q: ['featured-streaming-guid', 'featured-downloaded-guid', 'other-downloaded-guid', 'other-remote-guid', 'featured-downloaded-guid'] } }],
    transcript: [{ key: 7, value: { guid: 'featured-downloaded-guid', subtitles: [
      { i: 1, start: 0, end: 2000, speaker: 'Narrator', data: 'First timed cue' },
      { i: 2, start: 2200, end: 4000, speaker: '', data: 'Second timed cue' },
    ] } }],
  },
};

const downloaded = [
  {
    id: 'local-scan-1', sourceType: 'local', sourceGuid: null, title: 'lesson', artist: 'Sheikh Aadam Tuulaa',
    uri: 'file:///quran_library/hash-lesson.mp3', localUri: 'file:///quran_library/hash-lesson.mp3',
    fileName: 'hash-lesson.mp3', mimeType: 'audio/mpeg', sizeBytes: 3210, durationMs: 0,
    lastPositionMs: 0, isPlayed: false, addedAt: 1, description: null, imageUrl: null, publishedAt: null,
    chaptersUrl: null, transcriptUrl: null, chapters: [],
  },
  {
    id: 'local-scan-2', sourceType: 'local', sourceGuid: null, title: 'other', artist: 'Local',
    uri: 'file:///quran_library/hash-other.mp3', localUri: 'file:///quran_library/hash-other.mp3',
    fileName: 'hash-other.mp3', mimeType: 'audio/mpeg', sizeBytes: 6543, durationMs: 0,
    lastPositionMs: 0, isPlayed: false, addedAt: 2, description: null, imageUrl: null, publishedAt: null,
    chaptersUrl: null, transcriptUrl: null, chapters: [],
  },
];

test('imports the featured feed, local downloads, playback state, transcript, chapters and filtered queue', async () => {
  const { db, statements } = makeDatabase();
  const { importLegacySembastExport } = loadMigration(db);
  const result = await importLegacySembastExport(JSON.stringify(backup), downloaded);

  assert.deepEqual(result, {
    alreadyImported: false,
    importedEpisodes: 3,
    importedTranscripts: 1,
    restoredQueueItems: 3,
    skippedRemoteEpisodes: 1,
  });

  const audioInsertions = statements.filter((entry) => entry.sql.includes('INSERT INTO quran_audio'));
  assert.equal(audioInsertions.length, 3);
  const featuredDownloaded = audioInsertions.find((entry) => entry.params[1] === 'Downloaded Quran lesson');
  assert.ok(featuredDownloaded);
  assert.equal(featuredDownloaded.params[6], 3210, 'actual copied file size must take precedence over RSS enclosure length');
  assert.equal(featuredDownloaded.params[8], 45000, 'playback position remains milliseconds');
  assert.equal(featuredDownloaded.params[9], 1, 'played flag is preserved');
  assert.equal(featuredDownloaded.params[13], downloaded[0].localUri, 'downloaded file is attached to the remote feed item');
  assert.equal(typeof featuredDownloaded.params[19], 'string', 'chapter markers are persisted');

  const transcriptInsert = statements.find((entry) => entry.sql.includes('INSERT INTO audio_transcripts'));
  assert.ok(transcriptInsert);
  const transcriptCues = JSON.parse(transcriptInsert.params[1]);
  assert.equal(transcriptCues[1].startMs, 2200);
  assert.equal(transcriptCues[0].speaker, 'Narrator');

  const queueInsertions = statements.filter((entry) => entry.sql.includes('INSERT INTO playback_queue'));
  assert.equal(queueInsertions.length, 3);
  assert.deepEqual(queueInsertions.map((entry) => entry.params[0]), [0, 1, 2]);
  assert.ok(statements.some((entry) => entry.sql.includes("DELETE FROM quran_audio WHERE source_type = 'local'")), 'duplicate local scan row should be removed without deleting its file');
  assert.equal(statements.some((entry) => entry.sql.includes('Must not restore remote feed')), false);
});

test('re-importing the exact same backup is idempotent', async () => {
  const { db } = makeDatabase();
  const { importLegacySembastExport } = loadMigration(db);
  const raw = JSON.stringify(backup);
  const first = await importLegacySembastExport(raw, downloaded);
  assert.equal(first.alreadyImported, false);
  const second = await importLegacySembastExport(raw, downloaded);
  assert.deepEqual(second, {
    alreadyImported: true,
    importedEpisodes: 0,
    importedTranscripts: 0,
    restoredQueueItems: 0,
    skippedRemoteEpisodes: 1,
  });
});

test('rejects unrelated or unsupported backup files before database writes', async () => {
  const { db, statements } = makeDatabase();
  const { importLegacySembastExport } = loadMigration(db);
  await assert.rejects(() => importLegacySembastExport('{not json', downloaded), /valid JSON/);
  await assert.rejects(() => importLegacySembastExport(JSON.stringify({ format: 'other', version: 1, stores: {} }), downloaded), /format\/version mismatch/);
  assert.equal(statements.length, 0);
});
