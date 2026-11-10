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
if (!ts) throw new Error('TypeScript is required to run this test.');

const source = fs.readFileSync(path.resolve('src/features/quran/services/layoutPolicy.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));
const module = { exports: {} };
new Function('module', 'exports', compiled.outputText)(module, module.exports);
const { normalizeLayoutMode, normalizeLayoutOrder, sortQuranTracks, findNewFeedIds } = module.exports;

const track = (id, { title = id, publishedAt = 0, addedAt = 0, isPlayed = false, sourceType = 'featured-google-drive' } = {}) => ({
  id, title, publishedAt, addedAt, isPlayed, sourceType,
});

const items = [
  track('zulu', { title: 'Zulu', publishedAt: 100, addedAt: 20 }),
  track('alpha', { title: 'Alpha', publishedAt: 300, addedAt: 10, isPlayed: true }),
  track('beta', { title: 'Beta', publishedAt: 200, addedAt: 30 }),
  track('local', { title: 'Local file', sourceType: 'local', addedAt: 40 }),
];

test('layout mode and sort preferences normalize unsupported legacy values', () => {
  assert.equal(normalizeLayoutMode(0), 0);
  assert.equal(normalizeLayoutMode(1), 1);
  assert.equal(normalizeLayoutMode(2), 2);
  assert.equal(normalizeLayoutMode(9), 0);
  assert.equal(normalizeLayoutOrder('followed'), 'followed');
  assert.equal(normalizeLayoutOrder('unknown'), 'alphabetical');
});

test('alphabetical order sorts case-insensitively without mutating the source array', () => {
  const sorted = sortQuranTracks(items, 'alphabetical');
  assert.deepEqual(sorted.map((item) => item.id), ['alpha', 'beta', 'local', 'zulu']);
  assert.deepEqual(items.map((item) => item.id), ['zulu', 'alpha', 'beta', 'local']);
});

test('followed order shows most recently added items first', () => {
  assert.deepEqual(sortQuranTracks(items, 'followed').map((item) => item.id), ['local', 'beta', 'zulu', 'alpha']);
});

test('unplayed order puts unplayed items before completed items', () => {
  assert.deepEqual(sortQuranTracks(items, 'unplayed').map((item) => item.id), ['beta', 'zulu', 'local', 'alpha']);
});

test('latest episode order follows publication timestamps', () => {
  assert.deepEqual(sortQuranTracks(items, 'episodes').map((item) => item.id), ['alpha', 'beta', 'zulu', 'local']);
});

test('new episode detection only flags incoming items absent from a prior feed cache', () => {
  const incoming = [track('alpha'), track('new-one'), track('new-two', { sourceType: 'local' })];
  assert.deepEqual(findNewFeedIds(new Set(), incoming), []);
  assert.deepEqual(findNewFeedIds(new Set(['alpha']), incoming), ['new-one']);
});
