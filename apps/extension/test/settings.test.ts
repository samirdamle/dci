import { describe, expect, it } from 'vitest';
import { manifest } from '../src/manifest';
import { DEFAULT_SETTINGS, readSettings, settingsToConfig } from '../src/settings';

describe('settings', () => {
  it('falls back to the defaults for missing or invalid values', () => {
    expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ modifier: 'Hyper', chatMode: 'panel', maxSelection: -2 })).toEqual({
      ...DEFAULT_SETTINGS,
      chatMode: 'panel',
    });
  });

  it('maps to DCI options', () => {
    expect(
      settingsToConfig({ modifier: 'Shift', chatMode: 'panel', chatSide: 'left', maxSelection: 5 }),
    ).toEqual({ modifier: 'Shift', maxSelection: 5, chat: { mode: 'panel', side: 'left' } });
  });
});

describe('manifest', () => {
  it('uses a service worker on Chrome and an event page on Firefox', () => {
    expect(manifest('chrome', '1.2.3').background).toEqual({ service_worker: 'background.js' });
    const firefox = manifest('firefox', '1.2.3');
    expect(firefox.background).toEqual({ scripts: ['background.js'] });
    expect(firefox).toHaveProperty('browser_specific_settings.gecko.id');
  });

  it('asks for no host permissions: DCI runs only where the user turns it on', () => {
    for (const target of ['chrome', 'firefox'] as const) {
      const m = manifest(target, '1.0.0');
      expect(m).not.toHaveProperty('host_permissions');
      expect(m).not.toHaveProperty('content_scripts');
      expect(m.permissions).toEqual(['activeTab', 'scripting', 'storage']);
    }
  });
});
