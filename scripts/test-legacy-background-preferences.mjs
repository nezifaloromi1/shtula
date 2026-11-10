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

const displayPreferences = loadTsModule('src/features/quran/services/legacyDisplayPreferences.ts', (id) => {
  if (id === './layoutPolicy') return loadTsModule('src/features/quran/services/layoutPolicy.ts');
  throw new Error(`Unexpected dependency: ${id}`);
});
const mapper = loadTsModule('src/features/quran/services/legacyBackgroundPreferences.ts', (id) => {
  if (id === './legacyDisplayPreferences') return displayPreferences;
  throw new Error(`Unexpected dependency: ${id}`);
});

const defaults = {
  backgroundRefreshEnabled: false,
  backgroundRefreshOnMobileData: false,
  backgroundRefreshNotifications: false,
};

test('legacy background settings map exact Flutter preference keys', () => {
  assert.deepEqual(mapper.mapLegacyBackgroundPreferences(defaults, {
    backgroundUpdate: true,
    backgroundUpdateMobileData: true,
    updateNotification: true,
  }), {
    backgroundRefreshEnabled: true,
    backgroundRefreshOnMobileData: true,
    backgroundRefreshNotifications: true,
  });
});

test('legacy string and numeric booleans are normalized', () => {
  assert.deepEqual(mapper.mapLegacyBackgroundPreferences(defaults, {
    backgroundUpdate: 'true',
    backgroundUpdateMobileData: 0,
    updateNotification: '1',
  }), {
    backgroundRefreshEnabled: true,
    backgroundRefreshOnMobileData: false,
    backgroundRefreshNotifications: true,
  });
});

test('malformed legacy values preserve existing settings', () => {
  const current = {
    backgroundRefreshEnabled: true,
    backgroundRefreshOnMobileData: false,
    backgroundRefreshNotifications: true,
  };
  assert.deepEqual(mapper.mapLegacyBackgroundPreferences(current, {
    backgroundUpdate: 'perhaps',
    backgroundUpdateMobileData: null,
    updateNotification: {},
  }), current);
});

test('provider migrates background preferences at schema preference migration version five', () => {
  const provider = fs.readFileSync('src/features/quran/state/QuranLibraryProvider.tsx', 'utf8');
  assert.match(provider, /preferencesMigrationVersion < 5/);
  assert.match(provider, /mapLegacyBackgroundPreferences\(nextSettings, legacyValues\)/);
  assert.match(provider, /writeSetting\('legacyPreferencesMigrationVersion', 5\)/);
});
