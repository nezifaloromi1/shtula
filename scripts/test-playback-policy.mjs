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

const source = fs.readFileSync(path.resolve('src/app/providers/playbackPolicy.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));
const module = { exports: {} };
new Function('module', 'exports', compiled.outputText)(module, module.exports);
const { findNextUnplayedFeaturedTrack } = module.exports;

const makeTrack = (id, publishedAt, isPlayed = false, sourceType = 'featured-google-drive') => ({
  id, sourceType, publishedAt, isPlayed,
});

test('continuous play picks the next unplayed older feed entry, not an alphabetical neighbor', () => {
  const current = makeTrack('current', 300);
  const tracks = [makeTrack('z-title', 100), makeTrack('current', 300), makeTrack('middle-played', 250, true), makeTrack('middle-next', 200), makeTrack('newest', 400)];
  assert.equal(findNextUnplayedFeaturedTrack(current, tracks)?.id, 'middle-next');
});

test('continuous play does not wrap to a newer item after the oldest lesson', () => {
  const current = makeTrack('oldest', 100);
  const tracks = [makeTrack('newest', 300), makeTrack('oldest', 100)];
  assert.equal(findNextUnplayedFeaturedTrack(current, tracks), null);
});

test('local audio is not treated as a Quran feed continuation', () => {
  const current = makeTrack('current', 200);
  const tracks = [current, makeTrack('local', 100, false, 'local')];
  assert.equal(findNextUnplayedFeaturedTrack(current, tracks), null);
});

test('missing current feed item does not select an unrelated lesson', () => {
  const current = makeTrack('not-in-catalog', 200);
  assert.equal(findNextUnplayedFeaturedTrack(current, [makeTrack('another', 100)]), null);
});
