import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const validate = fs.readFileSync('.github/workflows/validate.yml', 'utf8');
const nativeBuild = fs.readFileSync('.github/workflows/native-build.yml', 'utf8');
const installer = fs.readFileSync('scripts/ci-install-dependencies.sh', 'utf8');
const bootstrap = fs.readFileSync('.github/workflows/bootstrap-lockfile.yml', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('source validation workflow runs on pushes, pull requests and manual dispatch', () => {
  assert.match(validate, /\n  push:\n/);
  assert.match(validate, /\n  pull_request:\n/);
  assert.match(validate, /\n  workflow_dispatch:\n/);
  assert.match(validate, /permissions:\n  contents: read/);
});

test('source validation installs dependencies and runs tests, semantic typecheck and Expo config checks', () => {
  assert.match(validate, /actions\/checkout@v7/);
  assert.match(validate, /actions\/setup-node@v7/);
  assert.match(validate, /node-version: 22\.23\.3/);
  assert.match(validate, /bash scripts\/ci-install-dependencies\.sh/);
  assert.match(validate, /npm run verify:all/);
  assert.match(validate, /npm run typecheck/);
  assert.match(validate, /npx expo install --check/);
  assert.match(validate, /npx expo config --type public --json/);
  assert.match(validate, /shademtula\.app/);
  assert.match(validate, /single-featured-google-drive-rss/);
});

test('CI dependency installer refuses non-reproducible installs and uses npm ci', () => {
  assert.match(installer, /if \[\[ ! -f package-lock\.json \]\]/);
  assert.match(installer, /package-lock\.json is required for CI dependency installation/);
  assert.match(installer, /node scripts\/check-lockfile\.mjs/);
  assert.match(installer, /npm ci --no-audit --no-fund/);
  assert.doesNotMatch(installer, /npm install/);
});

test('manual lockfile bootstrap creates, validates, installs and exports the lockfile', () => {
  assert.match(bootstrap, /workflow_dispatch:/);
  assert.match(bootstrap, /npm install --package-lock-only --ignore-scripts/);
  assert.match(bootstrap, /node scripts\/check-lockfile\.mjs/);
  assert.match(bootstrap, /npm ci --no-audit --no-fund/);
  assert.match(bootstrap, /npm run typecheck/);
  assert.match(bootstrap, /actions\/upload-artifact@v7/);
  assert.match(bootstrap, /package-lock\.json/);
  assert.match(bootstrap, /permissions:\n  contents: read/);
  assert.doesNotMatch(bootstrap, /contents: write/);
});

test('native build workflow runs source checks before platform compilation', () => {
  assert.match(nativeBuild, /workflow_dispatch:/);
  assert.match(nativeBuild, /needs: verify/);
  assert.match(nativeBuild, /npm run verify:all/);
  assert.match(nativeBuild, /npm run typecheck/);
  assert.match(nativeBuild, /npx expo install --check/);
});

test('Android native job generates and compiles an unsigned debug APK', () => {
  assert.match(nativeBuild, /runs-on: ubuntu-24\.04/);
  assert.match(nativeBuild, /actions\/setup-java@v6/);
  assert.match(nativeBuild, /java-version: '17'/);
  assert.match(nativeBuild, /android-actions\/setup-android@v4/);
  assert.match(nativeBuild, /platforms;android-37/);
  assert.match(nativeBuild, /npx expo prebuild --platform android --clean --no-install/);
  assert.match(nativeBuild, /:app:assembleDebug/);
  assert.match(nativeBuild, /app-debug\.apk/);
});

test('iOS native job generates and compiles a simulator app with Xcode 27', () => {
  assert.match(nativeBuild, /runs-on: xcode-27/);
  assert.match(nativeBuild, /xcodebuild -version/);
  assert.match(nativeBuild, /npx expo prebuild --platform ios --clean --no-install/);
  assert.match(nativeBuild, /pod install --repo-update/);
  assert.match(nativeBuild, /generic\/platform=iOS Simulator/);
  assert.match(nativeBuild, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(nativeBuild, /sheademtula-derived-data/);
});

test('native artifacts are uploaded without signing or store-submit credentials', () => {
  assert.match(nativeBuild, /actions\/upload-artifact@v7/g);
  assert.match(nativeBuild, /retention-days: 14/);
  assert.doesNotMatch(nativeBuild, /eas submit|fastlane deliver|appstoreconnect|PLAY_STORE|ASC_API_KEY/i);
});

test('package scripts include CI workflow regression tests in verify:all', () => {
  assert.equal(packageJson.scripts['test:ci-workflows'], 'node --test scripts/test-ci-workflows.mjs');
  assert.ok(packageJson.scripts['verify:all'].includes('npm run test:ci-workflows'));
  assert.equal(packageJson.scripts['check:lockfile'], 'node scripts/check-lockfile.mjs');
  assert.equal(packageJson.scripts['test:lockfile-policy'], 'node --test scripts/test-lockfile-policy.mjs');
  assert.ok(packageJson.scripts['verify:all'].includes('npm run test:lockfile-policy'));
});
