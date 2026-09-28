import { afterEach } from 'vitest';
import { cleanupFixtures } from './test-utils';

afterEach(() => {
  cleanupFixtures();
});
