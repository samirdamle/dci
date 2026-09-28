import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index';

describe('@dci/protocol', () => {
  it('exports a VERSION string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
