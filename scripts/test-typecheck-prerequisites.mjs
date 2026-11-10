import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { inspectTypecheckPrerequisites } from './run-typecheck.mjs';

function createFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sheademtula-typecheck-'));
}

function addFile(rootDir, relativePath, content = '{}') {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

test('typecheck prerequisites identify missing Expo, React and TypeScript packages', () => {
  const rootDir = createFixture();
  const result = inspectTypecheckPrerequisites(rootDir);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ['expo', 'react', 'react-native', '@types/react', 'typescript', 'expo/tsconfig.base']);
});

test('typecheck readiness passes only when the actual local toolchain is installed', () => {
  const rootDir = createFixture();
  for (const relativePath of [
    'node_modules/expo/package.json',
    'node_modules/react/package.json',
    'node_modules/react-native/package.json',
    'node_modules/@types/react/package.json',
    'node_modules/typescript/bin/tsc',
    'node_modules/expo/tsconfig.base.json',
  ]) addFile(rootDir, relativePath);
  const result = inspectTypecheckPrerequisites(rootDir);
  assert.deepEqual(result, { ready: true, missing: [] });
});
