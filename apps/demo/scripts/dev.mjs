// `pnpm dev`: the Vite app and the demo backend together; Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Run a package's CLI with this Node directly. Spawning `pnpm` needs a shell
 * on Windows (it's `pnpm.cmd`), and killing that shell would orphan the CLI.
 */
function run(pkg, args) {
  const manifest = require.resolve(`${pkg}/package.json`);
  const { bin } = require(manifest);
  const cli = join(dirname(manifest), typeof bin === 'string' ? bin : bin[pkg]);
  return spawn(process.execPath, [cli, ...args], { stdio: 'inherit' });
}

const children = [
  run('tsx', ['watch', '--conditions=@dci/source', 'server/index.ts']),
  run('vite', process.argv.slice(2)),
];
const stop = (code = 0) => {
  for (const child of children) child.kill();
  process.exit(code);
};
for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
