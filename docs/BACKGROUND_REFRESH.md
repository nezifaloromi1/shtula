# Background Quran feed refresh

The background feed updater restores the original Flutter settings (`backgroundUpdate`, `backgroundUpdateMobileData`, `updateNotification`) for the one configured Google Drive Quran RSS feed. It does not subscribe to remote podcast directories or download audio automatically.

## Runtime design

- `src/features/quran/services/backgroundQuranRefresh.ts` defines the task at module scope. `index.ts` imports it before registering the React Native root component so the task exists when the OS starts a background JS runtime.
- `expo-background-task` schedules deferrable work through Android WorkManager and iOS BGTaskScheduler. `expo-task-manager` owns the task registration, `expo-network` provides connection type/reachability and `expo-notifications` sends local update notices.
- The task reads the current settings and refresh timestamp from SQLite, requests the configured HTTPS RSS feed, then upserts only the feed's featured Quran items. It records discovered IDs in `newFeaturedTrackIds` before completing the feed update, allowing the foreground provider to restore NEW markers when the app becomes active again.
- Mobile data is opt-in. The background policy allows Wi-Fi by default, permits cellular only when the user explicitly enables it, and fails closed for disconnected, unknown, VPN, Ethernet and other network types because the underlying metered connection cannot be established safely from the Expo network state alone.
- When update notifications are enabled, both foreground/manual and OS-scheduled refreshes post a quiet, temporary “Library Update” status notification before fetching the feed and dismiss it when the refresh finishes or fails. A persisted notification identifier allows a later task run to clean up a stale status notification after a process interruption. This matches the original Flutter behavior; it is not a notification that claims new lessons were found. Notifications are local-only; remote push notifications and APNs credentials are not configured. On SDK 58, `configureNotificationPresentation` is imported from `index.ts` before the task module: the refresh-status notification is kept in the tray without a foreground banner, sound or badge, while unrelated notification types retain normal foreground presentation.
- If the update interval is set to Never, the background task is unregistered. The 10-minute foreground refresh interval uses the scheduler's 15-minute minimum when running in the background.

## Scheduling and platform limits

The OS controls when background work actually runs. `minimumInterval` is a lower bound, not an exact schedule. Android WorkManager has a 15-minute minimum and may defer execution to satisfy battery/network constraints. iOS BGTaskScheduler chooses its own launch time using device conditions and usage patterns; short intervals can be delayed substantially. The task also requires a suitable network and battery state. A background task is not guaranteed to run on a wall-clock deadline.

On iOS, Expo's config plugin adds the required `processing` background mode and permitted task identifier during `npx expo prebuild`. The iOS background-task API is unavailable on the simulator and must be tested on a physical device. TaskManager does not support Android background execution in Expo Go; use a development or production build. The app already requires a native build for its local audio/download modules.

If the user force-stops/kills the app, OS background work stops until the app is started again. Android vendor battery-management behavior also differs. No network retry loop runs continuously in JavaScript; a failed task returns a failure result so the scheduler can retry according to its policy.

## Notifications and privacy

The app requests alert permission only when the user enables update notifications. Android creates the notification channel before requesting permission. The temporary notification contains only the library-update status and local navigation metadata; it does not expose lesson titles or feed contents. The app does not request push tokens, register with a push provider, or send device identifiers to a notification service.

## Verification

Run:

```bash
npm run test:background-refresh-policy
npm run test:legacy-background-preferences
npm run verify:localization
```

These tests cover network gating, refresh interval policy, SQLite-facing dependency calls, initial-feed behavior, new-ID persistence, optional notification errors, module-scope task registration and Flutter preference migration. They are source/policy tests and do not prove OS scheduling. Use Expo's `BackgroundTask.triggerTaskWorkerForTestingAsync()` in a development build for controlled testing, then verify real background scheduling, permission behavior, process-kill and reboot behavior on physical Android and iOS devices.
