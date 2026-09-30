// Builds the extension for each browser into dist/<target>, and with --zip
// packs each build for its store: dist/dci-<target>-<version>.zip.
// --e2e builds dist/e2e instead: Chrome only, allowed to run on the test origin
// (http://dci.test) and to reach the demo backend (127.0.0.1), with the toolbar
// toggle exposed to Playwright.
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const e2e = process.argv.includes('--e2e');
const TARGETS = e2e ? ['chrome'] : ['chrome', 'firefox'];
/** The origin e2e tests serve their pages from (with `page.route`). */
export const E2E_ORIGIN = 'http://dci.test';

/** Scripts, bundled as classic scripts (MV3 content scripts can't be modules). */
const ENTRIES = {
  content: 'src/content.ts',
  background: 'src/background.ts',
  popup: 'src/popup.ts',
  options: 'src/options.ts',
};

async function loadManifest() {
  const out = await build({
    entryPoints: [join(root, 'src/manifest.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  const url = `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`;
  return (await import(url)).manifest;
}

async function buildTarget(target, manifest) {
  const out = join(dist, e2e ? 'e2e' : target);
  rmSync(out, { recursive: true, force: true });
  await build({
    entryPoints: Object.fromEntries(
      Object.entries(ENTRIES).map(([name, file]) => [name, join(root, file)]),
    ),
    outdir: out,
    bundle: true,
    format: 'iife',
    target: ['chrome121', 'firefox128'],
    // Bundle the workspace packages from source, like the demo does.
    conditions: ['@dci/source'],
    minify: true,
    sourcemap: 'linked',
    legalComments: 'none',
    define: { __E2E__: String(e2e) },
    logLevel: 'warning',
  });
  cpSync(join(root, 'static'), out, { recursive: true });
  const json = manifest(target, version);
  if (e2e) json.host_permissions = [`${E2E_ORIGIN}/*`, 'http://127.0.0.1/*'];
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(json, null, 2));
  return out;
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** DOS date for 1980-01-01, the earliest valid one: fixed, so zips are reproducible. */
const DOS_DATE = (1 << 5) | 1;

/** A minimal zip writer (deflate, no zip64): enough for an extension package. */
function zip(dir, outFile) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const path of files(dir).filter((p) => !p.endsWith('.map'))) {
    const name = Buffer.from(relative(dir, path).split('\\').join('/'));
    const data = readFileSync(path);
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(outFile, Buffer.concat([...local, ...central, end]));
}

const manifest = await loadManifest();
mkdirSync(dist, { recursive: true });
for (const target of TARGETS) {
  const out = await buildTarget(target, manifest);
  if (process.argv.includes('--zip')) {
    const file = join(dist, `dci-${target}-${version}.zip`);
    zip(out, file);
    console.log(`Packed ${relative(root, file)}`);
  } else {
    console.log(`Built ${relative(root, out)}`);
  }
}
