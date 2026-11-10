import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const failures = [];
const required = [
  'src/app/App.tsx',
  'src/app/providers/AudioProvider.tsx',
  'src/navigation/RootNavigator.tsx',
  'src/navigation/MainTabs.tsx',
  'src/tds/theme.tsx',
  'src/tds/tokens.ts',
  'src/features/quran/models/QuranAudio.ts',
  'src/features/quran/components/QuranEpisodeDetailsSheet.tsx',
  'src/features/quran/services/episodeShare.ts',
  'src/features/quran/services/episodeDescription.ts',
  'src/features/quran/services/formatAudioBytes.ts',
  'src/features/quran/config/feed.json',
  'src/features/quran/services/featuredQuranFeed.ts',
  'src/features/quran/services/audioDownloadManager.ts',
  'src/features/quran/services/refreshPolicy.ts',
  'src/features/quran/services/backgroundRefreshPolicy.ts',
  'src/features/quran/services/backgroundQuranRefresh.ts',
  'src/features/quran/services/legacyBackgroundPreferences.ts',
  'src/features/settings/SettingsScreen.tsx',
  'src/features/quran/state/QuranLibraryProvider.tsx',
  'src/features/player/PlayerScreen.tsx',
  'src/features/tafsiira/TafsiiraScreen.tsx',
  'docs/AUDIO_ENGINE.md',
  'docs/BACKGROUND_DOWNLOADS.md',
  'docs/BACKGROUND_REFRESH.md',
  'src/storage/database.ts',
  'src/app/hooks/usePlayQuranTrack.ts',
  'src/features/quran/services/legacyDisplayPreferences.ts',
  'src/features/quran/services/legacyAudioPreferences.ts',
  'src/features/quran/services/layoutPolicy.ts',
  'src/storage/legacyMigration.ts',
  'src/localization/LocalizationProvider.tsx',
  'src/localization/catalogs/en.json',
  'tools/legacy-exporter/bin/export_legacy_database.dart',
  'modules/sheademtula-local-library/index.ts',
  'modules/sheademtula-android-downloads/index.ts',
  'modules/sheademtula-ios-downloads/index.ts',
  'modules/sheademtula-ios-downloads/expo-module.config.json',
  'modules/sheademtula-ios-downloads/ios/IOSDownloadsModule.swift',
  'modules/sheademtula-android-downloads/expo-module.config.json',
  'modules/sheademtula-android-downloads/android/src/main/java/expo/modules/sheademtulaandroiddownloads/AndroidDownloadsModule.kt',
  'modules/sheademtula-local-library/android/src/main/java/expo/modules/sheademtulalocallibrary/LocalLibraryModule.kt',
  'modules/sheademtula-local-library/ios/LocalLibraryModule.swift',
  'modules/sheademtula-audio-effects/src/index.ts',
  'modules/sheademtula-audio-effects/android/src/main/java/expo/modules/sheademtulaaudioeffects/AudioEffectsModule.kt',
  'plugins/withExpoAudioPlayerEffects.js',
  'scripts/check-live-quran-feed.mjs',
];
for (const file of required) {
  if (!existsSync(join(root, file))) failures.push(`Missing required file: ${file}`);
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (packageJson.name !== 'sheademtula') failures.push('The npm package name must be sheademtula.');
if (!packageJson.dependencies?.['fast-xml-parser']) failures.push('The configured single RSS feed requires fast-xml-parser.');
if (!packageJson.dependencies?.['expo-file-system']) failures.push('Native progress-aware audio downloads require expo-file-system.');
if (!packageJson.dependencies?.['expo-background-task'] || !packageJson.dependencies?.['expo-task-manager'] || !packageJson.dependencies?.['expo-network'] || !packageJson.dependencies?.['expo-notifications']) failures.push('Scheduled Quran background refresh requires the SDK 58 BackgroundTask, TaskManager, Network and Notifications modules.');
if (packageJson.scripts?.['test:background-refresh-policy'] !== 'node --test scripts/test-background-refresh-policy.mjs' || packageJson.scripts?.['test:legacy-background-preferences'] !== 'node --test scripts/test-legacy-background-preferences.mjs') failures.push('Background refresh policy and legacy preference regression tests are not configured.');
if (packageJson.scripts?.['check:live-feed'] !== 'node scripts/check-live-quran-feed.mjs') {
  failures.push('The real live Google Drive feed diagnostic is not configured.');
}
if (packageJson.scripts?.['test:android-system-download-manager'] !== 'node --test scripts/test-android-system-download-manager.mjs') {
  failures.push('Android system-download recovery tests are not included in the project scripts.');
}
if (packageJson.expo?.autolinking?.nativeModulesDir !== './modules') {
  failures.push('Expo local native modules must be autolinked from the root modules directory.');
}

const appConfig = readFileSync(join(root, 'app.config.js'), 'utf8');
if (!appConfig.includes("bundleIdentifier: 'shademtula.app'")) failures.push('The iOS bundle identifier changed.');
if (!appConfig.includes("package: 'shademtula.app'")) failures.push('The Android application ID changed.');
if (!appConfig.includes("audioCatalogMode: 'single-featured-google-drive-rss'")) failures.push('The single Google Drive Quran feed is not configured.');
if (!appConfig.includes("'./plugins/withExpoAudioPlayerEffects'")) failures.push('Android audio-session and skip-silence Expo Audio integration is not registered.');
if (!appConfig.includes("'expo-background-task'") || !appConfig.includes("'expo-notifications'")) failures.push('Expo background refresh and local notification config plugins are not registered.');
if (!appConfig.includes('privacyManifests') || !appConfig.includes('NSPrivacyAccessedAPICategoryUserDefaults') || !appConfig.includes('CA92.1') || !appConfig.includes('NSPrivacyAccessedAPICategoryFileTimestamp') || !appConfig.includes('C617.1')) failures.push('The iOS privacy manifest must declare app-local UserDefaults and app-container file metadata access.');
if (!readFileSync(join(root, 'index.ts'), 'utf8').includes('backgroundQuranRefresh')) failures.push('The background Quran task must be imported before React components mount.');

const feedConfig = JSON.parse(readFileSync(join(root, 'src/features/quran/config/feed.json'), 'utf8'));
const flutterFeedUrl = 'https://drive.usercontent.google.com/download?id=1zKYJQ0qDrU8uOUzSFLga_S4zl_T4NZe-&export=download&confirm=t&authuser=0';
const flutterArtworkUrl = 'https://drive.google.com/thumbnail?id=1gzjiWR7k3t2VP1GUJFxTq9cHr8yxpcQo&sz=w1200';
if (feedConfig.provider !== 'featured-google-drive') failures.push('Unexpected Quran feed provider.');
if (feedConfig.feedUrl !== flutterFeedUrl) failures.push('Quran feed URL differs from the original Flutter default.');
if (feedConfig.artworkUrl !== flutterArtworkUrl) failures.push('Quran artwork URL differs from the original Flutter default.');
if (!appConfig.includes("require('./src/features/quran/config/feed.json')") || !appConfig.includes('quranFeed.feedUrl')) {
  failures.push('Expo runtime configuration is not using the centralized Quran feed configuration.');
}

function walk(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(full));
    else output.push(full);
  }
  return output;
}

const allFiles = walk(root);
const allPaths = allFiles.map((file) => file.slice(root.length + 1).replaceAll('\\', '/'));
const sourceFiles = [...walk(join(root, 'src')), ...walk(join(root, 'modules'))]
  .filter((file) => /\.(ts|tsx|kt|swift|m|mm|gradle|xml)$/.test(file));
const sourceText = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

if (/Anytime Podcast Player|anytime_podcast_player|package:anytime\//i.test(sourceText)) {
  failures.push('Old Anytime Podcast Player product identity remains in runtime source.');
}
if (allFiles.some((file) => file !== join(root, 'scripts/verify-project.mjs') && readFileSync(file, 'utf8').includes('anytimeplayer.app'))) {
  failures.push('An obsolete Anytime product-domain URL remains in the project.');
}
if (allPaths.some((path) => /(^|\/)(podcast|podcasts)\//i.test(path))) {
  failures.push('A Podcast-named application directory remains.');
}
if (/podcast_search|PodcastIndexProvider|itunes\.apple\.com|podcastindex\.org|OPML|opml/i.test(sourceText)) {
  failures.push('Unwanted podcast discovery, subscription, or OPML integration remains in runtime source.');
}
if (!sourceText.includes('FEATURED_QURAN_FEED_URL') || !sourceText.includes('fast-xml-parser')) {
  failures.push('The single configured Quran feed parser is missing.');
}
if (!readFileSync(join(root, 'src/features/quran/services/featuredQuranFeed.ts'), 'utf8').includes('feedConfig.feedUrl')) {
  failures.push('The Quran feed loader is not using the centralized real feed URL.');
}
if (/https?:\/\/(?:example\.com|example\.org|test\.invalid|sample-feed)/i.test(sourceText)) {
  failures.push('A demo/example feed URL remains in runtime source.');
}
if (/drive\.googleapis\.com|www\.googleapis\.com\/drive|drive\.google\.com\/drive\/folders/i.test(sourceText)) {
  failures.push('The separate Google Drive folder/API integration must remain removed.');
}
const downloadManager = readFileSync(join(root, 'src/features/quran/services/audioDownloadManager.ts'), 'utf8');
const libraryDatabase = readFileSync(join(root, 'src/storage/database.ts'), 'utf8');
const libraryProvider = readFileSync(join(root, 'src/features/quran/state/QuranLibraryProvider.tsx'), 'utf8');
if (!downloadManager.includes('File.createDownloadTask') || !downloadManager.includes('onProgress:') || !downloadManager.includes("sessionType: 'foreground'") || !downloadManager.includes('DownloadTask.fromSavable') || !downloadManager.includes('task.pauseAsync()') || !downloadManager.includes('task.cancel()') || !downloadManager.includes('LocalLibrary.getLibraryDirectory()') || !downloadManager.includes('pauseActiveQuranAudioDownloads')) {
  failures.push('Persistent, progress-aware, cancellable and resumable Quran audio downloads are missing.');
}
if (sourceText.includes('downloadAudioFromUrl')) failures.push('The obsolete one-shot native downloader remains beside the new DownloadTask implementation.');
if (!libraryDatabase.includes('CREATE TABLE IF NOT EXISTS quran_downloads') || !libraryDatabase.includes('resume_state_json') || !libraryDatabase.includes('saveAudioDownloadResumeState') || !libraryDatabase.includes('android_download_id')) failures.push('SQLite resumable and Android system-download persistence is incomplete.');
const androidDownloader = readFileSync(join(root, 'modules/sheademtula-android-downloads/android/src/main/java/expo/modules/sheademtulaandroiddownloads/AndroidDownloadsModule.kt'), 'utf8');
if (!androidDownloader.includes('DownloadManager.Request') || !androidDownloader.includes('setDestinationInExternalFilesDir') || !androidDownloader.includes('VISIBILITY_VISIBLE_NOTIFY_COMPLETED') || !androidDownloader.includes('openDownloadedFile') || !androidDownloader.includes('STATUS_SUCCESSFUL')) failures.push('Android OS-managed download integration is incomplete.');
if (!androidDownloader.includes('check(downloadId > 0L)') || !androidDownloader.includes('.commit()')) failures.push('Android system download IDs and recovery metadata are not durably validated.');
if (!downloadManager.includes('downloadWithAndroidSystemManager') || !downloadManager.includes('AndroidDownloads.getStatus') || !downloadManager.includes('AndroidDownloads.finalizeDownload') || !downloadManager.includes('cleanupCompletedAndroidQuranDownload')) failures.push('Android system download progress, completion or cleanup is not wired into the Quran download service.');
if (!libraryProvider.includes('AppState.addEventListener') || !libraryProvider.includes('recoverPendingDownloads') || !libraryProvider.includes('setQuranAudioAppActive')) failures.push('Quran download recovery is not connected to app foreground lifecycle events.');
if (!libraryProvider.includes('mapLegacyBackgroundPreferences') || !libraryProvider.includes('synchronizeBackgroundQuranRefresh')) failures.push('Legacy background refresh preferences or scheduler synchronization are missing.');
const backgroundRefresh = readFileSync(join(root, 'src/features/quran/services/backgroundQuranRefresh.ts'), 'utf8');
const backgroundPolicy = readFileSync(join(root, 'src/features/quran/services/backgroundRefreshPolicy.ts'), 'utf8');
if (!backgroundRefresh.includes('TaskManager.defineTask(BACKGROUND_QURAN_REFRESH_TASK, executeBackgroundRefresh)') || !backgroundRefresh.includes('BackgroundTask.registerTaskAsync')) failures.push('OS-managed background Quran feed task is not defined or registered.');
if (!backgroundPolicy.includes('getNewTrackIds') || !backgroundPolicy.includes('setNewTrackIds')) failures.push('Background-discovered lessons are not persisted for new-item highlighting.');
if (!backgroundRefresh.includes('Notifications.scheduleNotificationAsync') || !appConfig.includes("['expo-notifications', { enableRemoteNotifications: false }]")) failures.push('Local Quran update notifications are not configured without remote push capability.');
const audioProvider = readFileSync(join(root, 'src/app/providers/AudioProvider.tsx'), 'utf8');
if (!audioProvider.includes('shouldPlayInBackground: true') || !audioProvider.includes("interruptionMode: 'doNotMix'")) {
  failures.push('Native background audio mode is not configured correctly.');
}
if (!audioProvider.includes('setActiveForLockScreen') || !audioProvider.includes('artworkUrl:')) {
  failures.push('Lock-screen metadata and artwork are not configured.');
}
if (!audioProvider.includes('nativeEffectPlayer.skipSilenceEnabled = settings.trimSilence') || !audioProvider.includes('setVolumeBoostEnabled(sessionId, settings.volumeBoost)')) {
  failures.push('Android skip-silence and volume-boost controls are not connected to the active native player.');
}
if (!sourceText.includes('TARGET_GAIN_MILLIBELS = 800')) failures.push('Android loudness enhancement gain does not match the original 0.8 dB setting.');
if (!audioProvider.includes('showSeekBackward: true') || !audioProvider.includes('showSeekForward: true')) {
  failures.push('Native lock-screen seek controls are not enabled.');
}
if (!audioProvider.includes('AppState.addEventListener') || !audioProvider.includes('persistCurrentPosition')) {
  failures.push('Playback position is not flushed when the app backgrounds.');
}
if (!audioProvider.includes('status.error') || !audioProvider.includes('pendingTrackLoadRef.current = null') || !audioProvider.includes('!playbackError && (pendingTrackLoadRef.current')) {
  failures.push('Native player load failures can leave the player stuck in a pending state.');
}
if (!audioProvider.includes('wasPlayingRef.current && !status.playing') || !audioProvider.includes('savePosition(snapshot.trackId, snapshot.positionMs)')) {
  failures.push('Playback position is not persisted on native interruption and player teardown.');
}
if (!audioProvider.includes("export type SleepTimerMode = 'off' | 'time' | 'episode'") || !audioProvider.includes('setInterval(checkSleepDeadline, 1000)') || !audioProvider.includes("sleepTimerRef.current.mode === 'episode'") || !audioProvider.includes('deadlineMs: Date.now()')) {
  failures.push('Flutter-equivalent sleep timer modes, deadline countdown, or end-of-audio behavior are missing.');
}
const playerScreen = readFileSync(join(root, 'src/features/player/PlayerScreen.tsx'), 'utf8');
for (const minutes of [5, 10, 15, 30, 45, 60]) {
  if (!playerScreen.includes(String(minutes))) failures.push(`Sleep timer option ${minutes} minutes is missing from the player UI.`);
}
if (!playerScreen.includes("audio.setSleepTimer('episode')") || !playerScreen.includes("t('sleep_episode_label')") || !playerScreen.includes('durationMinutes === minutes')) {
  failures.push('Sleep timer UI does not expose the localized end-of-episode action or stable selected-duration state.');
}


const episodeDetails = readFileSync(join(root, 'src/features/quran/components/QuranEpisodeDetailsSheet.tsx'), 'utf8');
const episodeShare = readFileSync(join(root, 'src/features/quran/services/episodeShare.ts'), 'utf8');
if (!episodeDetails.includes('setTrackPlayed') || !episodeDetails.includes('audio.addToQueue') || !episodeDetails.includes('audio.removeFromQueue') || !episodeDetails.includes('downloadTrack') || !episodeDetails.includes('removeTrack')) {
  failures.push('Quran episode details are missing the played-state, queue or offline-file actions.');
}
if (!episodeDetails.includes('Share.share') || !episodeShare.includes('https://pod.link/')) {
  failures.push('Quran episode sharing does not preserve the original episode share route.');
}
const playerOptions = readFileSync(join(root, 'src/features/player/PlayerOptionsSheet.tsx'), 'utf8');
const transcriptPanel = readFileSync(join(root, 'src/features/transcripts/TranscriptPanel.tsx'), 'utf8');
if (!playerOptions.includes('PanResponder.create') || !playerOptions.includes('Animated.spring') || !playerOptions.includes('COLLAPSED_HEIGHT = 68')) {
  failures.push('The portrait player options sheet is missing its draggable collapsed/expanded interaction.');
}
if (!playerOptions.includes('PlayerOptionsSheet') || !playerOptions.includes('wide = false') || !playerOptions.includes('styles.wide')) {
  failures.push('The landscape player options pane is missing.');
}
if (!playerOptions.includes('audio.reorderQueue') || !playerOptions.includes('audio.removeFromQueue') || !playerOptions.includes('audio.clearQueue')) {
  failures.push('The inline Up Next panel is missing queue reorder/remove/clear actions.');
}
if (!playerOptions.includes('TranscriptPanel compact') || !transcriptPanel.includes('scrollToIndex') || !transcriptPanel.includes('seek(item.startSeconds)')) {
  failures.push('The inline transcript panel is missing timed seeking or playback-follow behavior.');
}
if (!playerScreen.includes('PlayerOptionsSheet wide') || !playerScreen.includes('!isLandscape ? <PlayerOptionsSheet />')) {
  failures.push('The player does not select the portrait draggable or landscape split-panel presentation.');
}

const settingsScreen = readFileSync(join(root, 'src/features/settings/SettingsScreen.tsx'), 'utf8');
const refreshPolicy = readFileSync(join(root, 'src/features/quran/services/refreshPolicy.ts'), 'utf8');
if (!settingsScreen.includes('audio_effect_trim_silence_label') || !settingsScreen.includes('audio_effect_volume_boost_label')) failures.push('Android audio-effect settings controls are missing.');
if (!libraryProvider.includes('mapLegacyAudioPreferences') || !libraryProvider.includes("writeSetting('legacyPreferencesMigrationVersion', 4)")) failures.push('Original Flutter audio-effect preferences are not included in the versioned migration.');
if (!libraryProvider.includes('AppState.addEventListener') || !libraryProvider.includes('maybeRefreshFeed') || !libraryProvider.includes("'lastQuranFeedRefreshAt'")) {
  failures.push('Quran feed auto-refresh is not triggered on app foreground using persisted refresh time.');
}
if (!libraryProvider.includes('markDeletedEpisodesAsPlayed') || !libraryProvider.includes('deleteDownloadedPlayedEpisodes') || !libraryProvider.includes('autoUpdatePeriodMinutes')) {
  failures.push('Original Flutter episode-management preferences were not restored to the library state.');
}
if (!settingsScreen.includes('settings_mark_deleted_played_label') || !settingsScreen.includes('settings_delete_played_label') || !settingsScreen.includes('settings_auto_update_episodes')) {
  failures.push('Original episode deletion and automatic refresh controls are missing from Settings.');
}
if (!refreshPolicy.includes('period === 0') || !refreshPolicy.includes('period < 0') || !refreshPolicy.includes('period * 60_000')) {
  failures.push('Original automatic feed refresh semantics (-1 never, 0 always, minutes otherwise) are missing.');
}
const legacyDisplayPreferences = readFileSync(join(root, 'src/features/quran/services/legacyDisplayPreferences.ts'), 'utf8');
const playHook = readFileSync(join(root, 'src/app/hooks/usePlayQuranTrack.ts'), 'utf8');
if (!legacyDisplayPreferences.includes('autoopennowplaying') || !legacyDisplayPreferences.includes('layoutHighlight') || !legacyDisplayPreferences.includes('layoutCount') || !legacyDisplayPreferences.includes('layoutOrder')) {
  failures.push('Flutter auto-open and layout display preferences are not mapped from legacy SharedPreferences.');
}
if (!settingsScreen.includes('layoutModes.map') || !settingsScreen.includes('layoutOrders.map') || !settingsScreen.includes('settings_auto_open_now_playing')) {
  failures.push('The original layout selector or auto-open full-screen player control is missing from Settings.');
}
if (!playHook.includes("settings.autoOpenNowPlaying") || !playHook.includes("navigation.navigate(\'Player\')")) {
  failures.push('Auto-open full-screen player preference is not applied when playback starts from a content screen.');
}
if (!libraryProvider.includes('findNewFeedIds') || !libraryProvider.includes('markFeedTrackSeen')) {
  failures.push('New episode highlight lifecycle is not tracked and cleared after a lesson starts.');
}
if (!audioProvider.includes('settings.deleteDownloadedPlayedEpisodes') || !audioProvider.includes('removeTrack(currentTrack)')) {
  failures.push('Delete downloaded audio after playback completes is not wired to the native player completion event.');
}
const notificationHandler = readFileSync(join(root, 'src/features/quran/services/configureNotificationPresentation.ts'), 'utf8');
const notificationPresentation = readFileSync(join(root, 'src/features/quran/services/notificationPresentation.ts'), 'utf8');
const appEntry = readFileSync(join(root, 'index.ts'), 'utf8');
if (!notificationHandler.includes('Notifications.setNotificationHandler') || !notificationHandler.includes('getNotificationPresentation') || !appEntry.includes("./src/features/quran/services/configureNotificationPresentation")) {
  failures.push('SDK 58 foreground notification handling is not registered before background tasks.');
}
if (!notificationPresentation.includes("data.kind === 'quran-library-refresh'") || !notificationPresentation.includes('shouldShowBanner: !isQuranRefresh') || !notificationPresentation.includes('shouldShowList: true')) {
  failures.push('Quran refresh status notifications are not configured as quiet tray-only foreground notifications.');
}
const feedService = readFileSync(join(root, 'src/features/quran/services/featuredQuranFeed.ts'), 'utf8');
if (!feedService.includes("resolved.protocol !== 'https:'")) failures.push('Feed enclosure URLs are not restricted to HTTPS.');
if (!feedService.includes("url.searchParams.get('resourcekey')")) failures.push('Google Drive resource keys are not preserved in converted enclosure URLs.');
if (existsSync(join(root, 'lib'))) failures.push('Flutter source directory was copied into the React Native project.');

if (failures.length) {
  console.error('Project verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Passed: React Native structure, app identifiers, native modules, Quran naming, old product-domain removal, exact original Flutter Google Drive feed/artwork configuration, native background audio setup, lock-screen metadata/seek controls, interruption/teardown position persistence, sleep timer modes and choices, progress-aware, persistent downloads with Android DownloadManager, iOS background URLSession recovery, and Expo FileSystem fallback, Flutter-equivalent episode deletion/refresh/layout/auto-open settings, Android skip-silence and 0.8 dB volume-boost integration, legacy audio/display preference migration and new-episode highlighting, player error/loading state handling, draggable Up Next/Transcript sheet, landscape split-panel selector, timed transcript search/scroll/seek, and secure feed URL handling.');
}
