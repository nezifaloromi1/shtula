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

const sourcePath = path.resolve('src/features/quran/services/refreshPolicy.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));
const module = { exports: {} };
new Function('module', 'exports', compiled.outputText)(module, module.exports);
const { normalizeRefreshPeriod, shouldRefreshQuranFeed } = module.exports;

test('a first launch fetches the configured Quran feed even with automatic refresh disabled', () => {
  assert.equal(shouldRefreshQuranFeed({ hasCachedFeaturedItems: false, lastRefreshAt: 0, periodMinutes: -1, now: 1_000_000 }), true);
});

test('Never disables refresh once the feed has been cached', () => {
  assert.equal(shouldRefreshQuranFeed({ hasCachedFeaturedItems: true, lastRefreshAt: 1_000, periodMinutes: -1, now: 999_000_000 }), false);
});

test('Always refreshes every eligible foreground', () => {
  assert.equal(shouldRefreshQuranFeed({ hasCachedFeaturedItems: true, lastRefreshAt: 999_000, periodMinutes: 0, now: 1_000_000 }), true);
});

test('ten- and thirty-minute Flutter intervals remain supported', () => {
  assert.equal(normalizeRefreshPeriod(10), 10);
  assert.equal(normalizeRefreshPeriod(30), 30);
  assert.equal(shouldRefreshQuranFeed({ hasCachedFeaturedItems: true, lastRefreshAt: 1_000, periodMinutes: 10, now: 600_999 }), false);
  assert.equal(shouldRefreshQuranFeed({ hasCachedFeaturedItems: true, lastRefreshAt: 1_000, periodMinutes: 10, now: 601_000 }), true);
});

test('three-hour refresh remains deferred until the interval expires', () => {
  const lastRefreshAt = 5_000_000;
  assert.equal(shouldRefreshQuranFeed({ hasCachedFeaturedItems: true, lastRefreshAt, periodMinutes: 180, now: lastRefreshAt + 179 * 60_000 }), false);
  assert.equal(shouldRefreshQuranFeed({ hasCachedFeaturedItems: true, lastRefreshAt, periodMinutes: 180, now: lastRefreshAt + 180 * 60_000 }), true);
});

test('unsupported periods normalize to the original three-hour default', () => {
  assert.equal(normalizeRefreshPeriod(17), 180);
  assert.equal(normalizeRefreshPeriod(60), 60);
});
