# Runtime reliability checks

## Startup and local storage

`QuranLibraryProvider` initializes SQLite, migrates legacy local audio/preferences, restores saved settings and queue/download state, then marks the app ready. Failures in required startup work are stored in provider state rather than only shown through an alert. `AppShell` hides the native splash screen once the startup attempt completes and renders `StartupErrorScreen` when initialization fails. That screen displays a localized explanation and a retry action; the audio provider/navigation tree is not mounted while the database is unavailable.

The retry increments a dedicated startup-attempt counter. The initialization effect intentionally does not depend on settings-aware refresh callback identity, because reading persisted preferences changes that callback and must not restart database migration a second time.

## Feed request lifecycle

`fetchFeedXml` owns one `AbortController` and one deadline for the complete HTTP operation: request headers plus response body. A caller-provided `AbortSignal` remains connected until `response.text()` completes. Non-success HTTP statuses are rejected before XML parsing. This prevents an incomplete/stalled RSS body from leaving refresh indefinitely pending after the response headers have arrived.

## Verification

Run:

```bash
npm run test:startup-recovery
npm run test:feed-request
npm run verify:all
npm run typecheck
npm run check:live-feed
```

The startup and feed-request tests run with the repository's source test harness. `npm run typecheck` requires a completed `npm ci`; `npm run check:live-feed` requires access to the public Google Drive RSS endpoint. Neither a passing source suite nor static Swift parsing substitutes for Android/iOS compilation or device QA.
