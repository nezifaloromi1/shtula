# Flutter Settings parity

Reference implementation: `lib/ui/settings/settings.dart`, `lib/ui/widgets/layout_selector.dart`, `lib/entities/app_settings.dart`, `lib/services/settings/mobile_settings_service.dart` and `lib/ui/widgets/episode_tile.dart`.

## Restored preferences

| Flutter preference | React Native behavior | Migration key |
|---|---|---|
| `autoOpenNowPlaying` | Open the full-screen Player after a content-screen play action | `autoopennowplaying` |
| `layoutMode` | List, compact grid or grid in Tafsiira | `layout` |
| `layoutOrder` | Alphabetical, Date followed, Unplayed or Latest episodes | `layoutOrder` |
| `layoutHighlight` | Display a badge on newly discovered feed items | `layoutHighlight` |
| `layoutCount` | Display the count of unplayed Quran lessons | `layoutCount` |
| `backgroundUpdate` | Enable OS-scheduled background feed refresh | `backgroundUpdate` |
| `backgroundUpdateMobileData` | Allow scheduled refresh on cellular data | `backgroundUpdateMobileData` |
| `updateNotification` | Show a quiet local status notification while a feed refresh is running | `updateNotification` |

The selected values are persisted in the SQLite `preferences` setting. The native Kotlin and Swift modules also capture the original scalar preference values from Flutter's platform preference storage without clearing it. Preference migration version 3 maps layout/player settings, version 4 maps audio effects, and version 5 maps background refresh; invalid values are normalized to safe defaults/current values.

## Runtime behavior

- The layout dialog changes list/grid mode immediately. The three modes use a single-column list, a compact three-column grid, or a two-column grid.
- The sort choice is applied to the Quran feed item list as soon as it changes.
- Because this product intentionally retains one built-in Quran collection rather than the original multi-subscription directory, `Date followed` uses the local catalogue's first-added timestamp. The other options sort feed episodes by title, unplayed status, or publication date.
- New-item highlighting is only enabled when selected. A fresh install does not mark every item new; a later feed refresh compares against cached IDs. A marker is removed when that lesson is started.
- `Open the full-screen player when playback starts` is respected by the shared content-screen playback hook. Playback initiated within the full-screen Player does not navigate to a duplicate Player route.
- Background refresh runs through Expo BackgroundTask and only refreshes the configured Google Drive Quran feed. Wi-Fi is allowed by default; cellular requires opt-in. The system controls the actual execution time and can defer or skip work.
- When enabled, a quiet local “Library Update” status notification appears during foreground/manual and OS-scheduled background feed refreshes and is dismissed afterward. A stale notification is cleaned up on the next scheduled run if the process is interrupted. Newly discovered IDs are separately persisted so NEW markers survive the background-to-foreground transition.
- The refresh selector includes the original Never, Always, 10-minute, 30-minute, 1-hour, 3-hour, 6-hour, 12-hour, 24-hour and 48-hour choices. Background scheduling clamps the 10-minute preference to the platform's 15-minute minimum.

## Verification

- `npm run test:layout-policy` verifies sort order, normalisation and new-item detection.
- `npm run test:legacy-display-preferences` verifies exact preference key/value mapping, boolean representations and invalid-value handling.
- `npm run test:screen-parity` verifies the Settings controls, legacy mapping and playback navigation hook are present.
- `npm run test:background-refresh-policy` and `npm run test:legacy-background-preferences` verify network gating, scheduler interval policy, new-item marker persistence and exact Flutter preference keys.

These tests exercise source/pure-policy behavior. They do not replace testing preference migration in a real upgraded Android/iOS app installation.
