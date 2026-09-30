import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { VERSION } from '../src/index';

describe('@dci/react', () => {
  it('exports VERSION, in step with package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});

describe('workspace wiring', () => {
  it('resolves @dci/core from source', async () => {
    const core = await import('@dci/core');
    expect(core.VERSION).toBe(VERSION);
  });
});
