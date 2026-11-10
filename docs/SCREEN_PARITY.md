# Flutter-to-React Native screen parity audit

This document records the screen contracts checked in the React Native migration. The source reference is the uploaded Flutter project under `lib/ui/`.

## Main tabs

The app keeps the original four persistent tabs in this order: Home, Tafsiira, Seenaa and Downloads. The mini-player remains above the tab bar. The tab shell, shared screen container, shared text and top app bar all receive the active reading direction; Arabic uses RTL and the other supported locales use LTR.

## Home

Reference: `lib/ui/home/home.dart`.

- Featured hero uses the built-in Sheikh Aadam Tuulaa artwork, title, localized `Tafsiira Afaan Oromoo` subtitle, episode-count/category chips and Play action.
- Play starts the first item from an A–Z copy of the featured feed list.
- Continue Listening appears only while there is a current track.
- Recommended for you uses the complete featured-feed episode list, sorted A–Z, with artwork, play overlay and title. Local file imports are not mixed into this section.

## Tafsiira

Reference: `lib/ui/tafsiira/tafsiira.dart`.

- The collection header uses 148 px square artwork, the `Tafsiira` label, `Sheikh Aadam Tuulaa` collection title and item count.
- Play All starts the first alphabetically sorted item; Shuffle starts one random item.
- All Episodes displays the complete featured-feed list in A–Z order, with play, more-actions and download behavior.
- Loading, retryable error and empty states are represented.
- Collection options restore Flutter’s bulk mark-all-played and mark-all-unplayed actions, an explicit forced feed refresh and collection sharing. Bulk changes are scoped to the featured Google Drive rows; imported local audio is unaffected.
- Collection sharing uses the original unpadded UTF-8 base64url `pod.link` route built from the configured feed URL.
- The episode overflow action opens a scrollable Quran-focused detail sheet with artwork, title, author, publication date, duration, sanitized plain-text show notes, playback, queue add/remove, played/unplayed, download/cancel/delete and share actions. The sheet is also available from Downloads and Search.
- Episode sharing uses the same unpadded UTF-8 base64url `pod.link` episode route as the original Flutter implementation, with the built-in Sheikh Aadam Tuulaa show identifier.

## Seenaa

Reference: `lib/ui/seenaa/`.

- The profile header uses the featured collection artwork, Sheikh Aadam Tuulaa title, biography subtitle and author attribution.
- Both original embedded video identifiers are retained.
- Biography content is rendered from the local structured biography file.

## Player

Reference: `lib/ui/podcast/now_playing.dart` and `lib/ui/podcast/now_playing_options.dart`.

- Top detail tabs are Chapters (only when chapter data exists), Episode and Notes.
- Chapter metadata can be loaded from the feed's chapter URL, cached locally, and tapped to seek.
- Episode artwork follows the active chapter artwork when supplied, falling back to the feed artwork.
- Notes display the feed-provided description.
- Transport includes position seeking, previous/next, 10-second rewind, 30-second forward, playback speed and the original sleep-timer choices.
- Portrait uses a 68 px collapsed Up Next / Transcript tray that expands by drag or tap to a full-height player options sheet. The sheet includes the floating current-player strip, active tabs, queue reordering/removal/clear actions and the transcript view.
- The transcript view loads cached or remote cues, supports search, follows the current playback cue when enabled, and seeks when a cue is tapped.
- Landscape uses a side-by-side player and options pane, matching Flutter’s `NowPlayingOptionsSelectorWide` instead of hiding queue/transcript access.


## Settings

Reference: `lib/ui/settings/settings.dart`, `lib/ui/widgets/layout_selector.dart` and `lib/entities/app_settings.dart`.

- Settings includes the original auto-open full-screen player preference (`autoopennowplaying`). Content playback controls call one shared hook that opens the Player route only when this preference is enabled.
- Layout selection includes list, compact grid and grid modes; sort options are Alphabetical, Date followed, Unplayed episodes and Latest episodes.
- Highlight new episodes and Show unplayed count preferences are saved in SQLite and applied to the built-in Quran feed.
- The native Android and iOS modules read the original `FlutterSharedPreferences`/`UserDefaults` scalar values and store them in the migration preferences map. Schema migration version 3 applies these layout/player preferences to existing installations.
- Since the React Native app intentionally retains only one built-in Quran collection, sort choices are applied to its episode list. `Date followed` uses the persisted first-added timestamp; this is the closest available mapping without restoring the removed multi-feed subscription library.
- New-feed markers are created only when a refresh discovers items beyond an existing cached feed, avoiding incorrectly marking the entire feed as new on first installation. Foreground and OS-scheduled background refresh both persist newly discovered IDs; the provider reloads those markers when the app returns to active. A marker clears when its episode is started.
- The refresh selector includes the original Never, Always, 10-minute, 30-minute, 1-hour, 3-hour, 6-hour, 12-hour, 24-hour and 48-hour choices.
- Background refresh, cellular-data opt-in and temporary refresh-status notifications are persisted and migrated from the exact Flutter preference keys. Android uses WorkManager and iOS uses BGTaskScheduler through Expo BackgroundTask; actual launch times remain OS-controlled. See `docs/BACKGROUND_REFRESH.md` for constraints and physical-device verification requirements.

## Downloads, Search and secondary routes

- Downloads lists downloaded and imported local audio, shows active transfer progress, and supports cancellation/removal.
- Search intentionally searches only the built-in Quran feed cache and locally imported/downloaded audio. External directory search and arbitrary feed discovery were removed by product requirement.
- Queue, Chapters, Transcript and Show Notes remain separate accessible routes in addition to the Player screen's collapsed selectors.
- Settings retains theme, language, foreground/background refresh, episode deletion, layout selection, auto-open player and data import controls.

## Verification scope

`npm run test:screen-parity` and the layout/legacy-preference tests are static/pure-policy contract tests. It checks the key structure, ordering/data filters, screen controls, original media identifiers and RTL direction wiring. It does not render the app or compare actual pixels. Screenshot comparison and Android/iOS device checks remain necessary after dependencies are installed and native builds are available.
