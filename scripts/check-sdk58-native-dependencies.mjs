import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');

// Versions taken from the Expo SDK 58 bundled native-module map and SDK 58
// package reference. Keep this list limited to native dependencies used by
// this app; run `npx expo install --check` after installing dependencies too.
export const SDK58_NATIVE_DEPENDENCIES = Object.freeze({
  '@react-native-community/slider': '5.2.1',
  'react-native-safe-area-context': '~5.11.1',
  'react-native-screens': '~4.30.1',
  'react-native-webview': '14.0.1',
});

function collectSourceFiles(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(entryPath, output);
    else if (/\.(?:[cm]?js|tsx?)$/.test(entry.name)) output.push(entryPath);
  }
  return output;
}

export function inspectSDK58NativeDependencies({ rootDir = rootDirectory } = {}) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const problems = [];

  if (dependencies.expo !== '~58.0.0') problems.push(`expo must remain ~58.0.0; found ${dependencies.expo ?? 'missing'}`);
  if (dependencies.react !== '19.3.0') problems.push(`react must remain 19.3.0; found ${dependencies.react ?? 'missing'}`);
  if (dependencies['react-native'] !== '0.88.1') problems.push(`react-native must remain 0.88.1; found ${dependencies['react-native'] ?? 'missing'}`);

  for (const [name, expected] of Object.entries(SDK58_NATIVE_DEPENDENCIES)) {
    if (dependencies[name] !== expected) {
      problems.push(`${name} must use the SDK 58 compatible declaration ${expected}; found ${dependencies[name] ?? 'missing'}`);
    }
  }

  // This project uses React Native's built-in PanResponder for its only
  // draggable sheet. Gesture Handler is not used by app code or navigators,
  // so carrying an additional native dependency would add build surface only.
  const gestureHandlerOccurrences = [];
  if (dependencies['react-native-gesture-handler']) {
    gestureHandlerOccurrences.push(`package.json declares ${dependencies['react-native-gesture-handler']}`);
  }
  for (const sourcePath of [path.join(rootDir, 'index.ts'), ...collectSourceFiles(path.join(rootDir, 'src')), ...collectSourceFiles(path.join(rootDir, 'modules'))]) {
    if (!fs.existsSync(sourcePath)) continue;
    const source = fs.readFileSync(sourcePath, 'utf8');
    if (source.includes('react-native-gesture-handler')) gestureHandlerOccurrences.push(path.relative(rootDir, sourcePath));
  }
  if (gestureHandlerOccurrences.length > 0) {
    problems.push(`unused react-native-gesture-handler dependency/import remains: ${gestureHandlerOccurrences.join(', ')}`);
  }

  return { valid: problems.length === 0, problems };
}

function run() {
  const report = inspectSDK58NativeDependencies();
  console.log('Expo SDK 58 native dependency check');
  if (report.valid) {
    console.log('READY   Native UI packages match the SDK 58 compatibility baseline.');
    console.log('READY   Unused Gesture Handler dependency and imports are absent.');
    return;
  }
  for (const problem of report.problems) console.error(`ERROR   ${problem}`);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
