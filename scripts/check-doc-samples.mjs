#!/usr/bin/env node
/**
 * Type-check every TypeScript sample in the Markdown docs.
 *
 * Extracts each ```ts / ```tsx fence from README.md, CONTRIBUTING.md and
 * docs/**\/*.md into docs/_samples/, one module per block, and compiles them
 * with docs/tsconfig.json. Mark a fence `ts nocheck` for deliberate fragments.
 * Placeholders samples may use (`token`, `store`, …) are declared in
 * docs/samples-env.d.ts.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const out = join(docs, '_samples');

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.') || name.startsWith('_') || ['node_modules', 'api'].includes(name))
      return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

const files = [join(root, 'README.md'), join(root, 'CONTRIBUTING.md'), ...markdownFiles(docs)];
const FENCE = /^```(tsx|ts)\b([^\n]*)\n([\s\S]*?)^```$/gm;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const index = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const name = relative(root, file).replace(/[\\/]/g, '__').replace(/\.md$/, '');
  let n = 0;
  for (const match of text.matchAll(FENCE)) {
    const [, lang, info, code] = match;
    if (/\bnocheck\b/.test(info)) continue;
    n += 1;
    const line = text.slice(0, match.index).split('\n').length + 1;
    const target = join(out, `${name}.${n}.${lang}`);
    // `export {}` keeps each sample in its own module scope.
    writeFileSync(target, `// ${relative(root, file)}:${line}\n${code}\nexport {};\n`);
    index.push(`${basename(target)} ← ${relative(root, file)}:${line}`);
  }
}

console.log(`Type-checking ${index.length} doc samples…`);
try {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', docs], {
    stdio: 'inherit',
  });
} catch {
  console.error('\nSample files map back to the docs like this:\n' + index.join('\n'));
  process.exit(1);
}
console.log('All doc samples compile.');
