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
const nativeIds = new Map();
const statuses = new Map();
const trackedMetadata = new Map();
let nextId = 700;
let nextEnqueueStatus = 'running';
let nextEnqueueReason = 0;
let statusCalls = 0;
const cancelCalls = [];
const cleanupCalls = [];
const finalizedCalls = [];

const nativeDownloads = {
  async enqueue(trackId, requestUrl, requestedFileName) {
    const id = String(++nextId);
    nativeIds.set(trackId, id);
    trackedMetadata.set(id, { trackId, downloadId: id, requestUrl, fileName: requestedFileName });
    statuses.set(id, { status: nextEnqueueStatus, bytesWritten: 0, totalBytes: 1000, reason: nextEnqueueReason });
    return { downloadId: id };
  },
  async findDownloadForTrack(trackId) { return nativeIds.get(trackId) ?? null; },
  async listTrackedDownloads() { return [...trackedMetadata.values()]; },
  async getStatus(id) { statusCalls += 1; return statuses.get(id) ?? { status: 'missing', bytesWritten: 0, totalBytes: -1, reason: 0 }; },
  async finalizeDownload(id, requestedFileName) {
    finalizedCalls.push(id);
    return { uri: `file:///app/quran_library/download-${id}-${requestedFileName}`, fileName: `download-${id}-${requestedFileName}`, sizeBytes: 1000 };
  },
  async cancel(id) {
    cancelCalls.push(id);
    statuses.set(id, { status: 'missing', bytesWritten: 0, totalBytes: -1, reason: 0 });
    trackedMetadata.delete(id);
    for (const [trackId, currentId] of nativeIds) if (currentId === id) nativeIds.delete(trackId);
    return true;
  },
  async cleanup(id) { cleanupCalls.push(id); statuses.set(id, { status: 'missing', bytesWritten: 0, totalBytes: -1, reason: 0 }); trackedMetadata.delete(id); return true; },
};

const database = {
  async listPendingAudioDownloads() { return [...records.values()]; },
  async saveAudioDownload(record) { records.set(record.trackId, { ...record, updatedAt: Date.now() }); },
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

const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputText)((id) => {
  if (id === 'expo-file-system') return { Directory: class {}, File: class {}, DownloadTask: class {} };
  if (id === 'react-native') return { Platform: { OS: 'android' } };
  if (id === '../../../../modules/sheademtula-local-library') return { default: { getLibraryDirectory: () => 'file:///app/quran_library' } };
  if (id === '../../../../modules/sheademtula-android-downloads') return { default: nativeDownloads, isAndroidDownloadManagerAvailable: () => true };
  if (id === '../../../../modules/sheademtula-ios-downloads') return {
    default: {},
    isIOSBackgroundDownloadsAvailable: () => false,
  };
  if (id === '@/storage/database') return database;
  throw new Error(`Unexpected dependency: ${id}`);
}, module, module.exports);
const manager = module.exports;

test('Android downloads use the system task and persist its ID before observing progress', async () => {
  await manager.setQuranAudioAppActive(true);
  nextEnqueueStatus = 'successful';
  const result = await manager.downloadQuranAudio('android-fresh', 'https://audio.example/quran.mp3', 'lesson.mp3', () => {});
  const stored = records.get('android-fresh');
  assert.equal(stored.androidDownloadId, '701');
  assert.equal(stored.destinationUri, 'android-download://701');
  assert.equal(result.androidDownloadId, '701');
  assert.equal(result.sizeBytes, 1000);
  assert.deepEqual(finalizedCalls, ['701']);
  assert.equal(cancelCalls.length, 0);
});

test('Android app backgrounding detaches the JS observer without cancelling the system transfer', async () => {
  await manager.setQuranAudioAppActive(false);
  const previousStatusCalls = statusCalls;
  nextEnqueueStatus = 'running';
  const pausedObserver = await manager.downloadQuranAudio('android-background', 'https://audio.example/background.mp3', 'background.mp3', () => {});
  assert.equal(pausedObserver, null);
  const stored = records.get('android-background');
  assert.equal(stored.androidDownloadId, '702');
  assert.equal(statusCalls, previousStatusCalls, 'observer returns before polling when already backgrounded');
  assert.equal(cancelCalls.length, 0, 'backgrounding does not cancel the OS-managed request');

  await manager.setQuranAudioAppActive(true);
  statuses.set('702', { status: 'successful', bytesWritten: 1000, totalBytes: 1000, reason: 0 });
  const recovered = await manager.downloadQuranAudio('android-background', 'https://audio.example/background.mp3', 'background.mp3', () => {});
  assert.equal(recovered.androidDownloadId, '702');
  assert.equal(nativeIds.get('android-background'), '702', 'foreground recovery reattaches to the same native request');
});

test('cancelling an active Android download removes its system request and SQLite row', async () => {
  await manager.setQuranAudioAppActive(true);
  nextEnqueueStatus = 'running';
  const pending = manager.downloadQuranAudio('android-cancel', 'https://audio.example/cancel.mp3', 'cancel.mp3', () => {});
  pending.catch(() => undefined);
  for (let attempt = 0; attempt < 30 && !records.has('android-cancel'); attempt += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(records.get('android-cancel').androidDownloadId, '703');
  assert.equal(await manager.cancelQuranAudioDownload('android-cancel'), true);
  await assert.rejects(pending, /cancelled/i);
  assert.ok(cancelCalls.includes('703'));
  assert.equal(records.has('android-cancel'), false);
});

test('failed Android system transfers are cleaned and reported without treating them as completed audio', async () => {
  await manager.setQuranAudioAppActive(true);
  nextEnqueueStatus = 'failed';
  nextEnqueueReason = 404;
  await assert.rejects(
    manager.downloadQuranAudio('android-failed', 'https://audio.example/failed.mp3', 'failed.mp3', () => {}),
    /reason 404/,
  );
  assert.ok(cleanupCalls.includes('704'));
  assert.equal(records.has('android-failed'), false);
});


test('a native task with an old feed URL is cancelled before the refreshed item is queued', async () => {
  nativeIds.set('android-url-changed', '799');
  trackedMetadata.set('799', {
    trackId: 'android-url-changed', downloadId: '799',
    requestUrl: 'https://audio.example/old-version.mp3', fileName: 'old-version.mp3',
  });
  statuses.set('799', { status: 'running', bytesWritten: 250, totalBytes: 1000, reason: 0 });
  await manager.setQuranAudioAppActive(true);
  nextEnqueueStatus = 'successful';
  const result = await manager.downloadQuranAudio(
    'android-url-changed', 'https://audio.example/new-version.mp3', 'new-version.mp3', () => {},
  );
  assert.ok(cancelCalls.includes('799'));
  assert.equal(records.get('android-url-changed').requestUrl, 'https://audio.example/new-version.mp3');
  assert.equal(records.get('android-url-changed').androidDownloadId, '705');
  assert.equal(result.androidDownloadId, '705');
});

test('a task enqueued immediately before process death is reconciled from native metadata on launch', async () => {
  nativeIds.set('android-orphan', '706');
  trackedMetadata.set('706', {
    trackId: 'android-orphan', downloadId: '706',
    requestUrl: 'https://audio.example/orphan.mp3', fileName: 'orphan.mp3',
  });
  statuses.set('706', { status: 'running', bytesWritten: 345, totalBytes: 1000, reason: 0 });
  await manager.recoverOrphanedAndroidQuranDownloads([{
    id: 'android-orphan', uri: 'https://audio.example/orphan.mp3', fileName: 'orphan.mp3', localUri: null,
  }]);
  assert.equal(records.get('android-orphan').androidDownloadId, '706');
  assert.equal(records.get('android-orphan').bytesWritten, 345);
  assert.equal(records.get('android-orphan').totalBytes, 1000);
});

test('orphaned system records are cleaned when the Quran audio is already linked or no longer exists', async () => {
  nativeIds.set('android-linked', '707');
  trackedMetadata.set('707', { trackId: 'android-linked', downloadId: '707', requestUrl: 'https://audio.example/linked.mp3', fileName: 'linked.mp3' });
  statuses.set('707', { status: 'successful', bytesWritten: 1000, totalBytes: 1000, reason: 0 });
  await manager.recoverOrphanedAndroidQuranDownloads([{
    id: 'android-linked', uri: 'https://audio.example/linked.mp3', fileName: 'linked.mp3', localUri: 'file:///app/quran_library/linked.mp3',
  }]);
  assert.ok(cleanupCalls.includes('707'));
  assert.equal(records.has('android-linked'), false);
});

test('completed system requests can be explicitly cleaned after the SQLite catalog link succeeds', async () => {
  await manager.cleanupCompletedAndroidQuranDownload('701');
  assert.ok(cleanupCalls.includes('701'));
});
