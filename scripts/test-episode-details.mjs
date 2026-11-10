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

function loadTsModule(relativePath) {
  const source = fs.readFileSync(path.resolve(relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  new Function('module', 'exports', compiled.outputText)(module, module.exports);
  return module.exports;
}

const { encodeBase64Url, buildEpisodeShareMessage } = loadTsModule('src/features/quran/services/episodeShare.ts');
const { htmlToReadableText } = loadTsModule('src/features/quran/services/episodeDescription.ts');

test('episode share links use the same unpadded UTF-8 base64url form as the original Flutter app', () => {
  assert.equal(encodeBase64Url('sheikh-aadam-tuulaa'), 'c2hlaWtoLWFhZGFtLXR1dWxhYQ');
  assert.equal(encodeBase64Url('guid-123'), 'Z3VpZC0xMjM');
  assert.equal(encodeBase64Url('ሰላም-abc'), '4Yiw4YiL4YidLWFiYw');
  const message = buildEpisodeShareMessage({ title: 'Lesson 1', sourceGuid: 'guid-123' });
  assert.equal(message, 'Lesson 1\n\nhttps://pod.link/c2hlaWtoLWFhZGFtLXR1dWxhYQ/episode/Z3VpZC0xMjM');
});

test('episode descriptions become readable text without retaining script or style content', () => {
  const value = '<h2>Lesson</h2><p>Read &amp; reflect</p><ul><li>First</li><li>Second</li></ul><script>alert(1)</script><style>.x{}</style>';
  assert.equal(htmlToReadableText(value), 'Lesson\nRead & reflect\n• First\n• Second');
});

test('episode description decoder preserves malformed numeric entities instead of throwing', () => {
  assert.equal(htmlToReadableText('A &#x110000; B &#-1; C'), 'A &#x110000; B &#-1; C');
});
