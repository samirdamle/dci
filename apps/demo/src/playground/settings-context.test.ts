import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, settingsFromSearch, settingsToConfig } from './settings-context';

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

  it('reads the marker series', () => {
    expect(settingsFromSearch('?markers=numbers')).toEqual({ markers: 'numbers' });
    expect(settingsFromSearch('?markers=roman')).toEqual({});
  });
});

describe('settingsToConfig', () => {
  it('maps markers, with "off" as false', () => {
    expect(settingsToConfig(DEFAULT_SETTINGS).markers).toBe('letters');
    expect(settingsToConfig({ ...DEFAULT_SETTINGS, markers: 'off' }).markers).toBe(false);
  });
});
