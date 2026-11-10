import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');

export function validateLockfile(packageJson, lockfile) {
  if (!packageJson || typeof packageJson !== 'object') {
    return { valid: false, reason: 'package.json could not be read.' };
  }
  if (!lockfile || typeof lockfile !== 'object' || !lockfile.packages || typeof lockfile.packages !== 'object') {
    return { valid: false, reason: 'package-lock.json must contain a packages map.' };
  }
  if (lockfile.lockfileVersion !== 3) {
    return { valid: false, reason: `Expected npm lockfileVersion 3; found ${String(lockfile.lockfileVersion)}.` };
  }

  const root = lockfile.packages[''];
  if (!root) return { valid: false, reason: 'package-lock.json is missing its root package entry.' };
  if (root.name !== packageJson.name || root.version !== packageJson.version) {
    return { valid: false, reason: 'Lockfile root package name/version does not match package.json.' };
  }

  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const expected = packageJson[section] ?? {};
    const actual = root[section] ?? {};
    const expectedNames = Object.keys(expected).sort();
    const actualNames = Object.keys(actual).sort();
    if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
      const missing = expectedNames.filter((name) => !Object.hasOwn(actual, name));
      const unexpected = actualNames.filter((name) => !Object.hasOwn(expected, name));
      return {
        valid: false,
        reason: `${section} names differ from package.json. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}.`,
      };
    }
    for (const name of expectedNames) {
      if (actual[name] !== expected[name]) {
        return { valid: false, reason: `${section}.${name} differs: package.json has ${expected[name]}, lockfile has ${actual[name]}.` };
      }
    }
  }

  return { valid: true, reason: `npm lockfile v3 matches ${packageJson.name}@${packageJson.version} and all direct dependency declarations.` };
}

function run() {
  const packagePath = path.join(projectRoot, 'package.json');
  const lockPath = path.join(projectRoot, 'package-lock.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const lockfile = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const result = validateLockfile(packageJson, lockfile);
    console.log(result.reason);
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.error(`Cannot validate npm lockfile: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
