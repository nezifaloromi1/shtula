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

const { buildCollectionShareMessage, encodeBase64Url } = loadTsModule('src/features/quran/services/episodeShare.ts');
const FEATURED_QURAN_FEED_URL = JSON.parse(fs.readFileSync('src/features/quran/config/feed.json', 'utf8')).feedUrl;

test('collection share uses Flutter-compatible unpadded UTF-8 base64url feed encoding', () => {
  const message = buildCollectionShareMessage('Sheikh Aadam Tuulaa', FEATURED_QURAN_FEED_URL);
  const encodedFeedUrl = encodeBase64Url(FEATURED_QURAN_FEED_URL);
  assert.equal(message, `Sheikh Aadam Tuulaa\n\nhttps://pod.link/${encodedFeedUrl}`);
  assert.doesNotMatch(encodedFeedUrl, /[=+/]/);
  assert.equal(buildCollectionShareMessage('  Tafsiira  ', '  https://example.org/feed.xml  '), `Tafsiira\n\nhttps://pod.link/${encodeBase64Url('https://example.org/feed.xml')}`);
  assert.equal(buildCollectionShareMessage('', '  '), '');
});

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { /* The real SQLite test is skipped on older Node versions. */ }

if (DatabaseSync) {
  test('bulk played-state update affects only the configured Google Drive collection', async () => {
    const nativeDb = new DatabaseSync(':memory:');
    const adapted = {
      async execAsync(sql) { nativeDb.exec(sql); },
      async runAsync(sql, ...params) { return nativeDb.prepare(sql).run(...params); },
      async getFirstAsync(sql, ...params) { return nativeDb.prepare(sql).get(...params) ?? null; },
      async getAllAsync(sql, ...params) { return nativeDb.prepare(sql).all(...params); },
    };
    const database = loadTsModule('src/storage/database.ts', (id) => {
      if (id === 'expo-sqlite') return { openDatabaseAsync: async () => adapted };
      throw new Error(`Unexpected database dependency: ${id}`);
    });

    await database.initializeDatabase();
    const insert = nativeDb.prepare(`
      INSERT INTO quran_audio (id, title, artist, uri, file_name, added_at, source_type, is_played)
      VALUES (?, ?, 'Sheikh Aadam Tuulaa', ?, ?, 1, ?, ?)
    `);
    insert.run('feed-1', 'Feed lesson 1', 'https://example.org/1.mp3', '1.mp3', 'featured-google-drive', 0);
    insert.run('feed-2', 'Feed lesson 2', 'https://example.org/2.mp3', '2.mp3', 'featured-google-drive', 1);
    insert.run('local-1', 'Imported local file', 'file:///private/local.mp3', 'local.mp3', 'local', 0);

    await database.setAllFeaturedQuranTracksPlayed(true);
    let rows = nativeDb.prepare('SELECT id, is_played FROM quran_audio ORDER BY id').all();
    assert.deepEqual(rows.map((row) => [row.id, row.is_played]), [
      ['feed-1', 1], ['feed-2', 1], ['local-1', 0],
    ]);

    await database.setAllFeaturedQuranTracksPlayed(false);
    rows = nativeDb.prepare('SELECT id, is_played FROM quran_audio ORDER BY id').all();
    assert.deepEqual(rows.map((row) => [row.id, row.is_played]), [
      ['feed-1', 0], ['feed-2', 0], ['local-1', 0],
    ]);
    nativeDb.close();
  });
} else {
  test('bulk played-state SQLite integration (requires Node.js node:sqlite)', { skip: 'Use Node.js 22.5+ to run this integration test.' }, () => {});
}

test('Tafsiira exposes collection menu actions and persists played-state changes before updating UI', () => {
  const screen = fs.readFileSync('src/features/tafsiira/TafsiiraScreen.tsx', 'utf8');
  const sheet = fs.readFileSync('src/features/quran/components/QuranCollectionActionsSheet.tsx', 'utf8');
  const provider = fs.readFileSync('src/features/quran/state/QuranLibraryProvider.tsx', 'utf8');
  assert.match(screen, /QuranCollectionActionsSheet/);
  assert.match(screen, /Share\.share\(/);
  assert.match(screen, /buildCollectionShareMessage\(feedConfig\.artist, FEATURED_QURAN_FEED_URL\)/);
  assert.match(screen, /onMarkAllPlayed=\{\(\) => void updateAllPlayedState\(true\)\}/);
  assert.match(screen, /onMarkAllUnplayed=\{\(\) => void updateAllPlayedState\(false\)\}/);
  assert.match(screen, /onRefresh=\{\(\) => void refreshFeed\(\)\}/);
  assert.match(sheet, /t\('mark_episodes_played_label'\)/);
  assert.match(sheet, /t\('mark_episodes_not_played_label'\)/);
  assert.match(sheet, /t\('refresh_feed_label'\)/);
  assert.match(sheet, /t\('share_quran_collection_label'\)/);
  assert.match(provider, /await setAllFeaturedQuranTracksPlayed\(played\)/);
  assert.match(provider, /track\.sourceType === 'featured-google-drive'/);
});
