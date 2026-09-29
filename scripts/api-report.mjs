// Tracks each package's public API: the bundled `.d.ts` of every entry point is
// committed under `packages/<name>/api/`, so API changes show up in review.
//   node scripts/api-report.mjs          write the reports (after `pnpm build`)
//   node scripts/api-report.mjs --check  fail if a committed report is stale
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const check = process.argv.includes('--check');
const stale = [];

for (const pkg of readdirSync('packages')) {
  const manifest = join('packages', pkg, 'package.json');
  if (!existsSync(manifest)) continue;
  // Public entry points: the ESM `types` of each `exports` subpath.
  const exports = JSON.parse(readFileSync(manifest, 'utf8')).exports ?? {};
  const entries = Object.values(exports)
    .map((e) => (typeof e === 'object' ? e.import?.types : undefined))
    .filter(Boolean);
  for (const entry of entries) {
    const file = basename(entry);
    const source = join('packages', pkg, entry);
    if (!existsSync(source)) throw new Error(`${source} is missing: run \`pnpm build\` first.`);
    // Drop the sourcemap comment so reports only change with the API.
    const api = readFileSync(source, 'utf8').replace(/\n\/\/# sourceMappingURL=.*\n?$/, '\n');
    const out = join('packages', pkg, 'api', file.replace(/\.d\.ts$/, '.api.d.ts'));
    const current = existsSync(out) ? readFileSync(out, 'utf8') : null;
    if (current === api) continue;
    if (check) stale.push(out);
    else {
      mkdirSync(join('packages', pkg, 'api'), { recursive: true });
      writeFileSync(out, api);
      console.log(`updated ${out}`);
    }
  }
}

if (stale.length) {
  console.error(
    `The public API changed:\n  ${stale.join('\n  ')}\nRun \`pnpm build && pnpm api:report\` and commit the result.`,
  );
  process.exit(1);
}
