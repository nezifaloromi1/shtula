# Shead emtula — React Native migration

Shead emtula is the React Native/TypeScript replacement project for the uploaded Flutter app. It targets Expo SDK 58 and React Native 0.88, uses React Navigation 7, Expo Audio, SQLite and local Expo native modules. The Android application ID and iOS bundle identifier remain `shademtula.app`; shipping an update also requires the original signing identity.

## Audio catalog policy

The app uses one built-in Quran audio catalog: the original Sheikh Aadam Tuulaa Google Drive-hosted RSS feed. The feed and artwork URLs are copied exactly from the Flutter defaults in `lib/core/environment.dart` and centralized in `src/features/quran/config/feed.json`. There are no sample episodes or mock feed fallbacks. RSS is retained only as the transport format for this one configured catalog; its audio enclosures can stream or be downloaded into the private library.

The app does not include iTunes/PodcastIndex discovery, arbitrary RSS subscriptions, general podcast directory search, OPML subscription import/export, or Google Drive folder browsing/API access. The feed and library remain usable with cached entries and downloaded audio when the remote feed is unavailable.

## Structure

```text
sheademtula/
├── android/
├── ios/
├── modules/
│   ├── sheademtula-local-library/   # Kotlin + Swift local-file/preferences module
│   ├── sheademtula-audio-effects/   # Android audio-session effects
│   ├── sheademtula-android-downloads/ # Android system DownloadManager integration
│   └── sheademtula-ios-downloads/  # iOS background URLSession integration
├── assets/                          # Original Shadam artwork and Inter fonts
├── src/
│   ├── app/                          # App entry, audio provider, lifecycle and playback policy
│   ├── navigation/                   # Root stack and four main tabs
│   ├── tds/                          # Design tokens, themes and shared components
│   ├── features/
│   │   ├── quran/                    # Featured feed, audio models, library and downloads
│   │   ├── home/
│   │   ├── tafsiira/
│   │   ├── seenaa/
│   │   ├── downloads/
│   │   ├── search/
│   │   ├── player/
│   │   ├── queue/
│   │   ├── chapters/
│   │   ├── transcripts/
│   │   ├── show-notes/
│   │   └── settings/
│   ├── shared/
│   ├── localization/                 # 13 selectable locale catalogs
│   └── storage/                      # SQLite persistence and legacy migration
├── tools/legacy-exporter/            # Read-only Dart/Sembast database exporter
├── docs/
├── scripts/
├── app.config.js
├── index.ts
└── package.json
```

All React Native application code is under `src/`. Custom native code is under the root `modules/` directory and is discovered by Expo autolinking. The app's native module requires a development/native build; Expo Go cannot load it.

## Localization

The app supports 13 selectable locales: English, Afaan Oromoo, Amharic, Arabic, German, Spanish, Galician, Italian, Dutch, Russian, Turkish, Vietnamese and Simplified Chinese. The initial preference follows the device language; users can override it in Settings, and the choice is persisted in SQLite. Language names are displayed in their native scripts.

Afaan Oromoo and Amharic use left-to-right layout. Arabic uses right-to-left layout through React Native's `I18nManager` and the Expo Localization config. When changing between LTR and RTL, the app asks the user to close and reopen it so the native layout direction can take effect. The shared text component leaves Ethiopic and Arabic glyph rendering to the platform's native font fallback rather than forcing the Latin-only Inter family.

Afaan Oromoo, Amharic and Arabic currently translate all 161 active UI strings checked by `scripts/verify-localization.mjs`; other legacy catalog entries fall back to English. The original Quran feed metadata, Sheikh Aadam Tuulaa biography and lesson content are source content and are not automatically translated. Translation wording has not yet had a professional native-speaker review. The verifier checks active key coverage and interpolation placeholders for the three new locales.

## Legacy data migration

The native module attempts a non-destructive copy of supported audio files from the previous Flutter app's private `AnyTime` directory. It reads compatible platform preferences without clearing them. For database history, a read-only Sembast exporter under `tools/legacy-exporter` creates a versioned JSON backup, which can be imported from Settings. The import restores the featured Quran feed's episode progress, queue, cached transcripts and chapter markers; it does not recreate unrelated remote-feed subscriptions. See `docs/LEGACY_DATA_MIGRATION.md`.

The uploaded ZIP contains source code, not a user's private database or downloaded media. Full personal-data migration therefore requires access to the installed app's sandbox or a backup export. Original files/preferences are not deleted by the migration.

## Install and run

Requirements: Node.js 22.13 or newer, npm, Android Studio/Android SDK for Android, and macOS/Xcode/CocoaPods for iOS. Run `npm run check:build-environment` for a machine-specific preflight. `npm run typecheck` uses the project-local compiler and reports missing prerequisites without falling back to a global `tsc`. SDK 58 requires Node.js 22.13 or newer. See `docs/RUNTIME_RELIABILITY.md` for startup/feed failure recovery, `docs/BUILD_READINESS.md` for native build requirements, `docs/CI.md` for automated source checks and Android/iOS simulator build workflows, `docs/SDK58_DEPENDENCY_BASELINE.md` for the SDK 58 package versions and dependency decisions, and `docs/IOS_PRIVACY.md` for required-reason API declarations and archive-level validation steps.

This archive does not yet include `package-lock.json` because the build environment could not resolve the npm registry. Before the first install, run the GitHub Actions workflow **Bootstrap npm lockfile**, download its `package-lock.json` artifact, review it and commit it to the repository. On a networked local machine, the same bootstrap is `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` followed by `node scripts/check-lockfile.mjs`. After the lockfile is committed, use `npm ci` for every clean install. CI rejects package-only installs so dependency resolution cannot silently drift.

```bash
npm ci
npm run verify
npm run verify:localization
npm run test:legacy-migration
npm run test:feed-refresh-policy
npm run test:legacy-sqlite-integration
npm run test:playback-policy
npm run test:screen-parity
npm run test:layout-policy
npm run test:legacy-display-preferences
npm run verify:all
npm run check:build-environment
npm run check:sdk58-native-dependencies
npm run check:live-feed
npm run typecheck
npx expo-doctor
npx expo prebuild
npm run android
# On macOS:
npm run ios
```

`npm run check:live-feed` makes a real HTTP request to the original Google Drive feed and checks the RSS channel/audio enclosures. The current build environment may not have external DNS/network access; in that case the live-feed test must be repeated from a networked machine.

## Verification and known limitations

The current source checkpoint includes a single-feed catalog, native audio playback integration, Android OS-managed downloads with persisted task IDs, native iOS background URLSession downloads and an Expo Go/legacy FileSystem pause-resume fallback, SQLite caching, the versioned legacy importer, all thirteen locale catalogs, a portrait draggable player options sheet, a landscape options pane, a reusable timed transcript panel, a Quran episode details sheet with playback/queue/played/download/delete/share actions, Tafsiira collection options for bulk played-state changes, manual feed refresh and collection sharing, and source-level tests. Settings now preserve the original episode-deletion preferences, auto-open player preference, layout mode, list sort order, new-item highlighting, unplayed-count display, all original feed-refresh intervals and background-refresh/mobile-data/notification settings (three-hour default). See `docs/SETTINGS_PARITY.md` for the Flutter-to-RN preference map. The original list, compact-grid and grid modes are available. The one-feed implementation applies the sort choices to the episode list; `Date followed` uses the local first-added timestamp because this app has one built-in collection rather than a multi-subscription directory. New-item markers clear when an item is started. Refresh is checked on initial load and when the app returns to the foreground. The refresh selector restores the Flutter options Never, Always, 10m, 30m, 1h, 3h, 6h, 12h, 24h and 48h. OS-scheduled background refresh is opt-in, uses Wi-Fi by default with explicit mobile-data permission, and can show a silent, temporary library-update status notification while the refresh is running; it is dismissed when the refresh completes. The SDK 58 foreground notification handler keeps this refresh status in the notification list without a heads-up banner or sound, while preserving normal foreground presentation for other notification types. Android uses WorkManager and iOS uses BGTaskScheduler; neither platform guarantees exact execution times, and the 10-minute preference is clamped to the scheduler's 15-minute minimum. Background-discovered IDs are saved so NEW markers appear after returning to the app. See `docs/BACKGROUND_REFRESH.md` for platform limits and testing steps. The player also matches Flutter queue semantics: an explicit queue always advances; when the queue is empty, continuous play selects the next unplayed Quran item after the current one in latest-first feed order without wrapping. Android feed downloads are managed by the Android system DownloadManager; native iOS builds use a background URLSession with an AppDelegate event subscriber, persisted task metadata and recovery after normal system termination. Expo Go and pre-existing iOS FileSystem pause snapshots use the Expo FileSystem pause/resume fallback. iOS background URLSession transfers are cancelled when the user force-quits the app from the app switcher. See `docs/BACKGROUND_DOWNLOADS.md` and `docs/AUDIO_ENGINE.md` for lifecycle, storage and recovery limitations.

The test suite includes mocked transaction-boundary tests, real SQLite integration tests using Node's built-in `node:sqlite` (Node 22.5+), focused foreground/background feed-refresh policy tests, playback-order tests, layout-policy tests, legacy Settings preference migration tests, screen-contract checks, download pause/resume tests, Android DownloadManager lifecycle tests, and iOS background URLSession module plus mocked service-recovery tests. `npm run verify:all` runs the complete source-level suite in one command. These verify migration mapping, local-file de-duplication, queue/transcript/chapter persistence, import idempotency, refresh intervals, queue/continuous-play selection, download recovery, SQLite/native task checkpoint storage, iOS enclosure refresh/cancellation and orphan-task recovery, and static screen/source contracts; they are not a physical-device migration test.

This is still a migration checkpoint, not a claim of complete production parity. Remaining verification/work includes full TypeScript semantic typechecking after dependency installation, Expo prebuild, Android and iOS application builds, physical-device background audio tests, physical-device Android DownloadManager reboot/connectivity/notification and process-stop tests, plus iOS background URLSession relaunch/cancellation lifecycle tests, live Google Drive checks, pixel-level screen comparison, physical-device validation of legacy preference import/layout behavior and Android skip-silence/volume-boost audio output, remaining screen-level Flutter UI details, device-rendered accessibility/layout behavior for the episode sheet, and validation of real-user Sembast exports and downloaded-file paths.

No signing keystore or password is bundled. Configure the original signing identity securely before attempting an in-place store update.

## Screen parity

See `docs/SCREEN_PARITY.md` for the current screen-by-screen Flutter reference and React Native implementation audit, including known differences and verification boundaries. The screen contract tests are `npm run test:screen-parity`, `npm run test:transcript-parser` and `npm run test:episode-details`; these are source and parser tests, not screenshot or rendered visual tests.

## Android audio processing

Android additionally supports Flutter-parity **Trim Silence** and **Volume Boost** through the existing Media3 player. Both settings default off; Volume Boost uses the original 0.8 dB target. These controls require a native/development build (not Expo Go) and still need physical-device verification.
