import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inspectSDK58NativeDependencies } from './check-sdk58-native-dependencies.mjs';
import { validateLockfile } from './check-lockfile.mjs';

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, '..');

function versionTuple(value) {
  const match = String(value ?? '').match(/(?:^|[^\d])(\d+)\.(\d+)(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}

function isAtLeastVersion(actual, minimum) {
  const a = versionTuple(actual);
  const b = versionTuple(minimum);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}

function commandVersion(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 4000 });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
}

function hasCommand(command, args) {
  return commandVersion(command, args) !== null;
}

function validateLocalModules(rootDir, configuredDirectory) {
  const modulesDirectory = path.resolve(rootDir, configuredDirectory || './modules');
  if (!fs.existsSync(modulesDirectory) || !fs.statSync(modulesDirectory).isDirectory()) {
    return { valid: false, count: 0, reason: `Native modules directory not found: ${modulesDirectory}` };
  }

  const moduleDirectories = fs.readdirSync(modulesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(modulesDirectory, entry.name));
  const moduleNames = [];

  for (const moduleDirectory of moduleDirectories) {
    const packagePath = path.join(moduleDirectory, 'package.json');
    const configPath = path.join(moduleDirectory, 'expo-module.config.json');
    if (!fs.existsSync(packagePath) || !fs.existsSync(configPath)) continue;

    try {
      const modulePackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const moduleConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!modulePackage.name || !Array.isArray(moduleConfig.platforms) || moduleConfig.platforms.length === 0) {
        return { valid: false, count: moduleNames.length, reason: `Invalid local Expo module metadata: ${moduleDirectory}` };
      }
      const supportedPlatforms = new Set(['android', 'apple', 'ios', 'web']);
      if (moduleConfig.platforms.some((platform) => !supportedPlatforms.has(platform))) {
        return { valid: false, count: moduleNames.length, reason: `Unsupported platform in ${configPath}` };
      }
      moduleNames.push(modulePackage.name);
    } catch (error) {
      return { valid: false, count: moduleNames.length, reason: `Cannot parse ${moduleDirectory}: ${error.message}` };
    }
  }

  if (moduleNames.length === 0) {
    return { valid: false, count: 0, reason: 'No local Expo modules with package.json and expo-module.config.json were found.' };
  }
  return { valid: true, count: moduleNames.length, names: moduleNames };
}

export function validateIOSPrivacyManifest(config) {
  const entries = config?.ios?.privacyManifests?.NSPrivacyAccessedAPITypes;
  if (!Array.isArray(entries)) {
    return { valid: false, reason: 'ios.privacyManifests.NSPrivacyAccessedAPITypes must be an array.' };
  }

  const byType = new Map();
  for (const entry of entries) {
    const type = entry?.NSPrivacyAccessedAPIType;
    const reasons = entry?.NSPrivacyAccessedAPITypeReasons;
    if (typeof type !== 'string' || !Array.isArray(reasons) || reasons.some((reason) => typeof reason !== 'string')) {
      return { valid: false, reason: 'Every accessed API entry must include a category and a string array of reason codes.' };
    }
    if (byType.has(type)) {
      return { valid: false, reason: `Privacy manifest contains duplicate entries for ${type}.` };
    }
    byType.set(type, new Set(reasons));
  }

  const required = [
    ['NSPrivacyAccessedAPICategoryUserDefaults', 'CA92.1'],
    ['NSPrivacyAccessedAPICategoryFileTimestamp', 'C617.1'],
  ];
  const missing = required.filter(([type, reason]) => !byType.get(type)?.has(reason));
  if (missing.length > 0) {
    return {
      valid: false,
      reason: `Privacy manifest is missing required declarations: ${missing.map(([type, reason]) => `${type} (${reason})`).join(', ')}.`,
    };
  }
  return { valid: true, reason: 'UserDefaults and app-container file metadata access have declared Apple required reasons.' };
}

function validateExpoConfig(rootDir, packageJson) {
  try {
    const configPath = path.join(rootDir, 'app.config.js');
    const config = require(configPath);
    const expectedId = 'shademtula.app';
    const pluginNames = (config.plugins ?? []).map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin);
    const requiredPlugins = ['expo-audio', 'expo-background-task', 'expo-notifications'];
    const missingPlugins = requiredPlugins.filter((plugin) => !pluginNames.includes(plugin));
    const customPlugin = path.join(rootDir, 'plugins/withExpoAudioPlayerEffects.js');
    const nativeModulesDir = packageJson.expo?.autolinking?.nativeModulesDir ?? './modules';
    const privacyManifest = validateIOSPrivacyManifest(config);
    const checks = {
      androidId: config.android?.package === expectedId,
      iosId: config.ios?.bundleIdentifier === expectedId,
      customPlugin: fs.existsSync(customPlugin) && pluginNames.includes('./plugins/withExpoAudioPlayerEffects'),
      requiredPlugins: missingPlugins.length === 0,
      iosPrivacyManifest: privacyManifest.valid,
      iosPrivacyManifestDetail: privacyManifest.reason,
      nativeModulesDir,
    };
    const invalid = Object.entries(checks)
      .filter(([key, value]) => !['nativeModulesDir', 'iosPrivacyManifestDetail'].includes(key) && value !== true)
      .map(([key]) => key);
    return invalid.length === 0
      ? { valid: true, config, checks }
      : { valid: false, reason: `Expo config checks failed: ${invalid.join(', ')}`, checks };
  } catch (error) {
    return { valid: false, reason: `app.config.js could not be loaded: ${error.message}` };
  }
}

export function collectBuildReadiness({
  rootDir = defaultRoot,
  nodeVersion = process.version,
  platform = process.platform,
  env = process.env,
  commandCheck = hasCommand,
  commandOutput = commandVersion,
} = {}) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const expoConfig = validateExpoConfig(rootDir, packageJson);
  const modules = validateLocalModules(rootDir, expoConfig.checks?.nativeModulesDir ?? './modules');
  const sdkDependencies = inspectSDK58NativeDependencies({ rootDir });
  const nodeMinimum = packageJson.engines?.node?.replace(/^>=\s*/, '') ?? '22.13.0';
  const nodeSupported = isAtLeastVersion(nodeVersion, nodeMinimum);

  const requiredRuntimePackages = [
    'expo/package.json',
    'react/package.json',
    'react-native/package.json',
    '@types/react/package.json',
    'typescript/bin/tsc',
    'expo/tsconfig.base.json',
  ];
  const missingRuntimePackages = requiredRuntimePackages.filter((relativePath) => !fs.existsSync(path.join(rootDir, 'node_modules', relativePath)));
  const dependenciesInstalled = missingRuntimePackages.length === 0;
  const lockfilePath = path.join(rootDir, 'package-lock.json');
  const lockfilePresent = fs.existsSync(lockfilePath);
  let lockfileValidation = null;
  if (lockfilePresent) {
    try {
      const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
      lockfileValidation = validateLockfile(packageJson, lockfile);
    } catch (error) {
      lockfileValidation = { valid: false, reason: `Cannot read package-lock.json: ${error.message}` };
    }
  }
  const sdkRoot = env.ANDROID_SDK_ROOT || env.ANDROID_HOME || '';
  const sdkRootAvailable = Boolean(sdkRoot && fs.existsSync(sdkRoot));
  const javaOutput = commandOutput('java', ['-version']);
  const javaMatch = javaOutput?.match(/version\s+"(?:1\.)?(\d+)/i) ?? javaOutput?.match(/openjdk\s+(\d+)/i);
  const javaMajor = javaMatch ? Number(javaMatch[1]) : null;
  const androidPlatform37 = sdkRootAvailable && fs.existsSync(path.join(sdkRoot, 'platforms', 'android-37', 'android.jar'));
  const buildToolsDirectory = sdkRootAvailable ? path.join(sdkRoot, 'build-tools') : '';
  const androidBuildToolsAvailable = Boolean(
    buildToolsDirectory && fs.existsSync(buildToolsDirectory) &&
    fs.readdirSync(buildToolsDirectory, { withFileTypes: true }).some((entry) => entry.isDirectory()),
  );
  const androidAvailable = sdkRootAvailable && androidPlatform37 && androidBuildToolsAvailable && javaMajor !== null && javaMajor >= 17;
  const androidDetail = !sdkRootAvailable
    ? 'Android SDK requires ANDROID_HOME or ANDROID_SDK_ROOT to point to an installed SDK.'
    : !androidPlatform37
      ? 'Android SDK Platform 37 is required by Expo SDK 58 (platforms/android-37/android.jar is missing).'
      : !androidBuildToolsAvailable
        ? 'Android SDK Build Tools are missing from the configured SDK.'
        : javaMajor === null || javaMajor < 17
          ? 'Android compilation requires JDK 17 or newer.'
          : `Android SDK Platform 37 and Build Tools are installed; Java ${javaMajor} is available.`;
  const macOS = platform === 'darwin';
  const xcodeOutput = macOS ? commandOutput('xcodebuild', ['-version']) : null;
  const xcodeVersion = xcodeOutput?.match(/Xcode\s+(\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? null;
  const xcodeSupported = xcodeVersion !== null && isAtLeastVersion(xcodeVersion, '26.4.0');
  const cocoaPodsAvailable = macOS && commandCheck('pod', ['--version']);
  const iosAvailable = macOS && xcodeSupported && cocoaPodsAvailable;
  const iosDetail = !macOS
    ? 'iOS build requires macOS, Xcode 26.4 or newer, and CocoaPods.'
    : !xcodeVersion
      ? 'Xcode is not installed or xcodebuild is unavailable.'
      : !xcodeSupported
        ? `Xcode ${xcodeVersion} is too old; Expo SDK 58 requires Xcode 26.4 or newer.`
        : !cocoaPodsAvailable
          ? 'CocoaPods is required to install iOS native dependencies.'
          : `Xcode ${xcodeVersion} and CocoaPods are available.`;

  const checks = [
    { key: 'project-config', status: expoConfig.valid ? 'ready' : 'error', detail: expoConfig.valid ? 'app.config.js loads; app IDs and required plugins are present.' : expoConfig.reason },
    { key: 'ios-privacy-manifest', status: expoConfig.checks?.iosPrivacyManifest ? 'ready' : 'error', detail: expoConfig.checks?.iosPrivacyManifestDetail ?? 'Privacy manifest could not be validated.' },
    { key: 'local-expo-modules', status: modules.valid ? 'ready' : 'error', detail: modules.valid ? `${modules.count} local Expo modules have valid package and autolinking metadata.` : modules.reason },
    { key: 'sdk58-native-dependencies', status: sdkDependencies.valid ? 'ready' : 'error', detail: sdkDependencies.valid ? 'React Native native UI packages match the project SDK 58 compatibility baseline.' : sdkDependencies.problems.join(' ') },
    { key: 'node', status: nodeSupported ? 'ready' : 'error', detail: `Node ${nodeVersion}; Expo SDK 58 requires Node ${nodeMinimum} or newer.` },
    { key: 'dependencies', status: dependenciesInstalled ? 'ready' : 'blocked', detail: dependenciesInstalled ? 'Expo, React, React Native, React types and TypeScript are installed.' : `node_modules is incomplete; missing ${missingRuntimePackages.join(', ')}. Run npm install on a networked machine.` },
    { key: 'lockfile', status: lockfileValidation?.valid ? 'ready' : lockfilePresent ? 'error' : 'blocked', detail: lockfileValidation?.reason ?? 'No package-lock.json; run the Bootstrap npm lockfile GitHub Actions workflow, review its artifact and commit package-lock.json before CI or native builds.' },
    { key: 'android', status: androidAvailable ? 'ready' : 'blocked', detail: androidDetail },
    { key: 'ios', status: iosAvailable ? 'ready' : 'blocked', detail: iosDetail },
  ];
  return { checks, valid: checks.every((check) => check.status !== 'error'), blocked: checks.some((check) => check.status === 'blocked') };
}

function run() {
  const report = collectBuildReadiness();
  console.log('Sheademtula native build preflight');
  for (const check of report.checks) {
    const label = check.status.toUpperCase().padEnd(7);
    console.log(`${label} ${check.key}: ${check.detail}`);
  }
  console.log('');
  console.log(report.valid ? 'Project configuration checks passed.' : 'Project configuration has errors.');
  if (process.argv.includes('--strict') && report.blocked) process.exitCode = 2;
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
