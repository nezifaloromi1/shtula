import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch {
  for (const candidate of [process.env.TYPESCRIPT_PATH, '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript', '/usr/local/lib/node_modules/typescript'].filter(Boolean)) {
    try { ts = require(candidate); break; } catch { /* Try another compiler. */ }
  }
}
if (!ts) throw new Error('TypeScript is required to run this test. Run npm install first.');

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch {
  test('download SQLite persistence (requires Node.js with node:sqlite)', { skip: 'Use Node.js 22.5+ to run this integration test.' }, () => {});
}

if (DatabaseSync) {
  const source = fs.readFileSync(path.resolve('src/storage/database.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));

  function adaptDatabase(nativeDb) {
    return {
      async execAsync(sql) { nativeDb.exec(sql); },
      async runAsync(sql, ...params) { return nativeDb.prepare(sql).run(...params); },
      async getFirstAsync(sql, ...params) { return nativeDb.prepare(sql).get(...params) ?? null; },
      async getAllAsync(sql, ...params) { return nativeDb.prepare(sql).all(...params); },
    };
  }

  test('download checkpoint metadata and opaque resume state persist in the app SQLite schema', async () => {
    const nativeDb = new DatabaseSync(':memory:');
    const adapted = adaptDatabase(nativeDb);
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled.outputText)((id) => {
      if (id === 'expo-sqlite') return { openDatabaseAsync: async () => adapted };
      throw new Error(`Unexpected database dependency: ${id}`);
    }, module, module.exports);
    const database = module.exports;

    await database.initializeDatabase();
    await database.insertQuranAudio({
      id: 'quran-row', title: 'Test Quran lesson', artist: 'Sheikh Aadam Tuulaa',
      uri: 'https://example.org/audio.mp3', fileName: 'audio.mp3', mimeType: 'audio/mpeg', sizeBytes: 0,
    });
    const savedState = { url: 'https://example.org/audio.mp3', fileUri: 'file:///private/quran/audio.mp3', isDirectory: false };
    await database.saveAudioDownload({
      trackId: 'quran-row', requestUrl: savedState.url, destinationUri: savedState.fileUri,
      fileName: 'audio.mp3', bytesWritten: 120, totalBytes: 900, resumeState: savedState, androidDownloadId: null,
    });
    await database.updateAudioDownloadProgress('quran-row', 240, 900);
    await database.saveAudioDownloadResumeState('quran-row', savedState, 240, 900);

    const [pending] = await database.listPendingAudioDownloads();
    assert.equal(pending.trackId, 'quran-row');
    assert.equal(pending.requestUrl, savedState.url);
    assert.equal(pending.destinationUri, savedState.fileUri);
    assert.equal(pending.bytesWritten, 240);
    assert.equal(pending.totalBytes, 900);
    assert.deepEqual(pending.resumeState, savedState);
    assert.equal(pending.androidDownloadId, null);
    assert.equal(pending.iosDownloadId, null);

    await database.saveAudioDownload({
      trackId: 'quran-row', requestUrl: savedState.url, destinationUri: 'android-download://812',
      fileName: 'audio.mp3', bytesWritten: 480, totalBytes: 900, resumeState: null, androidDownloadId: '812',
    });
    const [androidPending] = await database.listPendingAudioDownloads();
    assert.equal(androidPending.androidDownloadId, '812', 'the Android system task ID survives process restarts in SQLite');

    await database.saveAudioDownload({
      trackId: 'quran-row', requestUrl: savedState.url, destinationUri: 'ios-background-download://42',
      fileName: 'audio.mp3', bytesWritten: 760, totalBytes: 900, resumeState: null, iosDownloadId: '42',
    });
    const [iosPending] = await database.listPendingAudioDownloads();
    assert.equal(iosPending.iosDownloadId, '42', 'the iOS background URLSession task ID survives process restarts in SQLite');
    assert.equal(iosPending.androidDownloadId, null, 'platform task IDs remain mutually exclusive');

    await database.removeQuranAudio('quran-row');
    assert.deepEqual(await database.listPendingAudioDownloads(), [], 'foreign-key cascade removes checkpoints when a local catalog row is deleted');
    nativeDb.close();
  });
}
