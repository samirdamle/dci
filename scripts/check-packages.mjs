#!/usr/bin/env node
/**
 * Pack every public package into .pack/ (as npm would publish it) and check
 * the tarballs with publint (package.json and exports) and
 * @arethetypeswrong/cli (types for every module resolution mode).
 * Run after `pnpm build`. `--pack-only` skips the checks.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.pack');
const PACKAGES = ['protocol', 'core', 'react', 'server'];
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const name of PACKAGES) {
  execFileSync('pnpm', ['pack', '--pack-destination', out], {
    cwd: join(root, 'packages', name),
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
const tarballs = readdirSync(out).filter((f) => f.endsWith('.tgz'));
console.log(`Packed ${tarballs.join(', ')} into .pack/`);
if (process.argv.includes('--pack-only')) process.exit(0);

for (const tarball of tarballs) {
  const file = join(out, tarball);
  run('pnpm', ['exec', 'publint', '--strict', file]);
  run('pnpm', ['exec', 'attw', file, '--format', 'table-flipped']);
}
console.log('publint and attw passed for every package.');
