# Audio engine implementation and parity notes

## Native playback engine

The app uses the Expo SDK 58 `expo-audio` native player. It is not an HTML audio element or a JavaScript timer-based mock. The app config enables `enableBackgroundPlayback`, and `AudioProvider` configures:

- playback in silent mode;
- background playback;
- exclusive audio focus (`doNotMix`), required by Expo Audio lock-screen controls;
- native lock-screen / Android media-notification metadata and cover artwork;
- native seek-backward and seek-forward controls;
- playback rates from 0.5x through 2.0x in 0.1x increments.

The player persists playback position every five seconds, when paused, when the operating system pauses playback (for example, an audio-focus interruption), when the app transitions to inactive/background, and when the provider is torn down. Duration, played state, selected item, playback speed and queue are persisted in SQLite. A failed native load clears the pending-load state and is shown in the player UI instead of leaving the UI in a permanent loading state.

Android background playback depends on the `expo-audio` config plugin adding the media-playback foreground service and permissions. iOS background playback depends on the `audio` background mode and the native playback audio session. Build a development/native app after config changes; Expo Go does not load the app's local native module.

## Controls preserved from Flutter

- rewind: 10 seconds;
- fast-forward: 30 seconds;
- playback rate: 0.5x–2.0x, 0.1x steps;
- play/pause, seek, next/previous, queue ordering and saved position;
- current item remains at the head of an existing queue when the user starts another item manually;
- downloaded files are preferred over streaming URLs.

The Expo Audio lock-screen API exposes native seek-backward/forward buttons, but does not expose separate configurable intervals for those system buttons. The on-screen Flutter-equivalent fast-forward action remains exactly 30 seconds. Do not claim that the system lock-screen forward interval matches Flutter's 30-second setting without device verification.

## Android audio processing

The Android player keeps Expo Audio's Media3 ExoPlayer instance and adds two narrow native integrations: `skipSilenceEnabled` is exposed on the existing player and delegates to Media3 `ExoPlayer.setSkipSilenceEnabled`; volume boost attaches Android `LoudnessEnhancer` to that player's `audioSessionId`. The `withExpoAudioPlayerEffects` config plugin patches the pinned SDK 58 `AudioModule.kt` source and fails prebuild if the expected player-property anchor or SDK major version changes.

Volume boost uses the original Flutter target of 0.8 dB, expressed as 800 millibels for Android's `LoudnessEnhancer` API. Both controls are Android-only, default off, persisted with preferences and restored from the original Flutter `trimSilence` and `volumeBoost` keys. The native module returns `false` if the platform audio effect cannot be attached; the app then turns the volume-boost preference back off rather than leaving a false enabled state. The controls require a native/development build; Expo Go does not include this project-local module or the patched Expo Audio player properties.

The custom patch is intentionally isolated to the Expo Audio Android `AudioPlayer` class. It does not replace ExoPlayer, its MediaSession, service connection, foreground service, queue, or lock-screen metadata. The native session ID is read only after a source is loaded, and the loudness enhancer is released when the native module is destroyed. Device-level audio output, skip-silence transitions, audio focus, Bluetooth/headphone behavior, and loudness-effect availability still require physical Android testing before production release.

Android downloads now use the platform `DownloadManager` through the local `sheademtula-android-downloads` Expo module, matching the architecture of the original Flutter `flutter_downloader` service without adding a third-party downloader dependency. The system service owns the HTTP transfer, progress/retry state and completion notification; the request is constrained to HTTPS, uses the app User-Agent, and writes first into an app-specific external files directory. When the transfer reports success, native code copies it into the existing private `files/quran_library` directory and returns a `file://` URI to the app. SQLite stores the system download ID, source URL, destination marker and last observed byte counts, so the JS layer can reconnect to a pending or completed system request after the app process is recreated. Tapping cancel removes the system request and its partial file. After the catalog row is linked, the native completed request is removed to clear the temporary copy and system notification.

Android's system `DownloadManager` is explicitly designed for long-running HTTP transfers and retries after connectivity changes and system reboots. Transfers do not depend on a live React Native JS task; the app only polls while foregrounded and reattaches to the persisted system request when it returns. The final audio remains in internal app storage after the download manager's temporary app-specific external file is cleaned up. The system notification is managed by Android; device notification settings can affect its visibility. A force-stop, app uninstall, removed external volume, expired/invalid source URL, or OS/vendor-specific restrictions can still prevent completion and should not be represented as guaranteed-success cases.

On native iOS builds, audio downloads use the local `sheademtula-ios-downloads` module and one system-managed background `URLSession`. The fixed session identifier is recreated during module startup and on the AppDelegate background-session callback; the completion handler is invoked on the main queue after URLSession has delivered all delegate events. Downloaded temporary response files are validated and moved into the same `Documents/quran_library` folder used by the local-library module. Native task mappings are saved to UserDefaults before task resume and mirrored into SQLite. The app reconnects to native tasks after normal system termination and relaunch; user force-quit from the app switcher cancels these background transfers and is not a supported continuation case (Apple platform behavior).

Expo Go cannot load the local iOS module, so it retains Expo FileSystem's `DownloadTask` pause/resume checkpoint flow. The same path remains available to resume legacy checkpoints created by older app versions. On native Android builds, the app uses the local system DownloadManager module; if that module is unavailable, Expo FileSystem remains the fallback. Physical-device testing remains required for Android reboot/connectivity recovery, iOS URLSession relaunch/cancellation behavior, storage pressure, URL changes during transfer, and cleanup races. See `docs/BACKGROUND_DOWNLOADS.md` for lifecycle details and the iOS device-test checklist.

## Background Quran feed refresh

Scheduled feed refresh is handled by `expo-background-task`/`expo-task-manager`, not a JavaScript timer. The task is registered at module scope and imports only the existing single Google Drive Quran feed. The current refresh interval and Wi-Fi/cellular preference are read from SQLite at execution time. New item IDs are persisted for the existing NEW-marker UI. When enabled, a quiet local “Library Update” notification is shown during foreground/manual and OS-scheduled refreshes and dismissed on completion (with stale-notification cleanup on a later task run). The OS controls execution timing; Android WorkManager requires a minimum 15-minute interval, and iOS BGTaskScheduler may defer work beyond the requested interval. This feature has not yet been validated by a native build or physical-device background scheduling test. See `docs/BACKGROUND_REFRESH.md`.

## Validation

Source validation checks include TypeScript/TSX transpile syntax, app config, exact original feed URL/artwork, required lock-screen setup, no demo feed data, and module declarations. These checks are not a substitute for Xcode/Gradle builds, physical-device lock-screen tests, interruption/headphone tests, or a live Google Drive request.

## Sleep timer

The player includes the Flutter timer choices: Off, 5, 10, 15, 30, 45 and 60 minutes, and End of audio. Timed mode uses an absolute deadline rather than decrementing a counter, so returning from an app suspension recalculates the remaining time correctly. The countdown pauses playback and flushes the latest saved position when the deadline has expired. End of audio stops the current item instead of advancing to the next queue item.

The timer state is intentionally in-memory, matching the original Flutter behavior where the sleep timer is not restored after a process restart. A JavaScript interval is not a reliable background scheduler on iOS or Android: the timer is rechecked when the app becomes active, but exact expiry while the app is suspended or the screen is locked has not been verified. Guaranteed locked-background expiry requires a native timer tied to the platform media session, followed by physical-device testing.

## Audio downloads

Feed audio downloads use native OS-managed transfers when the project local module is available: Android `DownloadManager` and iOS background `URLSession`. Both persist a native task ID and reconnect after the app process is stopped by the OS; final files are moved into the same app-private `quran_library` directory used by local imports and legacy file migration. Expo Go and older iOS FileSystem checkpoints retain the Expo FileSystem pause/resume fallback, which is not an OS-managed background worker and may restart from zero if its saved checkpoint cannot be restored. User force-quit semantics differ by platform; on iOS, swiping the app away cancels background URLSession transfers. All native lifecycle and cleanup paths still need physical-device verification. See `docs/BACKGROUND_DOWNLOADS.md`.
