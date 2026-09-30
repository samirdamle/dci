import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { VERSION } from '../src/index';

describe('@samirdamle/dci-react', () => {
  it('exports VERSION, in step with package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});

describe('workspace wiring', () => {
  it('resolves @samirdamle/dci-core from source', async () => {
    const core = await import('@samirdamle/dci-core');
    expect(core.VERSION).toBe(VERSION);
  });
});
