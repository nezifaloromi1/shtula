import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

const source = await readFile('modules/sheademtula-audio-effects/src/index.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
}).outputText;

function loadWrapper(nativeEffects) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((id) => {
    if (id === 'expo-modules-core') return { requireOptionalNativeModule: () => nativeEffects };
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}

test('missing optional native module resolves false asynchronously', async () => {
  const { setVolumeBoostEnabled } = loadWrapper(null);
  const result = setVolumeBoostEnabled(12, true);
  assert.equal(typeof result.then, 'function');
  assert.equal(await result, false);
});

test('available native module receives session and enabled state', async () => {
  const calls = [];
  const { setVolumeBoostEnabled } = loadWrapper({
    setVolumeBoostEnabled: async (sessionId, enabled) => {
      calls.push([sessionId, enabled]);
      return true;
    },
  });
  assert.equal(await setVolumeBoostEnabled(42, true), true);
  assert.deepEqual(calls, [[42, true]]);
});
