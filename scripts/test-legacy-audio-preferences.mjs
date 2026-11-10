import assert from 'node:assert/strict';
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
const source = ts.transpileModule(await (await import('node:fs/promises')).readFile('src/features/quran/services/legacyAudioPreferences.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', source)((id) => {
  if (id === './legacyDisplayPreferences') return {
    readLegacyBoolean: (values, key, fallback) => {
      const value = values[key];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes'].includes(normalized)) return true;
        if (['false', '0', 'no', ''].includes(normalized)) return false;
      }
      return fallback;
    },
  };
  throw new Error(`Unexpected dependency: ${id}`);
}, module, module.exports);
const { mapLegacyAudioPreferences } = module.exports;
const defaults = { trimSilence: false, volumeBoost: false };

test('imports the exact original Flutter audio-effect keys', () => {
  assert.deepEqual(mapLegacyAudioPreferences(defaults, { trimSilence: true, volumeBoost: true }), {
    trimSilence: true, volumeBoost: true,
  });
});

test('normalizes integer and string booleans', () => {
  assert.deepEqual(mapLegacyAudioPreferences(defaults, { trimSilence: 1, volumeBoost: 'yes' }), {
    trimSilence: true, volumeBoost: true,
  });
});

test('preserves current values for malformed or absent legacy settings', () => {
  assert.deepEqual(mapLegacyAudioPreferences({ trimSilence: true, volumeBoost: false }, { trimSilence: 'maybe' }), {
    trimSilence: true, volumeBoost: false,
  });
});
