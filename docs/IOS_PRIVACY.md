# iOS privacy manifest

The app declares required-reason API use in `ios.privacyManifests` in the root `app.config.js`. Expo Prebuild uses this field to generate the app target's `PrivacyInfo.xcprivacy` file.

## App-owned API use

| Required-reason API category | Reason | App code path | Scope |
|---|---|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | `modules/sheademtula-local-library/ios/LocalLibraryModule.swift` reads the previous Flutter app's own preference keys; `modules/sheademtula-ios-downloads/ios/IOSDownloadsModule.swift` stores native download-task recovery metadata in `UserDefaults.standard` | Preferences and task metadata accessible only to this app |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1` | `modules/sheademtula-local-library/ios/LocalLibraryModule.swift` and `modules/sheademtula-ios-downloads/ios/IOSDownloadsModule.swift` read file-size metadata through `URL.resourceValues(forKeys: [.fileSizeKey])` | Files in the app's own container |

`CA92.1` is appropriate for app-only defaults. It does not authorize access to defaults written by other apps or the system. `C617.1` covers file timestamps, size and other metadata for files inside the app container, app group container or CloudKit container. The native module reads sizes for its own managed audio files; it does not use this declaration to access other apps' containers.

The original Flutter app already declared `CA92.1` for UserDefaults access. The migrated local-library and iOS download modules use the same app-owned defaults domain for preference migration and task recovery. Both modules read `.fileSizeKey` only for files in the app container, so the app config declares `C617.1` for that additional access.

## Third-party SDK manifests

Expo and other native dependencies may ship their own `PrivacyInfo.xcprivacy` files. After installing dependencies, inspect the manifests in the installed iOS package directories and review the final app archive's privacy report. Expo documents that App Store aggregation may not include every required reason from static CocoaPods dependencies; where Apple's current guidance requires it, add the relevant reasons to the app manifest. Do not copy every reason from a dependency indiscriminately: verify that the reason applies to the exact API behavior and scope of this app.

## Validation

The source preflight validates the two app-owned API declarations and rejects missing reason codes or duplicate categories:

```bash
npm run test:build-environment
npm run check:build-environment
npx expo prebuild --platform ios
```

Source validation is not a substitute for checking the generated `ios/<app>/PrivacyInfo.xcprivacy` file or the privacy report for an archived app. Perform that review on macOS after installing dependencies and building with the pinned SDK, then submit to TestFlight/App Store Connect to receive Apple's current missing-reason feedback. This project has not yet had archive-level privacy validation.
