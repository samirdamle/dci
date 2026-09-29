// `pnpm dev`: the Vite app and the demo backend together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

const children = [
  spawn('pnpm', ['exec', 'tsx', 'watch', '--conditions=@dci/source', 'server/index.ts'], {
    stdio: 'inherit',
  }),
  spawn('pnpm', ['exec', 'vite', ...process.argv.slice(2)], { stdio: 'inherit' }),
];
const stop = (code = 0) => {
  for (const child of children) child.kill();
  process.exit(code);
};
for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
