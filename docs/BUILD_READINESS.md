# Native build readiness

This project uses Expo SDK 58 with React Native 0.88 and local Expo modules. It must be built as a development or production app; Expo Go cannot load the local audio-effects, local-library, Android DownloadManager or iOS background URLSession modules. SDK 58 requires Node.js 22.13 or newer. `expo-modules-core` is declared directly because the app’s local Expo module JavaScript entry points import its runtime APIs; its version follows the SDK 58 bundled module map. Run `npm run check:build-environment` before installing or building to validate the SDK-native package baseline and machine-specific prerequisites. See `docs/SDK58_DEPENDENCY_BASELINE.md` for the native dependency decisions.

## Reproducible dependency setup

The source archive intentionally does not contain `node_modules`. It also currently has no npm lockfile. This checkpoint does not contain a lockfile because the npm registry could not be reached while preparing it. Do not generate a placeholder lockfile. Use the manually triggered `Bootstrap npm lockfile` GitHub Actions workflow to generate and download a real npm lockfile, or on a networked development machine run:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
node scripts/check-lockfile.mjs
npm ci --no-audit --no-fund
```

Review and commit `package-lock.json`. The CI installer now requires the committed lockfile and fails rather than silently resolving a different dependency tree. Do not claim a reproducible release build until the lockfile is committed and a clean `npm ci` succeeds.

The `npm run typecheck` script uses the project-local TypeScript compiler only. It checks that Expo, React, React Native, `@types/react`, TypeScript and Expo’s base tsconfig are present before invoking `tsc`; without them it exits with a focused prerequisite message instead of running a globally installed compiler against an incomplete configuration.

After installing dependencies:

```bash
npm run check:build-environment
npm run verify:all
npm run typecheck
npx expo install --fix
npx expo-doctor
```

Review any package changes from `expo install --fix`, rerun all checks, and preserve the exact resulting lockfile.

## Preflight diagnostics

`npm run check:build-environment` validates the evaluated Expo app configuration, app identifiers, local Expo module manifests, SDK 58 native dependency declarations, Node version, the complete typecheck prerequisite set, lockfile presence, Android SDK Platform 37 / Build Tools / JDK, and iOS Xcode 26.4+ / CocoaPods. It reports missing machine prerequisites without treating them as source defects. Add `-- --strict` to return a non-zero exit code when a native platform cannot be built on the current machine.

## Android development build

Use Linux, macOS or Windows with Android Studio and an installed Android SDK. Ensure `ANDROID_HOME` or `ANDROID_SDK_ROOT` points to that SDK, with Android SDK Platform 37 (`platforms/android-37/android.jar`), at least one Build Tools directory, and JDK 17 or newer.

```bash
npx expo prebuild --platform android
npm run android
```

The generated `android/` directory is intentionally ignored by Git and is not part of this source archive. Re-run prebuild after changing app config or native module config. Validate the app on a physical Android device, especially background audio, system DownloadManager completion/reboot recovery, skip-silence, volume boost and quiet refresh notifications.

## iOS development build

An iOS native build requires macOS, Xcode 26.4 or newer and CocoaPods:

```bash
npx expo prebuild --platform ios
npm run ios
```

The generated `ios/` directory is intentionally ignored by Git and is not part of this source archive. Test BGTaskScheduler refresh behavior, audio interruptions, background playback and URLSession background downloads on a physical device; simulator behavior is not a substitute for OS background execution. Validate background-session relaunch and completion callbacks after normal system termination. Do not expect background URLSession transfers to survive a user force-quit from the app switcher; iOS cancels those transfers.

## Current checkpoint verification boundary

For this checkpoint, `npm run verify:all` passes all source-level tests, TypeScript/TSX transpilation checks and localization checks. `app.config.js` loads in Node and retains the original `shademtula.app` Android/iOS identifiers.

Native compilation and full TypeScript semantic checking could not be performed in the build environment used to create this archive: the npm registry was unavailable (`EAI_AGAIN`), so dependencies could not be installed. The typecheck runner now exits early with the exact missing prerequisite packages instead of emitting misleading global-compiler errors; no Android SDK/Gradle toolchain was present; and Xcode/CocoaPods are unavailable on the Linux host. The earlier explicit `types: ["react", "react-native"]` restriction was removed from `tsconfig.json`: React Native ships its own declarations, and TypeScript `types` is intended for global `@types` packages. The local modules’ runtime dependency `expo-modules-core` is explicitly declared at the SDK 58 bundled version so their direct imports do not depend on npm hoisting transitive dependencies. The project has not been device-verified. These are outstanding validation tasks, not successful build claims.

## Automated CI and native compilation

The repository now includes `.github/workflows/validate.yml` for push/PR source validation and `.github/workflows/native-build.yml` for unsigned Android debug APK and iOS Simulator compilation. The native workflow runs on pushes to `main` and can be manually dispatched for Android, iOS or both. It builds generated native projects on GitHub-hosted Android and Xcode 27 runners, so local toolchain absence does not block CI compilation. See `docs/CI.md` for workflow behavior and artifact details.

The native builds are unsigned compile checks only. They do not replace device QA, App Store / Play signing or background lifecycle validation on hardware. The CI installer requires a committed `package-lock.json` and validates that its root declaration matches `package.json` before `npm ci`. While it is absent, validation and native builds stop with an actionable message. The manual `Bootstrap npm lockfile` workflow generates a real lockfile on a networked runner and uploads it for review; it does not write to the repository.

## iOS privacy manifest

The Expo app config declares `CA92.1` for app-owned UserDefaults access and `C617.1` for file-size metadata read from the app container. `npm run check:build-environment` validates these entries. See `docs/IOS_PRIVACY.md` for the API call sites and reason-code scope, and `docs/BACKGROUND_DOWNLOADS.md` for background URLSession behavior and device validation. The required archive-level privacy review remains outstanding. This source check does not establish App Store compliance by itself.

## Runtime startup and feed recovery

The library provider now treats failures in required startup storage/database work as a recoverable application state: it ends the splash/loading state, displays a localized storage error screen, and offers a retry action. A failed database initialization does not mount the audio player over a broken data layer. The startup effect is isolated from preference callback identity changes so loading persisted settings does not unnecessarily restart initialization.

The featured feed request deadline now covers the complete RSS body read, not only response headers. Caller cancellation remains connected until the body has been consumed. Unit tests cover successful reads, HTTP errors, cancellation during body reads, and body-read timeouts. See `docs/RUNTIME_RELIABILITY.md` for the failure handling details.

## SDK 58 foreground notification behavior

SDK 58 presents foreground notifications by default unless `setNotificationHandler` returns a presentation policy. `index.ts` imports `configureNotificationPresentation` before loading the background refresh task. Quran refresh status notifications remain visible in the notification list without a foreground banner, sound or badge. Other notification kinds retain normal banner/list presentation. See `scripts/test-notification-presentation.mjs`.

## Native dependency alignment

The project now pins the SDK 58-compatible slider, safe-area, screens and WebView versions used by the app. The unused `react-native-gesture-handler` dependency and imports were removed because the draggable player sheet uses the built-in `PanResponder`, and the current React Navigation setup relies on Screens and Safe Area rather than Gesture Handler. `npm run check:sdk58-native-dependencies` validates this baseline. See `docs/SDK58_DEPENDENCY_BASELINE.md`.
