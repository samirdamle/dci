import { fileURLToPath, URL } from 'node:url';
import { defineProject } from 'vitest/config';
import { sharedResolve } from '../../vitest.shared.ts';

export default defineProject({
  ...sharedResolve,
  resolve: {
    ...sharedResolve.resolve,
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    name: 'demo',
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
