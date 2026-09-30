import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds the browser extension's e2e variant once, before any test runs:
 * building per test worker would rewrite it under browsers already using it.
 */
export default function globalSetup() {
  const extension = join(dirname(fileURLToPath(import.meta.url)), '../apps/extension');
  execFileSync(process.execPath, ['scripts/build.mjs', '--e2e'], { cwd: extension });
}
