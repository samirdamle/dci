import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index';

describe('@dci/react', () => {
  it('exports a VERSION string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('workspace wiring', () => {
  it('resolves @dci/core from source', async () => {
    const core = await import('@dci/core');
    expect(core.VERSION).toBe(VERSION);
  });
});
