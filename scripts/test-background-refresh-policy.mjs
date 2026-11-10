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
if (!ts) throw new Error('TypeScript is required to run this test.');

function loadTsModule(relativePath, mockedRequire = () => { throw new Error('Unexpected import'); }) {
  const source = fs.readFileSync(path.resolve(relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(mockedRequire, module, module.exports);
  return module.exports;
}

const refreshPolicy = loadTsModule('src/features/quran/services/refreshPolicy.ts');
const layoutPolicy = loadTsModule('src/features/quran/services/layoutPolicy.ts');
const policy = loadTsModule('src/features/quran/services/backgroundRefreshPolicy.ts', (id) => {
  if (id === './layoutPolicy') return layoutPolicy;
  if (id === './refreshPolicy') return refreshPolicy;
  throw new Error(`Unexpected dependency: ${id}`);
});

const sample = (id) => ({
  id,
  sourceType: 'featured-google-drive',
  title: id,
  artist: 'Sheikh Aadam Tuulaa',
  uri: `https://audio.example/${id}.mp3`,
  localUri: null,
  fileName: `${id}.mp3`,
  mimeType: 'audio/mpeg',
  sizeBytes: 0,
  durationMs: 0,
  lastPositionMs: 0,
  isPlayed: false,
  addedAt: 100,
  description: null,
  imageUrl: null,
  publishedAt: 100,
  chaptersUrl: null,
  transcriptUrl: null,
  chapters: [],
});

const enabled = {
  backgroundRefreshEnabled: true,
  backgroundRefreshOnMobileData: false,
  backgroundRefreshNotifications: true,
  autoUpdatePeriodMinutes: 60,
};

function createDependencies(overrides = {}) {
  const state = {
    tracks: [sample('old')],
    lastRefreshAt: 1_000,
    network: { isConnected: true, isInternetReachable: true, type: 'WIFI' },
    upserted: [],
    savedRefreshAt: [],
    savedNewTrackIds: [],
    newTrackIds: ['previous-new'],
    notificationsStarted: [],
    notificationsFinished: [],
    feed: [sample('old'), sample('new')],
  };
  const dependencies = {
    async getNetworkState() { return state.network; },
    async listTracks() { return state.tracks; },
    async getLastRefreshAt() { return state.lastRefreshAt; },
    async getNewTrackIds() { return state.newTrackIds; },
    async setNewTrackIds(ids) { state.savedNewTrackIds.push(ids); state.newTrackIds = ids; },
    async loadFeed() { return state.feed; },
    async upsertTrack(track) { state.upserted.push(track.id); },
    async setLastRefreshAt(timestamp) { state.savedRefreshAt.push(timestamp); state.lastRefreshAt = timestamp; },
    async beginRefreshNotification() { state.notificationsStarted.push('refresh-1'); return 'refresh-1'; },
    async finishRefreshNotification(id) { state.notificationsFinished.push(id); },
    now: () => 100_000_000,
    ...overrides,
  };
  return { state, dependencies };
}

test('background interval respects disabled mode and Android minimum interval', () => {
  assert.equal(policy.backgroundRefreshIntervalMinutes(-1), null);
  assert.equal(policy.backgroundRefreshIntervalMinutes(0), 15);
  assert.equal(policy.backgroundRefreshIntervalMinutes(10), 15); // WorkManager floor, even when the foreground interval is 10 min
  assert.equal(policy.backgroundRefreshIntervalMinutes(30), 30);
  assert.equal(policy.backgroundRefreshIntervalMinutes(17), 180); // unsupported app interval normalizes to the three-hour default
  assert.equal(policy.backgroundRefreshIntervalMinutes(60), 60);
  assert.equal(policy.backgroundRefreshIntervalMinutes(2880), 2880);
});

test('mobile-data preference blocks cellular but permits Wi-Fi and disconnected states are blocked', () => {
  assert.equal(policy.isBackgroundRefreshNetworkAllowed({ isConnected: true, type: 'CELLULAR' }, false), false);
  assert.equal(policy.isBackgroundRefreshNetworkAllowed({ isConnected: true, type: 'CELLULAR' }, true), true);
  assert.equal(policy.isBackgroundRefreshNetworkAllowed({ isConnected: true, type: 'WIFI' }, false), true);
  assert.equal(policy.isBackgroundRefreshNetworkAllowed({ isConnected: true, type: 'ETHERNET' }, true), false);
  assert.equal(policy.isBackgroundRefreshNetworkAllowed({ isConnected: true, type: 'UNKNOWN' }, true), false);
  assert.equal(policy.isBackgroundRefreshNetworkAllowed({ isConnected: false, type: 'WIFI' }, true), false);
  assert.equal(policy.isBackgroundRefreshNetworkAllowed({ isConnected: true, isInternetReachable: false, type: 'WIFI' }, false), false);
});

test('disabled background refresh does not inspect network or fetch', async () => {
  const { state, dependencies } = createDependencies();
  const result = await policy.performBackgroundQuranRefresh({ ...enabled, backgroundRefreshEnabled: false }, dependencies);
  assert.deepEqual(result, { status: 'disabled', newTrackCount: 0 });
  assert.deepEqual(state.upserted, []);
  assert.deepEqual(state.savedRefreshAt, []);
});

test('cellular data is skipped without updating last-refresh timestamp', async () => {
  const { state, dependencies } = createDependencies();
  state.network = { isConnected: true, isInternetReachable: true, type: 'CELLULAR' };
  const result = await policy.performBackgroundQuranRefresh(enabled, dependencies);
  assert.deepEqual(result, { status: 'network-unavailable', newTrackCount: 0 });
  assert.deepEqual(state.upserted, []);
  assert.deepEqual(state.savedRefreshAt, []);
});

test('not-due background task does not load feed or update timestamp', async () => {
  const { state, dependencies } = createDependencies({ now: () => 10_000 });
  state.lastRefreshAt = 9_000;
  const result = await policy.performBackgroundQuranRefresh(enabled, dependencies);
  assert.deepEqual(result, { status: 'not-due', newTrackCount: 0 });
  assert.deepEqual(state.upserted, []);
  assert.deepEqual(state.savedRefreshAt, []);
});

test('successful refresh persists every item and brackets the feed update with a progress notification', async () => {
  const { state, dependencies } = createDependencies();
  const result = await policy.performBackgroundQuranRefresh(enabled, dependencies);
  assert.deepEqual(result, { status: 'updated', newTrackCount: 1 });
  assert.deepEqual(state.upserted, ['old', 'new']);
  assert.deepEqual(state.savedRefreshAt, [100_000_000]);
  assert.deepEqual(state.savedNewTrackIds, [['previous-new', 'new']]);
  assert.deepEqual(state.notificationsStarted, ['refresh-1']);
  assert.deepEqual(state.notificationsFinished, ['refresh-1']);
});

test('first feed population still brackets refresh but does not flag every item as new', async () => {
  const { state, dependencies } = createDependencies();
  state.tracks = [];
  const result = await policy.performBackgroundQuranRefresh(enabled, dependencies);
  assert.deepEqual(result, { status: 'updated', newTrackCount: 0 });
  assert.deepEqual(state.savedNewTrackIds, []);
  assert.deepEqual(state.notificationsStarted, ['refresh-1']);
  assert.deepEqual(state.notificationsFinished, ['refresh-1']);
});

test('notification permission failure does not fail the successful feed refresh', async () => {
  const { state, dependencies } = createDependencies({ async beginRefreshNotification() { throw new Error('permission denied'); } });
  const result = await policy.performBackgroundQuranRefresh(enabled, dependencies);
  assert.deepEqual(result, { status: 'updated', newTrackCount: 1 });
  assert.deepEqual(state.savedRefreshAt, [100_000_000]);
  assert.deepEqual(state.notificationsFinished, []);
});

test('progress notification is removed after a feed failure', async () => {
  const { state, dependencies } = createDependencies({ async loadFeed() { throw new Error('network interrupted'); } });
  await assert.rejects(policy.performBackgroundQuranRefresh(enabled, dependencies), /network interrupted/);
  assert.deepEqual(state.notificationsStarted, ['refresh-1']);
  assert.deepEqual(state.notificationsFinished, ['refresh-1']);
});

test('notification cleanup failure does not fail an already committed feed refresh', async () => {
  const { state, dependencies } = createDependencies({ async finishRefreshNotification() { throw new Error('notification service unavailable'); } });
  const result = await policy.performBackgroundQuranRefresh(enabled, dependencies);
  assert.deepEqual(result, { status: 'updated', newTrackCount: 1 });
  assert.deepEqual(state.savedRefreshAt, [100_000_000]);
});

test('disabled notification preference does not create progress notifications', async () => {
  const { state, dependencies } = createDependencies();
  const result = await policy.performBackgroundQuranRefresh({ ...enabled, backgroundRefreshNotifications: false }, dependencies);
  assert.deepEqual(result, { status: 'updated', newTrackCount: 1 });
  assert.deepEqual(state.notificationsStarted, []);
  assert.deepEqual(state.notificationsFinished, []);
});

test('background task checks the stored settings and registers at module scope', () => {
  const service = fs.readFileSync('src/features/quran/services/backgroundQuranRefresh.ts', 'utf8');
  const entry = fs.readFileSync('index.ts', 'utf8');
  const provider = fs.readFileSync('src/features/quran/state/QuranLibraryProvider.tsx', 'utf8');
  assert.match(service, /TaskManager\.defineTask\(BACKGROUND_QURAN_REFRESH_TASK, executeBackgroundRefresh\)/);
  assert.match(entry, /backgroundQuranRefresh/);
  assert.match(service, /initializeDatabase\(\)/);
  assert.match(service, /readSetting<StoredPreferences>\('preferences'/);
  assert.match(service, /getNewTrackIds: \(\) => readSetting<string\[]>\('newFeaturedTrackIds'/);
  assert.match(service, /setNewTrackIds: \(ids\) => writeSetting\('newFeaturedTrackIds', ids\)/);
  assert.match(service, /beginRefreshNotification: \(\) => beginQuranRefreshStatusNotification/);
  assert.match(service, /finishRefreshNotification: finishQuranRefreshStatusNotification/);
  assert.match(service, /dismissNotificationAsync\(identifier\)/);
  assert.match(service, /trigger: Platform\.OS === 'android' \? \{ channelId: NOTIFICATION_CHANNEL_ID \} : null/);
  assert.match(provider, /readSetting<string\[]>\('newFeaturedTrackIds'/);
  assert.match(provider, /synchronizeBackgroundQuranRefresh\(next\)/);
});
