import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = read('src/features/home/HomeScreen.tsx');
const tafsiira = read('src/features/tafsiira/TafsiiraScreen.tsx');
const player = read('src/features/player/PlayerScreen.tsx');
const playerOptions = read('src/features/player/PlayerOptionsSheet.tsx');
const transcriptPanel = read('src/features/transcripts/TranscriptPanel.tsx');
const seenaa = read('src/features/seenaa/SeenaaScreen.tsx');
const sharedScreen = read('src/shared/components/Screen.tsx');
const topBar = read('src/shared/components/TopBar.tsx');
const tabs = read('src/navigation/MainTabs.tsx');
const settings = read('src/features/settings/SettingsScreen.tsx');
const libraryProvider = read('src/features/quran/state/QuranLibraryProvider.tsx');
const playHook = read('src/app/hooks/usePlayQuranTrack.ts');
const episodeDetails = read('src/features/quran/components/QuranEpisodeDetailsSheet.tsx');
const downloadsScreen = read('src/features/downloads/DownloadsScreen.tsx');
const searchScreen = read('src/features/search/SearchScreen.tsx');
const layoutPolicy = read('src/features/quran/services/layoutPolicy.ts');
const text = read('src/tds/components/Text.tsx');

test('Home uses only the original featured Quran feed and alphabetically ordered feed episodes', () => {
  assert.match(home, /sourceType === 'featured-google-drive'/);
  assert.match(home, /localeCompare\(right\.title, undefined, \{ sensitivity: 'base' \}\)/);
  assert.match(home, /recommended\.map\(track =>/);
  assert.doesNotMatch(home, /recommended\.slice\(/);
  assert.match(home, /await playTrack\(recommended\[0\]\)/);
  assert.match(home, /usePlayQuranTrack/);
  assert.match(home, /home_recommended_label/);
  assert.match(home, /home_featured_subtitle/);
  assert.match(home, /QuranArtwork uri=\{featuredTracks\[0\]\?\.imageUrl\}/);
});

test('Tafsiira matches the original collection header and episode-list actions', () => {
  assert.match(tafsiira, /sortQuranTracks\(feedTracks, settings\.layoutOrder\)/);
  assert.match(tafsiira, /usePlayQuranTrack/);
  assert.match(tafsiira, /QuranArtwork uri=\{feedTracks\[0\]\?\.imageUrl\} style=\{styles\.art\}/);
  assert.match(tafsiira, /Sheikh Aadam Tuulaa/);
  assert.match(tafsiira, /t\('play_all_label'\)/);
  assert.match(tafsiira, /t\('shuffle_label'\)/);
  assert.match(tafsiira, /t\('all_episodes_label'\)/);
  assert.match(tafsiira, /sortedFeedTracks\.map\(\(track\)/);
  assert.doesNotMatch(tafsiira, /localTracks|importMoreAudio/);
});

test('Player includes the original detail tabs and lower Up Next/Transcript selector', () => {
  assert.match(player, /type DetailTab = 'chapters' \| 'episode' \| 'notes'/);
  assert.match(player, /key: 'chapters'/);
  assert.match(player, /key: 'episode'/);
  assert.match(player, /key: 'notes'/);
  assert.match(player, /PlayerOptionsSheet/);
  assert.match(playerOptions, /t\('up_next_queue_label'\)/);
  assert.match(playerOptions, /t\('transcript_label'\)/);
  assert.match(player, /!isLandscape \?/);
  assert.match(player, /chapters\[activeChapterIndex\]\?\.imageUrl/);
  assert.match(player, /parseChapters\(payload\)/);
  assert.match(player, /audio\.seek\(chapter\.startSeconds\)/);
});

test('Player options reproduce the draggable queue/transcript selector and queue actions', () => {
  assert.match(playerOptions, /PanResponder\.create/);
  assert.match(playerOptions, /Animated\.spring/);
  assert.match(playerOptions, /COLLAPSED_HEIGHT = 68/);
  assert.match(playerOptions, /audio\.queue\.map/);
  assert.match(playerOptions, /audio\.reorderQueue/);
  assert.match(playerOptions, /audio\.removeFromQueue/);
  assert.match(playerOptions, /audio\.clearQueue/);
  assert.match(playerOptions, /TranscriptPanel compact/);
  assert.match(playerOptions, /floatingPlayer/);
  assert.match(player, /PlayerOptionsSheet wide/);
});

test('Transcript panel restores timed seeking, text search and playback-follow scrolling', () => {
  assert.match(transcriptPanel, /useTranscriptData/);
  assert.match(transcriptPanel, /scrollToIndex/);
  assert.match(transcriptPanel, /setFollowPlayback/);
  assert.match(transcriptPanel, /onPress=\{\(\) => seek\(item\.startSeconds\)\}/);
  assert.match(transcriptPanel, /search_transcript_label/);
});

test('Seenaa retains the original featured artwork and both biography videos', () => {
  assert.match(seenaa, /QuranArtwork uri=\{featuredArtwork\}/);
  assert.match(seenaa, /lZFKIvMSgVI/);
  assert.match(seenaa, /6zMLEeJTtvk/);
  assert.match(seenaa, /biography as BiographyBlock\[\]/);
});

test('Shared screen, text, top bar and bottom navigation declare RTL direction', () => {
  assert.match(sharedScreen, /const direction = isRTL \? 'rtl' : 'ltr'/);
  assert.match(sharedScreen, /SafeAreaView[^\n]*direction/);
  assert.match(text, /writingDirection: isRTL \? 'rtl' : 'ltr'/);
  assert.match(topBar, /direction: isRTL \? 'rtl' : 'ltr'/);
  assert.match(tabs, /tabBarStyle: .*direction: isRTL \? 'rtl' : 'ltr'/);
});

test('Settings restore original layout modes, sort order, highlight/count and auto-open controls', () => {
  assert.match(settings, /layoutModes\.map/);
  assert.match(settings, /layoutOrders\.map/);
  assert.match(settings, /settings_auto_open_now_playing/);
  assert.match(settings, /layout_selector_highlight_new_episodes/);
  assert.match(settings, /layout_selector_unplayed_episodes/);
  assert.match(libraryProvider, /mapLegacyDisplayPreferences/);
  assert.match(libraryProvider, /legacyPreferencesMigrationVersion/);
  assert.match(libraryProvider, /markFeedTrackSeen/);
  assert.match(playHook, /settings\.autoOpenNowPlaying/);
  assert.match(playHook, /state\.routes\[state\.index\]/);
  assert.match(layoutPolicy, /sortQuranTracks/);
  assert.match(layoutPolicy, /findNewFeedIds/);
});

test('Featured source title and metadata are retained from the Flutter implementation', () => {
  const feedConfig = JSON.parse(read('src/features/quran/config/feed.json'));
  assert.equal(feedConfig.provider, 'featured-google-drive');
  assert.equal(feedConfig.artist, 'Sheikh Aadam Tuulaa');
  assert.equal(feedConfig.collection, 'Tafsiira Afaan Oromoo');
});



test('Quran episode details restore the Flutter detail sheet actions across content, downloads and search', () => {
  assert.match(episodeDetails, /Modal visible=\{visible\}/);
  assert.match(episodeDetails, /descriptionTitle/);
  assert.match(episodeDetails, /setTrackPlayed/);
  assert.match(episodeDetails, /audio\.addToQueue/);
  assert.match(episodeDetails, /audio\.removeFromQueue/);
  assert.match(episodeDetails, /buildEpisodeShareMessage/);
  assert.match(episodeDetails, /removeTrack/);
  assert.match(episodeDetails, /downloadTrack/);
  assert.match(tafsiira, /QuranEpisodeDetailsSheet/);
  assert.match(downloadsScreen, /QuranEpisodeDetailsSheet/);
  assert.match(downloadsScreen, /onMore=\{\(\) => setDetailsTrack\(track\)\}/);
  assert.match(searchScreen, /QuranEpisodeDetailsSheet/);
  assert.match(searchScreen, /onMore=\{\(\) => setDetailsTrack\(track\)\}/);
});


test('foreground and manual Quran feed refreshes bracket work with the optional silent status notification', () => {
  const provider = read('src/features/quran/state/QuranLibraryProvider.tsx');
  const notifications = read('src/features/quran/services/backgroundQuranRefresh.ts');
  assert.match(provider, /settings\.backgroundRefreshNotifications[\s\S]*beginQuranRefreshStatusNotification\(settings\.language\)/);
  assert.match(provider, /finishQuranRefreshStatusNotification\(refreshNotificationId\)/);
  assert.match(notifications, /sound: false/);
  assert.match(notifications, /interruptionLevel: 'passive'/);
});
