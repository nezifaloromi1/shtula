import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch {
  for (const candidate of [process.env.TYPESCRIPT_PATH, '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript', '/usr/local/lib/node_modules/typescript'].filter(Boolean)) {
    try { ts = require(candidate); break; } catch { /* Continue to next TypeScript path. */ }
  }
}
if (!ts) throw new Error('TypeScript is required to test the transcript parser.');

const path = new URL('../src/features/transcripts/transcriptParser.ts', import.meta.url);
const source = readFileSync(path, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loadedModule = new Module(path.pathname);
loadedModule.filename = path.pathname;
loadedModule.paths = Module._nodeModulePaths(path.pathname);
loadedModule._compile(compiled, path.pathname);
const { parseTranscriptContent } = loadedModule.exports;

test('parses WebVTT cues and strips inline markup', () => {
  const parsed = parseTranscriptContent('WEBVTT\n\n00:00:01.000 --> 00:00:03.500\n<c.speaker>Hello &amp; welcome</c>\n\n00:00:04.000 --> 00:00:05.000\nNext line\n', 'text/vtt');
  assert.equal(parsed.cues.length, 2);
  assert.deepEqual(parsed.cues[0], { startSeconds: 1, endSeconds: 3.5, text: 'Hello & welcome' });
});

test('parses SubRip cues with comma decimal separators', () => {
  const parsed = parseTranscriptContent('1\n00:01:02,250 --> 00:01:04,000\nA timed subtitle\n\n', 'application/x-subrip');
  assert.equal(parsed.cues.length, 1);
  assert.equal(parsed.cues[0].startSeconds, 62.25);
  assert.equal(parsed.cues[0].endSeconds, 64);
});

test('parses JSON transcript arrays and orders cues by start time', () => {
  const parsed = parseTranscriptContent(JSON.stringify([
    { start: '00:00:05.000', end: '00:00:06.000', text: 'Second' },
    { start_time: 1, end_time: 2, content: 'First' },
  ]), 'application/json');
  assert.deepEqual(parsed.cues.map((cue) => cue.text), ['First', 'Second']);
});

test('falls back to readable plain text when no timed cues are available', () => {
  const parsed = parseTranscriptContent('<p>Transcript without timestamps</p>', 'text/html');
  assert.equal(parsed.cues.length, 0);
  assert.equal(parsed.plainText, 'Transcript without timestamps');
});
