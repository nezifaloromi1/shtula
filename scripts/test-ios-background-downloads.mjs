import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');
const manifest = JSON.parse(read('modules/sheademtula-ios-downloads/expo-module.config.json'));
const wrapper = read('modules/sheademtula-ios-downloads/src/index.ts');
const native = read('modules/sheademtula-ios-downloads/ios/IOSDownloadsModule.swift');
const manager = read('src/features/quran/services/audioDownloadManager.ts');
const provider = read('src/features/quran/state/QuranLibraryProvider.tsx');
const database = read('src/storage/database.ts');
const packageJson = JSON.parse(read('package.json'));

test('iOS downloader is autolinked with an AppDelegate background-session subscriber', () => {
  assert.deepEqual(manifest.platforms, ['apple']);
  assert.ok(manifest.apple.modules.includes('IOSDownloadsModule'));
  assert.ok(manifest.apple.appDelegateSubscribers.includes('QuranDownloadsAppDelegateSubscriber'));
  assert.match(native, /class QuranDownloadsAppDelegateSubscriber: ExpoAppDelegateSubscriber/);
  assert.match(native, /handleEventsForBackgroundURLSession identifier: String/);
});

test('iOS native downloader uses a single restorable background URLSession', () => {
  assert.match(native, /URLSessionConfiguration\.background\(withIdentifier: Self\.sessionIdentifier\)/);
  assert.match(native, /sessionSendsLaunchEvents = true/);
  assert.match(native, /isDiscretionary = false/);
  assert.match(native, /URLSessionDownloadDelegate/);
  assert.match(native, /urlSessionDidFinishEvents\(forBackgroundURLSession session: URLSession\)/);
  assert.match(native, /DispatchQueue\.main\.async\(execute: handler\)/);
});

test('iOS task metadata is saved before resume and supports recovery and cancellation', () => {
  const enqueueBlock = native.slice(native.indexOf('func enqueue('), native.indexOf('func listTrackedDownloads('));
  assert.ok(enqueueBlock.indexOf('upsert(record)') < enqueueBlock.indexOf('task.resume()'));
  assert.match(native, /func listTrackedDownloads\(\)/);
  assert.match(native, /func status\(downloadId: String\)/);
  assert.match(native, /func finalize\(downloadId: String\)/);
  assert.match(native, /func cancel\(_ downloadId: String/);
  assert.match(native, /func cleanup\(_ downloadId: String\)/);
  assert.match(native, /\.isFileURL/);
  assert.doesNotMatch(native, /\.isFile\b/);
});

test('iOS downloader rejects non-HTTPS URLs and web/error payloads', () => {
  assert.match(native, /url\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(native, /as\? HTTPURLResponse else/);
  assert.match(native, /200\.\.\.299/);
  assert.match(native, /text\/html/);
  assert.match(native, /application\/json/);
  assert.match(native, /for: \.documentDirectory/);
  assert.match(native, /quran_library/);
  assert.match(native, /<!doctype html/);
});

test('JS selects iOS background URLSession while retaining legacy FileSystem checkpoints', () => {
  assert.match(wrapper, /Platform\.OS === 'ios'/);
  assert.match(wrapper, /requireOptionalNativeModule/);
  assert.match(manager, /downloadWithIOSBackgroundSession/);
  assert.match(manager, /ios-background-download:\/\//);
  assert.match(manager, /Keep in-flight Expo FileSystem checkpoints from older app versions resumable/);
  assert.match(manager, /recoverOrphanedIOSQuranDownloads/);
  assert.match(manager, /cancelQuranAudioDownload/);
  assert.match(provider, /recoverOrphanedIOSQuranDownloads\(tracks\)/);
  assert.match(provider, /cleanupCompletedIOSQuranDownload/);
});

test('iOS native task IDs are migrated and persisted in SQLite', () => {
  assert.match(database, /ios_download_id TEXT/);
  assert.match(database, /ensureColumn\(db, 'quran_downloads', 'ios_download_id', 'TEXT'\)/);
  assert.match(database, /iosDownloadId: row\.ios_download_id == null \? null : String\(row\.ios_download_id\)/);
  assert.match(database, /ios_download_id = excluded\.ios_download_id/);
  assert.ok(packageJson.scripts['test:ios-background-downloads']);
  assert.ok(packageJson.scripts['verify:all'].includes('test:ios-background-downloads'));
});
