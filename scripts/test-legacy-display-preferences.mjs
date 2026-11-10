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

function compileModule(relativePath, dependencies = {}) {
  const fullPath = path.resolve(relativePath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  const mockRequire = (id) => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency in test module: ${id}`);
  };
  new Function('require', 'module', 'exports', compiled.outputText)(mockRequire, module, module.exports);
  return module.exports;
}

const layoutPolicy = compileModule('src/features/quran/services/layoutPolicy.ts');
const preferences = compileModule('src/features/quran/services/legacyDisplayPreferences.ts', {
  './layoutPolicy': layoutPolicy,
});

const defaults = {
  autoOpenNowPlaying: false,
  layoutMode: 0,
  layoutOrder: 'alphabetical',
  layoutHighlight: false,
  layoutCount: false,
};

test('maps the original Flutter SharedPreferences keys and values', () => {
  assert.deepEqual(preferences.mapLegacyDisplayPreferences(defaults, {
    autoopennowplaying: true,
    layout: 2,
    layoutOrder: 'unplayed',
    layoutHighlight: true,
    layoutCount: true,
  }), {
    autoOpenNowPlaying: true,
    layoutMode: 2,
    layoutOrder: 'unplayed',
    layoutHighlight: true,
    layoutCount: true,
  });
});

test('converts Flutter integer booleans and numeric strings safely', () => {
  assert.deepEqual(preferences.mapLegacyDisplayPreferences(defaults, {
    autoopennowplaying: 1,
    layout: '1',
    layoutOrder: 'followed',
    layoutHighlight: 0,
    layoutCount: 'true',
  }), {
    autoOpenNowPlaying: true,
    layoutMode: 1,
    layoutOrder: 'followed',
    layoutHighlight: false,
    layoutCount: true,
  });
});

test('invalid legacy values preserve current valid preferences', () => {
  const current = { ...defaults, autoOpenNowPlaying: true, layoutMode: 2, layoutOrder: 'episodes', layoutHighlight: true, layoutCount: true };
  assert.deepEqual(preferences.mapLegacyDisplayPreferences(current, {
    autoopennowplaying: 'not-a-boolean',
    layout: 8,
    layoutOrder: 'unknown',
    layoutHighlight: 'not-a-boolean',
    layoutCount: null,
  }), {
    autoOpenNowPlaying: true,
    layoutMode: 2,
    layoutOrder: 'episodes',
    layoutHighlight: true,
    layoutCount: true,
  });
});

test('only accepted boolean representations are enabled', () => {
  const values = { enabled: 'YES', disabled: 'false', truthy: 0, numeric: 1 };
  assert.equal(preferences.readLegacyBoolean(values, 'enabled', false), true);
  assert.equal(preferences.readLegacyBoolean(values, 'disabled', true), false);
  assert.equal(preferences.readLegacyBoolean(values, 'truthy', true), false);
  assert.equal(preferences.readLegacyBoolean(values, 'missing', true), true);
});
