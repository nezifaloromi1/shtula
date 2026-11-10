#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package-lock.json ]]; then
  cat >&2 <<'MESSAGE'
ERROR: package-lock.json is required for CI dependency installation.

Run the manually-triggered GitHub Actions workflow "Bootstrap npm lockfile".
Download its package-lock artifact, place package-lock.json in the repository
root, review it, and commit it. CI intentionally refuses non-reproducible
package.json-only installs.
MESSAGE
  exit 2
fi

node scripts/check-lockfile.mjs
npm ci --no-audit --no-fund
