import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index';

describe('@dci/server', () => {
  it('exports a VERSION string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
