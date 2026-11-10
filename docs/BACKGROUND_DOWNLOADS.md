# Background Quran audio downloads

The download transport is selected by platform and native-module availability. All platforms ultimately store completed audio in the same app-private `quran_library` directory and use `quran_downloads` to reconnect a transfer to its Quran feed item.

## Android

Android uses the platform `DownloadManager` through `modules/sheademtula-android-downloads`. The OS owns the HTTP transfer and its progress/retry state. The JavaScript layer stores the system task ID and polls only while the app is active; after process recreation it reattaches to the same request. Completed temporary files are validated and copied into the app-private library before the task metadata is cleaned up.

## iOS native builds

Native iOS builds use one background `URLSession` owned by `modules/sheademtula-ios-downloads`:

- A fixed identifier (`shademtula.app.quran-audio-downloads`) lets the system reassociate in-flight work after normal system termination and app relaunch.
- `sessionSendsLaunchEvents` is enabled. The Expo `QuranDownloadsAppDelegateSubscriber` receives `application(_:handleEventsForBackgroundURLSession:completionHandler:)`, stores the completion handler, and recreates the same session.
- `URLSessionDownloadDelegate` moves the temporary response file into `Documents/quran_library` before its callback returns. The file is checked for a successful HTTP response, non-empty content, and obvious HTML/JSON/XML error payloads.
- The native task-to-track mapping is persisted to `UserDefaults` before `resume()` and mirrored in SQLite. That allows recovery if the JavaScript process stops between enqueue and the SQLite write.
- The JavaScript layer polls while foregrounded. The OS-managed transfer continues independently while the app is suspended; completion events are delivered through the app-delegate subscriber.
- After the library row has been updated, the successful task metadata is removed without deleting the file used by playback. Failed/cancelled task cleanup removes only files that were not linked into the library.

Apple's background sessions support HTTP/HTTPS transfers in a separate process. If iOS terminates the app normally, it can relaunch it to deliver transfer events. This is not a guarantee after the user force-quits the app from the app switcher: Apple documents that this cancels background session transfers and does not automatically relaunch the app. Transfers are also subject to platform networking and storage constraints. See [Apple's background URLSession configuration](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:)) and [background download lifecycle](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background).

## Expo Go and upgrade fallback

Expo Go does not autolink the local iOS module. It continues to use Expo FileSystem's `DownloadTask` pause/resume checkpoint flow. The same fallback is retained for pre-existing iOS downloads from older app versions: records with a valid FileSystem pause state are resumed instead of being silently discarded during upgrade. New iOS downloads in native builds use background `URLSession`.

## Persistence and cleanup

SQLite stores the Quran item ID, request URL, destination marker, progress and native task ID. On iOS, native `UserDefaults` stores the mapping before a URLSession task is resumed; it is used to recover a native task if the app stopped before SQLite was updated. The final completed audio file remains in `quran_library`; temporary task metadata is removed after the catalog row is linked. Cancel removes the active request and unlinked partial/completed file.

## Physical-device validation checklist

The native URLSession implementation is source-verified but has not yet been compiled or exercised on an iOS device in this environment. Validate it on a development build before release:

1. Start a large HTTPS Quran audio download over Wi-Fi, background the app, and verify it continues while suspended.
2. Repeat over cellular with the app backgrounded; confirm the OS networking policy and user setting are respected.
3. Allow iOS to terminate the app normally while suspended, then verify the same task is reconnected and the completion callback is delivered after relaunch.
4. Do **not** use swipe-to-force-quit as a success case; Apple documents that it cancels background transfers.
5. Turn connectivity off and back on during a transfer; inspect whether the URLSession task resumes or reports a retryable failure.
6. Cancel a running transfer and verify the partial file and SQLite/UserDefaults task records are removed.
7. Simulate an app stop after native completion but before SQLite links the file; verify recovery links the already-downloaded file without downloading it again or deleting it.
8. Refresh the feed so an item's enclosure URL changes; verify the stale task is cancelled and not attached to the new URL.
9. Upgrade from a build containing an Expo FileSystem pause checkpoint; verify it remains resumable on iOS.
10. Verify the completed file plays offline after relaunch and remains in the app-private library after task metadata cleanup.

The source-level iOS tests validate configuration, persistence order, response checks, delegate wiring and SQLite integration. They do not replace Xcode compilation, App Store archive inspection or physical-device lifecycle tests.
