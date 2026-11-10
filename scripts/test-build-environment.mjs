import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { collectBuildReadiness, validateIOSPrivacyManifest } from './check-build-environment.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

test('iOS privacy manifest declares app-only UserDefaults and app-container file metadata access', () => {
  const config = require(path.join(rootDir, 'app.config.js'));
  const report = validateIOSPrivacyManifest(config);
  assert.equal(report.valid, true, report.reason);
  const entries = config.ios.privacyManifests.NSPrivacyAccessedAPITypes;
  assert.deepEqual(entries.find((entry) => entry.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryUserDefaults')?.NSPrivacyAccessedAPITypeReasons, ['CA92.1']);
  assert.deepEqual(entries.find((entry) => entry.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryFileTimestamp')?.NSPrivacyAccessedAPITypeReasons, ['C617.1']);
});

test('iOS privacy manifest rejects missing required reasons', () => {
  const config = require(path.join(rootDir, 'app.config.js'));
  const invalid = structuredClone(config);
  invalid.ios.privacyManifests.NSPrivacyAccessedAPITypes = invalid.ios.privacyManifests.NSPrivacyAccessedAPITypes
    .filter((entry) => entry.NSPrivacyAccessedAPIType !== 'NSPrivacyAccessedAPICategoryUserDefaults');
  const report = validateIOSPrivacyManifest(invalid);
  assert.equal(report.valid, false);
  assert.match(report.reason, /UserDefaults/);
});

test('iOS privacy manifest rejects duplicate API categories', () => {
  const config = require(path.join(rootDir, 'app.config.js'));
  const invalid = structuredClone(config);
  invalid.ios.privacyManifests.NSPrivacyAccessedAPITypes.push({
    NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
    NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
  });
  const report = validateIOSPrivacyManifest(invalid);
  assert.equal(report.valid, false);
  assert.match(report.reason, /duplicate entries/);
});

test('SDK 58 project metadata declares its minimum supported Node version', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.equal(packageJson.engines.node, '>=22.13.0');
});

test('Expo config and local native module manifests pass preflight validation', () => {
  const report = collectBuildReadiness({
    rootDir,
    nodeVersion: '22.16.0',
    platform: 'linux',
    env: {},
    commandCheck: () => false,
  });
  assert.equal(report.valid, true);
  assert.equal(report.checks.find((check) => check.key === 'project-config').status, 'ready');
  assert.equal(report.checks.find((check) => check.key === 'ios-privacy-manifest').status, 'ready');
  assert.equal(report.checks.find((check) => check.key === 'local-expo-modules').status, 'ready');
  assert.equal(report.checks.find((check) => check.key === 'sdk58-native-dependencies').status, 'ready');
});

test('preflight distinguishes missing host prerequisites from invalid project configuration', () => {
  const report = collectBuildReadiness({
    rootDir,
    nodeVersion: '22.16.0',
    platform: 'linux',
    env: {},
    commandCheck: () => false,
  });
  assert.equal(report.valid, true);
  assert.equal(report.blocked, true);
  assert.equal(report.checks.find((check) => check.key === 'android').status, 'blocked');
  assert.equal(report.checks.find((check) => check.key === 'ios').status, 'blocked');
  assert.equal(report.checks.find((check) => check.key === 'dependencies').status, 'blocked');
});

test('preflight rejects unsupported Node versions', () => {
  const report = collectBuildReadiness({
    rootDir,
    nodeVersion: '20.19.0',
    platform: 'linux',
    env: {},
    commandCheck: () => false,
  });
  assert.equal(report.valid, false);
  assert.equal(report.checks.find((check) => check.key === 'node').status, 'error');
});

test('local native module runtime imports are declared as a direct app dependency', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.equal(packageJson.dependencies['expo-modules-core'], '~58.0.26');
});

test('TypeScript does not request a nonexistent ambient React Native type package', () => {
  const tsconfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'tsconfig.json'), 'utf8'));
  assert.equal(Object.hasOwn(tsconfig.compilerOptions, 'types'), false);
});

function createAndroidSdkFixture({ platform = true, buildTools = true } = {}) {
  const sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sheademtula-android-sdk-'));
  if (platform) {
    const platformDirectory = path.join(sdkRoot, 'platforms', 'android-37');
    fs.mkdirSync(platformDirectory, { recursive: true });
    fs.writeFileSync(path.join(platformDirectory, 'android.jar'), 'test-sdk-platform');
  }
  if (buildTools) fs.mkdirSync(path.join(sdkRoot, 'build-tools', '37.0.0'), { recursive: true });
  return sdkRoot;
}

function fakeCommandOutput({ java = 'openjdk version "21.0.12"', xcode = 'Xcode 26.4' } = {}) {
  return (command) => {
    if (command === 'java') return java;
    if (command === 'xcodebuild') return xcode;
    return null;
  };
}

test('Android preflight requires SDK Platform 37, Build Tools and JDK 17+', () => {
  const sdkRoot = createAndroidSdkFixture();
  const report = collectBuildReadiness({
    rootDir,
    nodeVersion: '22.16.0',
    platform: 'linux',
    env: { ANDROID_SDK_ROOT: sdkRoot },
    commandCheck: () => false,
    commandOutput: fakeCommandOutput(),
  });
  assert.equal(report.checks.find((check) => check.key === 'android').status, 'ready');
});

test('Android preflight blocks an SDK without Platform 37', () => {
  const sdkRoot = createAndroidSdkFixture({ platform: false });
  const report = collectBuildReadiness({
    rootDir,
    nodeVersion: '22.16.0',
    platform: 'linux',
    env: { ANDROID_SDK_ROOT: sdkRoot },
    commandCheck: () => false,
    commandOutput: fakeCommandOutput(),
  });
  const android = report.checks.find((check) => check.key === 'android');
  assert.equal(android.status, 'blocked');
  assert.match(android.detail, /Platform 37/);
});

test('Android preflight blocks an SDK without Build Tools', () => {
  const sdkRoot = createAndroidSdkFixture({ buildTools: false });
  const report = collectBuildReadiness({
    rootDir,
    nodeVersion: '22.16.0',
    platform: 'linux',
    env: { ANDROID_SDK_ROOT: sdkRoot },
    commandCheck: () => false,
    commandOutput: fakeCommandOutput(),
  });
  const android = report.checks.find((check) => check.key === 'android');
  assert.equal(android.status, 'blocked');
  assert.match(android.detail, /Build Tools/);
});

test('iOS preflight requires Xcode 26.4+ and CocoaPods', () => {
  const report = collectBuildReadiness({
    rootDir,
    nodeVersion: '22.16.0',
    platform: 'darwin',
    env: {},
    commandCheck: (command) => command === 'pod',
    commandOutput: fakeCommandOutput({ xcode: 'Xcode 26.4.1\nBuild version 17E190' }),
  });
  assert.equal(report.checks.find((check) => check.key === 'ios').status, 'ready');
});

test('iOS preflight rejects Xcode below SDK 58 minimum', () => {
  const report = collectBuildReadiness({
    rootDir,
    nodeVersion: '22.16.0',
    platform: 'darwin',
    env: {},
    commandCheck: (command) => command === 'pod',
    commandOutput: fakeCommandOutput({ xcode: 'Xcode 26.3' }),
  });
  const ios = report.checks.find((check) => check.key === 'ios');
  assert.equal(ios.status, 'blocked');
  assert.match(ios.detail, /26\.4/);
});


test('preflight blocks native CI readiness until the npm lockfile is committed', () => {
  const report = collectBuildReadiness({
    rootDir,
    nodeVersion: '22.16.0',
    platform: 'linux',
    env: {},
    commandCheck: () => false,
  });
  const lockfile = report.checks.find((check) => check.key === 'lockfile');
  assert.equal(lockfile.status, 'blocked');
  assert.match(lockfile.detail, /Bootstrap npm lockfile/);
});
