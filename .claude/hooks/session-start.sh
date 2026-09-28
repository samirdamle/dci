#!/bin/bash
# Install workspace dependencies so lint, typecheck and tests run immediately
# in Claude Code on the web sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Use the pnpm version pinned in package.json#packageManager when corepack is available.
if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

# `pnpm install` (not --frozen-lockfile) so the cached container state is reused.
pnpm install --prefer-offline

# Playwright uses the pre-installed Chromium; never download browsers here.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' >> "$CLAUDE_ENV_FILE"
fi
