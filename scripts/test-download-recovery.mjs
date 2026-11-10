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

const files = new Map();
const records = new Map();
const tasks = [];

class FakeDirectory {
  constructor(base, ...parts) {
    this.uri = `${String(base).replace(/\/$/, '')}/${parts.join('/')}`.replace(/\/$/, '');
  }
  get exists() { return true; }
  create() {}
}

class FakeFile {
  constructor(base, ...parts) {
    this.uri = base instanceof FakeDirectory ? `${base.uri}/${parts.join('/')}` : String(base);
    this.name = this.uri.split('/').pop();
  }
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri)?.size ?? 0; }
  get type() { return files.get(this.uri)?.type ?? 'audio/mpeg'; }
  delete() { files.delete(this.uri); }
}

class FakeDownloadTask {
  static restored = 0;
  constructor(url, destination, options) {
    this.url = url;
    this.destination = destination;
    this.options = options;
    this.state = 'idle';
    this.promiseResolve = null;
    this.promiseReject = null;
    tasks.push(this);
  }
  static fromSavable(state, options) {
    FakeDownloadTask.restored += 1;
    const task = new FakeDownloadTask(state.url, new FakeFile(state.fileUri), options);
    task.state = 'paused';
    task.resumeData = state.resumeData;
    return task;
  }
  downloadAsync() {
    this.state = 'active';
    return new Promise((resolve, reject) => { this.promiseResolve = resolve; this.promiseReject = reject; });
  }
  resumeAsync() {
    this.state = 'active';
    return new Promise((resolve, reject) => { this.promiseResolve = resolve; this.promiseReject = reject; });
  }
  async pauseAsync() {
    this.state = 'paused';
    this.promiseResolve?.(null);
  }
  savable() {
    return { url: this.url, fileUri: this.destination.uri, isDirectory: false }; 
  }
  cancel() {
    this.state = 'cancelled';
    this.promiseReject?.(new Error('cancelled'));
  }
  release() {}
  progress(bytesWritten, totalBytes) {
    files.set(this.destination.uri, { size: bytesWritten, type: 'audio/mpeg' });
    this.options.onProgress?.({ bytesWritten, totalBytes });
  }
  fail(error = new Error('network unavailable')) {
    this.state = 'error';
    this.promiseReject?.(error);
  }
  complete(size = 4096) {
    files.set(this.destination.uri, { size, type: 'audio/mpeg' });
    this.state = 'completed';
    this.promiseResolve?.(this.destination);
  }
}

const database = {
  async saveAudioDownload(input) { records.set(input.trackId, { ...input, updatedAt: Date.now() }); },
  async updateAudioDownloadProgress(trackId, bytesWritten, totalBytes) {
    const current = records.get(trackId);
    if (current) records.set(trackId, { ...current, bytesWritten, totalBytes });
  },
  async saveAudioDownloadResumeState(trackId, resumeState, bytesWritten, totalBytes) {
    const current = records.get(trackId);
    if (current) records.set(trackId, { ...current, resumeState, bytesWritten, totalBytes });
  },
  async listPendingAudioDownloads() { return [...records.values()]; },
  async clearAudioDownload(trackId) { records.delete(trackId); },
};

const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputText)((id) => {
  if (id === 'react-native') return { Platform: { OS: 'ios' } };
  if (id === '../../../../modules/sheademtula-android-downloads') return { default: {}, isAndroidDownloadManagerAvailable: () => false };
  if (id === '../../../../modules/sheademtula-ios-downloads') return {
    default: {
      enqueue: async () => { throw new Error('iOS background URLSession is disabled in this FileSystem fallback test.'); },
      listTrackedDownloads: async () => [],
      getStatus: async () => ({ status: 'missing', bytesWritten: 0, totalBytes: -1 }),
      finalizeDownload: async () => { throw new Error('No native iOS download is available in this test.'); },
      cancel: async () => true,
      cleanup: async () => true,
    },
    isIOSBackgroundDownloadsAvailable: () => false,
  };
  if (id === 'expo-file-system') return {
    Directory: FakeDirectory,
    File: Object.assign(FakeFile, {
      createDownloadTask(url, destination, options) { return new FakeDownloadTask(url, destination, options); },
    }),
    DownloadTask: FakeDownloadTask,
  };
  if (id === '../../../../modules/sheademtula-local-library') return { default: { getLibraryDirectory: () => 'file:///app/quran_library' } };
  if (id === '@/storage/database') return database;
  throw new Error(`Unexpected dependency: ${id}`);
}, module, module.exports);
const manager = module.exports;

async function startDownload(run) {
  const previousTaskCount = tasks.length;
  const promise = run();
  for (let attempts = 0; attempts < 30; attempts += 1) {
    const task = tasks.at(-1);
    if (tasks.length > previousTaskCount && task?.state === 'active') return { task, promise };
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('download task should be created and enter the active state');
}

test('fresh downloads persist request and destination metadata before transfer', async () => {
  await manager.setQuranAudioAppActive(true);
  const { task, promise } = await startDownload(() => manager.downloadQuranAudio('fresh', 'https://example.org/quran.mp3', 'lesson.mp3', () => {}));
  assert.equal(task.options.sessionType, 'foreground');
  assert.equal(records.get('fresh').requestUrl, 'https://example.org/quran.mp3');
  assert.equal(records.get('fresh').resumeState, null);
  task.complete(8192);
  assert.deepEqual(await promise, {
    uri: task.destination.uri,
    fileName: 'lesson.mp3',
    sizeBytes: 8192,
  });
  assert.equal(records.get('fresh').bytesWritten, 8192, 'completed file size is checkpointed until the catalog row is linked');
});

test('background transition saves a resume state and foreground resumes the same destination', async () => {
  await manager.setQuranAudioAppActive(true);
  const first = await startDownload(() => manager.downloadQuranAudio('resume', 'https://example.org/resume.mp3', 'resume.mp3', () => {}));
  await manager.setQuranAudioAppActive(false);
  assert.equal(await first.promise, null, 'pause resolves the foreground transfer without treating it as failure');
  const saved = records.get('resume');
  assert.equal(saved.resumeState.isDirectory, false, 'the platform pause state is stored without assuming optional resumeData exists');
  assert.equal(saved.destinationUri, first.task.destination.uri);

  await manager.setQuranAudioAppActive(true);
  const resumed = await startDownload(() => manager.downloadQuranAudio('resume', 'https://example.org/resume.mp3', 'resume.mp3', () => {}));
  assert.equal(FakeDownloadTask.restored, 1);
  assert.equal(resumed.task.destination.uri, saved.destinationUri);
  resumed.task.complete(16384);
  const result = await resumed.promise;
  assert.equal(result.sizeBytes, 16384);
});


test('a transient failure while resuming retains the saved checkpoint and partial file for retry', async () => {
  await manager.setQuranAudioAppActive(true);
  const initial = await startDownload(() => manager.downloadQuranAudio('retry', 'https://example.org/retry.mp3', 'retry.mp3', () => {}));
  initial.task.progress(256, 2048);
  await manager.setQuranAudioAppActive(false);
  await initial.promise;
  const saved = records.get('retry');
  assert.ok(saved.resumeState);
  assert.ok(files.has(saved.destinationUri));

  await manager.setQuranAudioAppActive(true);
  const resumed = await startDownload(() => manager.downloadQuranAudio('retry', 'https://example.org/retry.mp3', 'retry.mp3', () => {}));
  resumed.task.fail(new Error('temporary network failure'));
  await assert.rejects(resumed.promise, /temporary network failure/);
  assert.equal(records.get('retry').destinationUri, saved.destinationUri);
  assert.ok(records.get('retry').resumeState);
  assert.ok(files.has(saved.destinationUri), 'partial bytes are retained for the saved resume state');

  const retried = await startDownload(() => manager.downloadQuranAudio('retry', 'https://example.org/retry.mp3', 'retry.mp3', () => {}));
  assert.equal(retried.task.destination.uri, saved.destinationUri);
  retried.task.complete(2048);
  assert.equal((await retried.promise).sizeBytes, 2048);
});

test('a pending download with no usable resume state restarts instead of trusting a partial file', async () => {
  await manager.setQuranAudioAppActive(true);
  records.set('stale', {
    trackId: 'stale', requestUrl: 'https://example.org/stale.mp3',
    destinationUri: 'file:///app/quran_library/stale.mp3', fileName: 'stale.mp3',
    bytesWritten: 200, totalBytes: 1000, resumeState: null, updatedAt: Date.now(),
  });
  files.set('file:///app/quran_library/stale.mp3', { size: 200, type: 'audio/mpeg' });
  const { task, promise } = await startDownload(() => manager.downloadQuranAudio('stale', 'https://example.org/stale.mp3', 'stale.mp3', () => {}));
  assert.equal(files.has('file:///app/quran_library/stale.mp3'), false, 'partial data is discarded before restart');
  task.complete(1000);
  await promise;
});

test('a completed file is recovered when the app stopped before linking it into the catalog', async () => {
  await manager.setQuranAudioAppActive(true);
  const uri = 'file:///app/quran_library/already-finished.mp3';
  records.set('finished', {
    trackId: 'finished', requestUrl: 'https://example.org/finished.mp3', destinationUri: uri,
    fileName: 'already-finished.mp3', bytesWritten: 4096, totalBytes: 4096, resumeState: null, updatedAt: Date.now(),
  });
  files.set(uri, { size: 4096, type: 'audio/mpeg' });
  const taskCountBefore = tasks.length;
  const result = await manager.downloadQuranAudio('finished', 'https://example.org/finished.mp3', 'already-finished.mp3', () => {});
  assert.deepEqual(result, { uri, fileName: 'already-finished.mp3', sizeBytes: 4096 });
  assert.equal(tasks.length, taskCountBefore, 'a complete file must not be downloaded again');
});

test('cancel removes a saved paused transfer and its partial file', async () => {
  const uri = 'file:///app/quran_library/cancel.mp3';
  records.set('cancel', {
    trackId: 'cancel', requestUrl: 'https://example.org/cancel.mp3', destinationUri: uri,
    fileName: 'cancel.mp3', bytesWritten: 10, totalBytes: 100, resumeState: null, updatedAt: Date.now(),
  });
  files.set(uri, { size: 10, type: 'audio/mpeg' });
  assert.equal(await manager.cancelQuranAudioDownload('cancel'), true);
  assert.equal(records.has('cancel'), false);
  assert.equal(files.has(uri), false);
});
