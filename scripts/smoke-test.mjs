#!/usr/bin/env node
/**
 * Install the packed tarballs (from `pnpm pack:all`, in .pack/) into scratch
 * projects with plain npm, the way users will, and check they work:
 *
 * - node-esm / node-cjs: import/require every entry point, run a dciHandler
 *   round-trip and check SSR safety (importing core without a DOM)
 * - react-ssr: render <DciProvider> with react-dom/server
 * - vite: a production build of a React app using @dci/react
 * - next: `next build` of an App Router app with a client page and a route
 *   handler (skipped with --skip-next)
 *
 * Usage: node scripts/smoke-test.mjs [--skip-next] [--keep]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packDir = join(root, '.pack');
const args = new Set(process.argv.slice(2));
const work = mkdtempSync(join(tmpdir(), 'dci-smoke-'));

const tarballs = Object.fromEntries(
  readdirSync(packDir)
    .filter((f) => f.endsWith('.tgz'))
    .map((f) => [
      `@dci/${f.replace(/^dci-/, '').replace(/-\d.*\.tgz$/, '')}`,
      `file:${join(packDir, f)}`,
    ]),
);
if (Object.keys(tarballs).length !== 4) {
  console.error(
    `Expected 4 tarballs in .pack/, found: ${Object.keys(tarballs).join(', ') || 'none'}.`,
  );
  console.error('Run `pnpm pack:all` first.');
  process.exit(1);
}

function project(name, { deps = {}, files = {}, type = 'module' }) {
  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: `smoke-${name}`,
        private: true,
        type,
        dependencies: { ...tarballs, ...deps },
        // Internal @dci deps (e.g. core → protocol) resolve to the local tarballs too.
        overrides: tarballs,
      },
      null,
      2,
    ),
  );
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  return dir;
}

function run(dir, cmd, cmdArgs) {
  execFileSync(cmd, cmdArgs, {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
}

function install(dir) {
  run(dir, 'npm', ['install', '--no-audit', '--no-fund', '--loglevel=error']);
}

const REQUEST = `{ v: 1, sessionId: 's1', prompt: 'Hi', context: [{ id: 'inv_1', type: 'invoice', label: 'Invoice #1', data: {}, source: 'annotated' }], page: { url: '/', title: 'Smoke' } }`;

const serverCheck = (load) => `
${load}
const handler = server.dciHandler(async (req, stream) => {
  stream.text('Context: ' + server.formatContextForPrompt(req.context).length + ' chars');
  stream.clientAction('highlight', { ids: ['inv_1'] });
});
const res = await handler(new Request('http://x/api/dci', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(${REQUEST}),
}));
const text = await res.text();
const events = protocol.createSSEDecoder().push(text).map((e) => e.type);
assert.deepEqual(events, ['text-delta', 'client-action', 'done']);
assert.equal(typeof node.toNodeHandler(handler), 'function');
// Core and React import without a DOM (SSR) and have no side effects.
assert.equal(typeof core.createDci, 'function');
assert.equal(typeof react.DciProvider, 'function');
assert.equal(core.VERSION, react.VERSION);
assert.equal(core.VERSION, server.VERSION);
console.log('ok', core.VERSION);
`;

const checks = [];

checks.push(() => {
  const dir = project('node-esm', {
    files: {
      'check.mjs': serverCheck(`
import assert from 'node:assert/strict';
import * as core from '@dci/core';
import * as protocol from '@dci/protocol';
import * as react from '@dci/react';
import * as server from '@dci/server';
import * as node from '@dci/server/node';`),
    },
    deps: { react: '^19.0.0' },
  });
  install(dir);
  run(dir, 'node', ['check.mjs']);
});

checks.push(() => {
  const dir = project('node-cjs', {
    type: 'commonjs',
    files: {
      'check.cjs': `(async () => {${serverCheck(`
const assert = require('node:assert/strict');
const core = require('@dci/core');
const protocol = require('@dci/protocol');
const react = require('@dci/react');
const server = require('@dci/server');
const node = require('@dci/server/node');`)}})().catch((e) => { console.error(e); process.exit(1); });`,
    },
    deps: { react: '^19.0.0' },
  });
  install(dir);
  run(dir, 'node', ['check.cjs']);
});

checks.push(() => {
  const dir = project('react-ssr', {
    deps: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    files: {
      'check.mjs': `
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { dci, DciProvider } from '@dci/react';
const html = renderToString(
  h(DciProvider, { config: { endpoint: '/api/dci' } },
    h('article', dci({ id: 'inv_1', type: 'invoice', label: 'Invoice #1' }), 'Invoice #1')),
);
assert.match(html, /data-dci="\\{&quot;id&quot;:&quot;inv_1&quot;/);
console.log('ok', html);
`,
    },
  });
  install(dir);
  run(dir, 'node', ['check.mjs']);
});

checks.push(() => {
  const dir = project('vite', {
    deps: {
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      vite: '^7.0.0',
      '@vitejs/plugin-react': '^5.0.0',
    },
    files: {
      'index.html':
        '<!doctype html><div id="root"></div><script type="module" src="/main.jsx"></script>',
      'vite.config.js': `import react from '@vitejs/plugin-react';\nexport default { plugins: [react()] };`,
      'main.jsx': `
import { createRoot } from 'react-dom/client';
import { dci, DciProvider, useSelection } from '@dci/react';
import { createDci } from '@dci/core';
const config = { endpoint: '/api/dci' };
function App() {
  const { nodes } = useSelection();
  return <article {...dci({ id: 'inv_1', type: 'invoice' })}>{nodes.length}</article>;
}
createRoot(document.getElementById('root')).render(<DciProvider config={config}><App /></DciProvider>);
export { createDci };
`,
    },
  });
  install(dir);
  run(dir, 'npx', ['vite', 'build', '--logLevel', 'warn']);
});

if (!args.has('--skip-next')) {
  checks.push(() => {
    const dir = project('next', {
      deps: { next: '^16.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
      files: {
        'app/layout.jsx': `export default function Layout({ children }) { return <html lang="en"><body>{children}</body></html>; }`,
        'app/page.jsx': `
'use client';
import { dci, DciProvider } from '@dci/react';
const config = { endpoint: '/api/dci' };
export default function Page() {
  return <DciProvider config={config}><article {...dci({ id: 'inv_1', type: 'invoice' })}>Invoice</article></DciProvider>;
}`,
        'app/api/dci/route.js': `
import { dciHandler } from '@dci/server';
export const dynamic = 'force-dynamic';
export const POST = dciHandler(async (req, stream) => stream.text('Hi ' + req.prompt));`,
      },
    });
    install(dir);
    run(dir, 'npx', ['next', 'build']);
  });
}

try {
  for (const check of checks) check();
  console.log(`\nAll ${checks.length} smoke tests passed (${work}).`);
} finally {
  if (!args.has('--keep')) rmSync(work, { recursive: true, force: true });
}
