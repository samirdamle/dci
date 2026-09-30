import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/demo', 'apps/extension'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
