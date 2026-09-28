import { defineProject } from 'vitest/config';
import { sharedResolve } from '../../vitest.shared.ts';

export default defineProject({
  ...sharedResolve,
  test: {
    name: 'react',
    environment: 'happy-dom',
  },
});
