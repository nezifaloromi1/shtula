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

const sourcePath = path.resolve('src/features/quran/services/feedRequest.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));
const module = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(module, module.exports, require);
const { fetchFeedXml } = module.exports;

const originalFetch = globalThis.fetch;
function pendingBody(signal) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('body read aborted'));
    if (signal.aborted) return fail();
    signal.addEventListener('abort', fail, { once: true });
  });
}

test('feed request returns the response body while keeping response metadata', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    url: 'https://example.test/feed.xml',
    headers: { get: (name) => name === 'content-type' ? 'application/rss+xml' : null },
    text: async () => '<rss><channel><item /></channel></rss>',
  });
  try {
    const result = await fetchFeedXml('https://example.test/feed.xml', undefined, 100);
    assert.match(result.xml, /<rss>/);
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get('content-type'), 'application/rss+xml');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('caller cancellation remains active while the RSS response body is being read', async () => {
  globalThis.fetch = async (_url, options) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/rss+xml' },
    text: () => pendingBody(options.signal),
  });
  const controller = new AbortController();
  try {
    const request = fetchFeedXml('https://example.test/feed.xml', controller.signal, 1_000);
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await assert.rejects(request, /timed out or was cancelled/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('request deadline covers a stalled RSS response body, not only response headers', async () => {
  globalThis.fetch = async (_url, options) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/rss+xml' },
    text: () => pendingBody(options.signal),
  });
  try {
    await assert.rejects(
      fetchFeedXml('https://example.test/feed.xml', undefined, 10),
      /timed out or was cancelled/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('non-success HTTP responses fail before parsing a response body', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    headers: { get: () => 'text/plain' },
    text: async () => 'unavailable',
  });
  try {
    await assert.rejects(fetchFeedXml('https://example.test/feed.xml', undefined, 100), /HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
