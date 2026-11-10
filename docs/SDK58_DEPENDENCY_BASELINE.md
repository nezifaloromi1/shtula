# Expo SDK 58 dependency baseline

This app targets Expo SDK 58, React Native 0.88.1 and React 19.3.0. SDK 58's published compatibility table specifies Node 22.13.x or newer, Android compile SDK 37 / target SDK 36, iOS 16.4+, and Xcode 26.4+. Check the official [SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) before changing this baseline.

## Native UI dependencies

The SDK 58 bundled native-module map and versioned package pages list these direct versions for native UI packages used by this project:

| Package | Project version | Use |
|---|---:|---|
| `@react-native-community/slider` | `5.2.1` | Playback seek and playback-speed controls |
| `react-native-safe-area-context` | `~5.11.1` | Screen safe areas and sheet insets |
| `react-native-screens` | `~4.30.1` | React Navigation native stack |
| `react-native-webview` | `14.0.1` | Original Seenaa / biography content |

The app does not use Gesture Handler APIs. The draggable player sheet uses React Native's built-in `PanResponder`; React Navigation's current installation guide requires `react-native-screens` and `react-native-safe-area-context` for the navigators used here. The redundant `react-native-gesture-handler` dependency and duplicate startup imports were removed rather than adding an unused native library. If a future screen adopts Gesture Handler, re-add a version compatible with React Native 0.88 and place its import at the application entry point.

`expo-modules-core` is an explicit direct runtime dependency (`~58.0.26`) because each local Expo module's JavaScript entry point imports its APIs. SDK-managed Expo packages keep their same-major/minor tilde ranges so patch updates remain possible without drifting to a different SDK line. Run `npx expo install --check` after installing dependencies to confirm the installed package graph against the exact installed Expo SDK.

The project runs `npm run check:sdk58-native-dependencies` as part of `verify:all`; this catches the native UI version baseline and accidental reintroduction of the unused Gesture Handler package/import. `npm run check:build-environment` also runs this validation.

## Native host requirements

The preflight checks the SDK-specific toolchain, not merely the presence of a command:

- Android: `ANDROID_HOME` or `ANDROID_SDK_ROOT`, `platforms/android-37/android.jar`, at least one Android Build Tools directory, and JDK 17 or newer.
- iOS: macOS, Xcode 26.4 or newer, and CocoaPods.
- Both platforms: Node 22.13 or newer and an installed dependency tree.

After installing dependencies, generate and compile native projects with `npx expo run:android` or `npx expo run:ios`. These commands require the relevant native toolchain and perform native compilation; source-level tests and preflight checks do not substitute for that compilation. See [Expo local development builds](https://docs.expo.dev/guides/local-app-development/).

## Reproducibility boundary

No `package-lock.json` is included in this checkpoint because the npm registry was unreachable when dependencies were last attempted (`EAI_AGAIN`). Do not create a placeholder lockfile. On a networked machine, run `npm install`, inspect and commit the generated lockfile, then use `npm ci` for subsequent clean installs. Run `npx expo install --check`, `npx expo-doctor`, `npm run typecheck`, and the full native build after installation.
