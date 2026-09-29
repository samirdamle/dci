import { describe, expect, it } from 'vitest';
import { settingsFromSearch } from './settings-context';

describe('settingsFromSearch', () => {
  it('reads choices, switches and numbers', () => {
    expect(
      settingsFromSearch('?modifier=Control&fallback=off&maxSelection=3&chatMode=panel'),
    ).toEqual({ modifier: 'Control', fallback: false, maxSelection: 3, chatMode: 'panel' });
  });

  it('ignores unknown keys and invalid values', () => {
    expect(
      settingsFromSearch('?modifier=Hyper&fallback=maybe&maxSelection=-1&evil=1&toString=x'),
    ).toEqual({});
  });
});
