const quranFeed = require('./src/features/quran/config/feed.json');

/** @type {import('expo').ExpoConfig} */
const config = {
  name: 'Sheademtula',
  slug: 'sheademtula',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'sheademtula',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'shademtula.app',
    supportsTablet: true,
    infoPlist: {
      UIBackgroundModes: ['audio'],
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false }
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1']
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1']
        }
      ]
    }
  },
  android: {
    package: 'shademtula.app',
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#07140F'
    },
    permissions: ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK']
  },
  plugins: [
    ['expo-audio', { enableBackgroundPlayback: true, enableBackgroundRecording: false }],
    './plugins/withExpoAudioPlayerEffects',
    'expo-sqlite',
    'expo-background-task',
    ['expo-notifications', { enableRemoteNotifications: false }],
    'expo-document-picker',
    ['expo-localization', { supportsRTL: true, supportedLocales: { ios: ['en', 'de', 'es', 'gl', 'it', 'nl', 'ru', 'tr', 'vi', 'zh-Hans', 'om', 'am', 'ar'], android: ['en', 'de', 'es', 'gl', 'it', 'nl', 'ru', 'tr', 'vi', 'zh-Hans', 'om', 'am', 'ar'] } }],
    'expo-font',
    ['expo-splash-screen', { image: './assets/icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#07140F' }]
  ],
  assetBundlePatterns: ['assets/**/*'],
  extra: {
    appIdentity: 'shademtula.app',
    audioCatalogMode: 'single-featured-google-drive-rss',
    quranFeedProvider: quranFeed.provider,
    quranFeedUrl: quranFeed.feedUrl,
    quranArtworkUrl: quranFeed.artworkUrl,
    additionalFeedDiscoveryEnabled: false,
  }
};

module.exports = config;
