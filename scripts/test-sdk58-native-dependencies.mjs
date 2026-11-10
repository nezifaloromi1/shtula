import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { inspectSDK58NativeDependencies } from './check-sdk58-native-dependencies.mjs';

const rootDir = path.resolve('scripts', '..');

function createFixture(mutator) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sheademtula-sdk58-'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  mutator(packageJson);
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(packageJson));
  fs.mkdirSync(path.join(directory, 'src'), { recursive: true });
  return directory;
}

test('SDK 58 native package baseline is satisfied by the project manifest', () => {
  const result = inspectSDK58NativeDependencies({ rootDir });
  assert.equal(result.valid, true, result.problems.join('\n'));
});

test('SDK 58 check identifies an incompatible native UI package declaration', () => {
  const fixture = createFixture((pkg) => { pkg.dependencies['react-native-screens'] = '~4.24.0'; });
  const result = inspectSDK58NativeDependencies({ rootDir: fixture });
  assert.equal(result.valid, false);
  assert.match(result.problems.join('\n'), /react-native-screens.*~4\.30\.1/);
});

test('SDK 58 check requires the matching React and React Native pair', () => {
  const fixture = createFixture((pkg) => { pkg.dependencies['react-native'] = '0.87.0'; });
  const result = inspectSDK58NativeDependencies({ rootDir: fixture });
  assert.equal(result.valid, false);
  assert.match(result.problems.join('\n'), /react-native must remain 0\.88\.1/);
});

test('unused Gesture Handler is not reintroduced as a native dependency', () => {
  const fixture = createFixture((pkg) => { pkg.dependencies['react-native-gesture-handler'] = '~3.5.0'; });
  const result = inspectSDK58NativeDependencies({ rootDir: fixture });
  assert.equal(result.valid, false);
  assert.match(result.problems.join('\n'), /unused react-native-gesture-handler/);
});

test('unused Gesture Handler imports are rejected even when it is not a dependency', () => {
  const fixture = createFixture(() => {});
  fs.writeFileSync(path.join(fixture, 'src', 'Entry.tsx'), "import 'react-native-gesture-handler';\n");
  const result = inspectSDK58NativeDependencies({ rootDir: fixture });
  assert.equal(result.valid, false);
  assert.match(result.problems.join('\n'), /Entry\.tsx/);
});
