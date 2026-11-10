import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateLockfile } from './check-lockfile.mjs';

function fixture() {
  const packageJson = {
    name: 'sheademtula',
    version: '1.0.0',
    dependencies: { expo: '~58.0.0', react: '19.3.0' },
    devDependencies: { typescript: '~5.9.3' },
  };
  const lockfile = {
    name: 'sheademtula',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'sheademtula',
        version: '1.0.0',
        dependencies: { expo: '~58.0.0', react: '19.3.0' },
        devDependencies: { typescript: '~5.9.3' },
      },
      'node_modules/expo': { version: '58.0.0' },
      'node_modules/react': { version: '19.3.0' },
      'node_modules/typescript': { version: '5.9.3' },
    },
  };
  return { packageJson, lockfile };
}

test('lockfile policy accepts npm lockfile v3 with matching direct dependencies', () => {
  const { packageJson, lockfile } = fixture();
  const result = validateLockfile(packageJson, lockfile);
  assert.equal(result.valid, true, result.reason);
});

test('lockfile policy rejects unsupported lockfile versions', () => {
  const { packageJson, lockfile } = fixture();
  lockfile.lockfileVersion = 2;
  const result = validateLockfile(packageJson, lockfile);
  assert.equal(result.valid, false);
  assert.match(result.reason, /lockfileVersion 3/);
});

test('lockfile policy rejects root package identity mismatches', () => {
  const { packageJson, lockfile } = fixture();
  lockfile.packages[''].version = '0.9.0';
  const result = validateLockfile(packageJson, lockfile);
  assert.equal(result.valid, false);
  assert.match(result.reason, /root package name\/version/);
});

test('lockfile policy rejects missing or unexpected direct dependencies', () => {
  const { packageJson, lockfile } = fixture();
  delete lockfile.packages[''].dependencies.react;
  const result = validateLockfile(packageJson, lockfile);
  assert.equal(result.valid, false);
  assert.match(result.reason, /dependencies names differ/);
});

test('lockfile policy rejects version-range drift from package.json', () => {
  const { packageJson, lockfile } = fixture();
  lockfile.packages[''].dependencies.expo = '^58.0.0';
  const result = validateLockfile(packageJson, lockfile);
  assert.equal(result.valid, false);
  assert.match(result.reason, /dependencies\.expo differs/);
});

test('lockfile policy rejects lockfiles without a root package entry', () => {
  const { packageJson, lockfile } = fixture();
  delete lockfile.packages[''];
  const result = validateLockfile(packageJson, lockfile);
  assert.equal(result.valid, false);
  assert.match(result.reason, /missing its root package entry/);
});
