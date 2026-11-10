import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const provider = fs.readFileSync('src/features/quran/state/QuranLibraryProvider.tsx', 'utf8');
const app = fs.readFileSync('src/app/App.tsx', 'utf8');
const screen = fs.readFileSync('src/app/StartupErrorScreen.tsx', 'utf8');

const locales = ['en', 'de', 'es', 'gl', 'it', 'nl', 'ru', 'tr', 'vi', 'zh_Hans', 'om', 'am', 'ar'];

test('fatal local-library startup errors are retained in provider state and end the splash loading state', () => {
  assert.match(provider, /const \[startupError, setStartupError\] = useState<string \| null>\(null\)/);
  assert.match(provider, /setStartupError\(message\);[\s\S]*setReady\(true\);/);
  assert.match(provider, /setFeedSettled\(true\);[\s\S]*setReady\(true\);/);
});

test('startup can be retried without silently mounting the audio player over a failed database', () => {
  assert.match(provider, /const retryStartup = useCallback\(\(\) => \{[\s\S]*setIsRetryingStartup\(true\);[\s\S]*setStartupAttempt/);
  assert.match(app, /startupError \? \([\s\S]*StartupErrorScreen[\s\S]*\) : \([\s\S]*AudioProvider/);
  assert.match(screen, /disabled=\{retrying\}/);
  assert.match(screen, /onPress=\{onRetry\}/);
});

test('startup retry label is available in every supported language catalog', () => {
  for (const locale of locales) {
    const catalog = JSON.parse(fs.readFileSync(`src/localization/catalogs/${locale}.json`, 'utf8'));
    assert.equal(typeof catalog.startup_retry, 'string', `${locale} is missing startup_retry`);
    assert.ok(catalog.startup_retry.trim().length > 0, `${locale} has an empty startup_retry`);
  }
});
