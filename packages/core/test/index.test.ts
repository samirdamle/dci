import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { VERSION } from '../src/index';

describe('@samirdamle/dci-core', () => {
  it('exports VERSION, in step with package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
