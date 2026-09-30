#!/usr/bin/env node
/**
 * Keep each package's exported `VERSION` in step with its package.json.
 * Runs after `changeset version` (see the root `version` script).
 * `--check` fails instead of writing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const PACKAGES = ['protocol', 'core', 'react', 'server'];
const LINE = /^export const VERSION = '[^']*';$/m;

let stale = 0;
for (const name of PACKAGES) {
  const { version } = JSON.parse(
    readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'),
  );
  const file = join(root, 'packages', name, 'src/index.ts');
  const source = readFileSync(file, 'utf8');
  if (!LINE.test(source)) throw new Error(`No VERSION line in ${file}`);
  const next = source.replace(LINE, `export const VERSION = '${version}';`);
  if (next === source) continue;
  stale += 1;
  if (check) console.error(`packages/${name}: VERSION is not ${version}`);
  else writeFileSync(file, next);
}
if (check && stale) process.exit(1);
console.log(
  check ? 'VERSION constants match package.json.' : `Synced ${stale} VERSION constant(s).`,
);
