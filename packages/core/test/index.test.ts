import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index';

describe('@dci/core', () => {
  it('exports a VERSION string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
