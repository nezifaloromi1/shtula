# Legacy Flutter data migration

The Flutter release stores library and playback records in Sembast (`anytime.db`, schema version 3), while preferences are stored in platform SharedPreferences/UserDefaults. The React Native app uses SQLite (`sheademtula.db`) and a private `quran_library` directory.

## 1. Downloaded audio files

On first start, the local native module makes a non-destructive copy of supported audio files from the prior app's `AnyTime` directory. Android scans the internal app-specific `AnyTime` folder and app-specific Podcasts directories on available external storage volumes. iOS scans the app's Documents/AnyTime folder. Copied files are stored under `quran_library`; original files are not deleted.

When the exported Sembast episodes are later imported, the importer matches their old filenames to the copied files and attaches a matching file to the corresponding featured Quran audio item, rather than showing a duplicate generic local-library entry.

This automatic scan depends on an in-place update with the same application identifier and signing identity, and on the platform retaining the old app sandbox. Files saved to arbitrary removable storage locations may not be accessible to the app.

## 2. Export the old Sembast database

The source archive does not contain an installed user's private `anytime.db`. Use the small read-only exporter in `tools/legacy-exporter` with a copy of that database:

```bash
cd tools/legacy-exporter
dart pub get
dart run bin/export_legacy_database.dart /path/to/anytime.db /path/to/sheademtula-legacy-export.json
```

The exporter opens the database using Sembast's read-only mode and writes the four original stores (`podcast`, `episode`, `queue`, `transcript`) to a versioned JSON file. It does not modify or compact the source database. The exporter is deliberately separate from the React Native runtime; Dart is needed only to create the compatible JSON export.

For an iOS installation, obtain the app container through the normal Apple development/device-container workflow and locate `Documents/anytime.db`. For Android, the database is in the app's private application document storage; access depends on build debuggability and device/backup policy. Do not assume `adb run-as` can read a production-signed non-debuggable installation.

## 3. Import the JSON backup

In Sheademtula, open **Settings → Data → Import previous Flutter backup** and select `sheademtula-legacy-export.json`.

The importer:

- validates the export format and version before writing;
- uses one SQLite exclusive transaction;
- restores episodes whose parent GUID is the built-in Sheikh Aadam Tuulaa collection;
- retains already-downloaded audio from other former feeds as local files, but does not recreate those remote subscriptions;
- restores playback duration and position in milliseconds, played state, item metadata, chapter markers and cached transcript cues;
- restores queue order after filtering missing or unrelated remote entries;
- stores an import fingerprint so importing the exact same export twice does not duplicate data;
- never deletes the original Flutter database or audio files.

The old `podcast` Sembast store is included in the export for auditing, but unrelated podcast subscriptions are intentionally not recreated. The removed iTunes/PodcastIndex discovery, arbitrary RSS subscriptions and OPML import/export are not revived.

## 4. Preferences

The native module reads the original platform preferences on first launch. It applies the active theme, playback speed and continuous-play setting, and stores the full set of recognized scalar Flutter preference values in SQLite under `legacyFlutterPreferences` for preservation. Search-provider preferences are retained only as migration data; iTunes/PodcastIndex functionality remains removed.

Android reads the `FlutterSharedPreferences` store and `flutter.`-prefixed keys. iOS checks `UserDefaults` for both prefixed and unprefixed keys. The read operation does not clear the old preferences.

## 5. Quran feed

The original Sheikh Aadam Tuulaa Google Drive-hosted RSS feed remains the only online Quran audio catalog. Its original feed URL and artwork URL are centralized in `src/features/quran/config/feed.json`. Remote feed refreshes preserve playback position, played status and local download links.

The other former podcast/RSS search and subscription features are intentionally absent. If Google Drive is unreachable, the app keeps previously cached feed items and local files. A new installation without cached data needs the configured feed to be reachable to obtain remote items.
