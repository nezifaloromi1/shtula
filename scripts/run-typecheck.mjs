import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function inspectTypecheckPrerequisites(rootDir = rootDirectory) {
  const required = [
    ['expo', 'node_modules/expo/package.json'],
    ['react', 'node_modules/react/package.json'],
    ['react-native', 'node_modules/react-native/package.json'],
    ['@types/react', 'node_modules/@types/react/package.json'],
    ['typescript', 'node_modules/typescript/bin/tsc'],
    ['expo/tsconfig.base', 'node_modules/expo/tsconfig.base.json'],
  ];
  const missing = required
    .filter(([, relativePath]) => !fs.existsSync(path.join(rootDir, relativePath)))
    .map(([name]) => name);
  return { ready: missing.length === 0, missing };
}

function run() {
  const prerequisites = inspectTypecheckPrerequisites();
  if (!prerequisites.ready) {
    console.error(`TypeScript check blocked; missing installed dependencies: ${prerequisites.missing.join(', ')}.`);
    console.error('Run `npm install` on a networked machine, then retry `npm run typecheck`.');
    process.exitCode = 2;
    return;
  }

  const tscPath = path.join(rootDirectory, 'node_modules/typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tscPath, '--noEmit'], {
    cwd: rootDirectory,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Unable to start TypeScript: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
