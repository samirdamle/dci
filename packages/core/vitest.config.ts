import { defineProject } from 'vitest/config';
import { sharedResolve } from '../../vitest.shared.ts';

export default defineProject({
  ...sharedResolve,
  test: {
    name: 'core',
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
  },
});
