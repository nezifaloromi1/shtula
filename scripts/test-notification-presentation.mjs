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

const presentation = loadTsModule('src/features/quran/services/notificationPresentation.ts');

test('Quran refresh notification stays in the tray without a banner, sound or badge', () => {
  assert.deepEqual(presentation.getNotificationPresentation({ kind: 'quran-library-refresh' }), {
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: true,
  });
});

test('unrelated notifications retain standard foreground banner and sound behavior', () => {
  assert.deepEqual(presentation.getNotificationPresentation({ kind: 'other-alert' }), {
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  });
});

test('missing or malformed notification data uses standard presentation safely', () => {
  for (const data of [undefined, null, 'quran-library-refresh', 4, []]) {
    assert.deepEqual(presentation.getNotificationPresentation(data), {
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  }
});

test('notification handler is registered at startup before background task registration', async () => {
  const entry = fs.readFileSync('index.ts', 'utf8');
  assert.ok(entry.indexOf('configureNotificationPresentation') < entry.indexOf('backgroundQuranRefresh'));

  const behavior = presentation.getNotificationPresentation({ kind: 'quran-library-refresh' });
  let handler;
  loadTsModule('src/features/quran/services/configureNotificationPresentation.ts', (id) => {
    if (id === 'expo-notifications') return { setNotificationHandler: (value) => { handler = value; } };
    if (id === './notificationPresentation') return presentation;
    throw new Error(`Unexpected dependency: ${id}`);
  });
  assert.equal(typeof handler.handleNotification, 'function');
  assert.deepEqual(await handler.handleNotification({ request: { content: { data: { kind: 'quran-library-refresh' } } } }), behavior);
});
