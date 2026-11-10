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

const source = fs.readFileSync(path.resolve('src/features/quran/services/audioDownloadManager.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  reportDiagnostics: true,
});
const diagnostics = (compiled.diagnostics ?? []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
assert.equal(diagnostics.length, 0, diagnostics.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, '\n')).join('\n'));

const records = new Map();
const statuses = new Map();
const tracked = new Map();
const calls = { enqueued: [], cancelled: [], cleaned: [], finalized: [], status: [] };
let nextId = 900;
let nextStatus = 'running';

const iosDownloads = {
  async enqueue(trackId, requestUrl, requestedFileName) {
    const downloadId = String(++nextId);
    const record = { trackId, downloadId, requestUrl, fileName: requestedFileName };
    tracked.set(downloadId, record);
    statuses.set(downloadId, { status: nextStatus, bytesWritten: 0, totalBytes: 4096, reason: null });
    calls.enqueued.push(record);
    return { downloadId };
  },
  async listTrackedDownloads() { return [...tracked.values()]; },
  async getStatus(downloadId) {
    calls.status.push(downloadId);
    return statuses.get(downloadId) ?? { status: 'missing', bytesWritten: 0, totalBytes: -1, reason: null };
  },
  async finalizeDownload(downloadId) {
    calls.finalized.push(downloadId);
    return { uri: `file:///app/Documents/quran_library/download-${downloadId}-lesson.mp3`, fileName: `download-${downloadId}-lesson.mp3`, sizeBytes: 4096 };
  },
  async cancel(downloadId) {
    calls.cancelled.push(downloadId);
    statuses.set(downloadId, { status: 'cancelled', bytesWritten: 0, totalBytes: -1, reason: null });
    tracked.delete(downloadId);
    return true;
  },
  async cleanup(downloadId) {
    calls.cleaned.push(downloadId);
    tracked.delete(downloadId);
    return true;
  },
};

const database = {
  async listPendingAudioDownloads() { return [...records.values()]; },
  async saveAudioDownload(input) { records.set(input.trackId, { ...input, updatedAt: Date.now() }); },
  async updateAudioDownloadProgress(trackId, bytesWritten, totalBytes) {
    const current = records.get(trackId);
    if (current) records.set(trackId, { ...current, bytesWritten, totalBytes });
  },
  async saveAudioDownloadResumeState(trackId, resumeState, bytesWritten, totalBytes) {
    const current = records.get(trackId);
    if (current) records.set(trackId, { ...current, resumeState, bytesWritten, totalBytes });
  },
  async clearAudioDownload(trackId) { records.delete(trackId); },
};

class FakeFile {
  constructor() { this.uri = 'file:///app/Documents/quran_library/legacy-partial.mp3'; this.name = 'legacy-partial.mp3'; this.exists = false; }
  delete() { this.exists = false; }
}
class FakeDirectory { constructor() { this.uri = 'file:///app/Documents/quran_library'; this.exists = true; } create() {} }

const commonModule = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputText)((id) => {
  if (id === 'expo-file-system') return { Directory: FakeDirectory, File: Object.assign(FakeFile, { createDownloadTask() { throw new Error('FileSystem fallback is disabled in this native iOS test.'); } }), DownloadTask: class {} };
  if (id === 'react-native') return { Platform: { OS: 'ios' } };
  if (id === '../../../../modules/sheademtula-local-library') return { default: { getLibraryDirectory: () => 'file:///app/Documents/quran_library' } };
  if (id === '../../../../modules/sheademtula-android-downloads') return { default: {}, isAndroidDownloadManagerAvailable: () => false };
  if (id === '../../../../modules/sheademtula-ios-downloads') return { default: iosDownloads, isIOSBackgroundDownloadsAvailable: () => true };
  if (id === '@/storage/database') return database;
  throw new Error(`Unexpected dependency: ${id}`);
}, commonModule, commonModule.exports);
const manager = commonModule.exports;

function resetNativeState() {
  records.clear(); statuses.clear(); tracked.clear();
  calls.enqueued.length = 0; calls.cancelled.length = 0; calls.cleaned.length = 0;
  calls.finalized.length = 0; calls.status.length = 0;
  nextStatus = 'running';
}

test('iOS native URLSession task ID is saved in SQLite and completed native files are returned', async () => {
  resetNativeState();
  await manager.setQuranAudioAppActive(true);
  nextStatus = 'successful';
  const result = await manager.downloadQuranAudio('ios-fresh', 'https://audio.example/quran.mp3', 'lesson.mp3', () => {});
  const saved = records.get('ios-fresh');
  assert.equal(saved.iosDownloadId, '901');
  assert.equal(saved.destinationUri, 'ios-background-download://901');
  assert.equal(result.iosDownloadId, calls.enqueued.at(-1).downloadId);
  assert.equal(result.sizeBytes, 4096);
  assert.deepEqual(calls.finalized, ['901']);
});

test('iOS backgrounding detaches only the JS observer and foreground reattaches the same URLSession task', async () => {
  resetNativeState();
  await manager.setQuranAudioAppActive(false);
  const resultWhileBackgrounded = await manager.downloadQuranAudio('ios-background', 'https://audio.example/background.mp3', 'background.mp3', () => {});
  assert.equal(resultWhileBackgrounded, null);
  const saved = records.get('ios-background');
  assert.equal(saved.iosDownloadId, '902');
  assert.equal(tracked.has('902'), true, 'backgrounding does not cancel the OS-managed request');

  statuses.set('902', { status: 'successful', bytesWritten: 4096, totalBytes: 4096, reason: null });
  await manager.setQuranAudioAppActive(true);
  const recovered = await manager.downloadQuranAudio('ios-background', 'https://audio.example/background.mp3', 'background.mp3', () => {});
  assert.equal(recovered.iosDownloadId, '902');
  assert.deepEqual(calls.enqueued, [{ trackId: 'ios-background', downloadId: '902', requestUrl: 'https://audio.example/background.mp3', fileName: 'background.mp3' }]);
});

test('a refreshed enclosure URL cancels the stale iOS task before enqueueing the new request', async () => {
  resetNativeState();
  await manager.setQuranAudioAppActive(true);
  tracked.set('old-903', { trackId: 'ios-stale', downloadId: 'old-903', requestUrl: 'https://audio.example/old.mp3', fileName: 'lesson.mp3' });
  statuses.set('old-903', { status: 'running', bytesWritten: 512, totalBytes: 4096, reason: null });
  records.set('ios-stale', {
    trackId: 'ios-stale', requestUrl: 'https://audio.example/old.mp3', destinationUri: 'ios-background-download://old-903',
    fileName: 'lesson.mp3', bytesWritten: 512, totalBytes: 4096, resumeState: null,
    androidDownloadId: null, iosDownloadId: 'old-903', updatedAt: Date.now(),
  });
  nextStatus = 'successful';
  const result = await manager.downloadQuranAudio('ios-stale', 'https://audio.example/new.mp3', 'lesson.mp3', () => {});
  assert.ok(calls.cancelled.includes('old-903'));
  assert.equal(calls.enqueued.at(-1).requestUrl, 'https://audio.example/new.mp3');
  assert.equal(result.iosDownloadId, calls.enqueued.at(-1).downloadId);
});

test('native iOS records with no SQLite row are restored into download persistence', async () => {
  resetNativeState();
  tracked.set('904', { trackId: 'ios-orphan', downloadId: '904', requestUrl: 'https://audio.example/orphan.mp3', fileName: 'orphan.mp3' });
  statuses.set('904', { status: 'running', bytesWritten: 1024, totalBytes: 4096, reason: null });
  await manager.recoverOrphanedIOSQuranDownloads([{ id: 'ios-orphan', uri: 'https://audio.example/orphan.mp3', fileName: 'orphan.mp3', localUri: null }]);
  assert.equal(records.get('ios-orphan').iosDownloadId, '904');
  assert.equal(records.get('ios-orphan').bytesWritten, 1024);
  assert.equal(records.get('ios-orphan').destinationUri, 'ios-background-download://904');
});

test('a linked successful iOS task removes metadata without cancelling or deleting the catalog file', async () => {
  resetNativeState();
  tracked.set('905', { trackId: 'ios-linked', downloadId: '905', requestUrl: 'https://audio.example/linked.mp3', fileName: 'linked.mp3' });
  statuses.set('905', { status: 'successful', bytesWritten: 4096, totalBytes: 4096, reason: null });
  await manager.cleanupCompletedIOSQuranDownload('905');
  assert.deepEqual(calls.cleaned, ['905']);
  assert.deepEqual(calls.cancelled, []);
});

test('cancelling a persisted iOS native task removes its request and SQLite row', async () => {
  resetNativeState();
  tracked.set('906', { trackId: 'ios-cancel', downloadId: '906', requestUrl: 'https://audio.example/cancel.mp3', fileName: 'cancel.mp3' });
  statuses.set('906', { status: 'running', bytesWritten: 128, totalBytes: 4096, reason: null });
  records.set('ios-cancel', {
    trackId: 'ios-cancel', requestUrl: 'https://audio.example/cancel.mp3', destinationUri: 'ios-background-download://906',
    fileName: 'cancel.mp3', bytesWritten: 128, totalBytes: 4096, resumeState: null,
    androidDownloadId: null, iosDownloadId: '906', updatedAt: Date.now(),
  });
  assert.equal(await manager.cancelQuranAudioDownload('ios-cancel'), true);
  assert.deepEqual(calls.cancelled, ['906']);
  assert.equal(records.has('ios-cancel'), false);
});
