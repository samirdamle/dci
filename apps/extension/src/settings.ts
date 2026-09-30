import type { DciConfig, ModifierKey } from '@samirdamle/dci-core';

/**
 * What the user can set in the extension. These are not secrets: content
 * scripts read them. Backend keys live separately and only the worker reads them.
 */
export interface Settings {
  modifier: ModifierKey;
  chatMode: 'popover' | 'panel';
  chatSide: 'left' | 'right';
  maxSelection: number;
}

export const DEFAULT_SETTINGS: Settings = {
  modifier: 'Alt',
  chatMode: 'popover',
  chatSide: 'right',
  maxSelection: 50,
};

/** Storage key for `Settings` in `storage.local`. */
export const SETTINGS_KEY = 'settings';

/** Stored settings over the defaults, ignoring unknown or mistyped fields. */
export function readSettings(stored: unknown): Settings {
  const s = (stored ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const pick = <K extends keyof Settings>(key: K, ok: (v: unknown) => boolean): Settings[K] =>
    (ok(s[key]) ? s[key] : DEFAULT_SETTINGS[key]) as Settings[K];
  return {
    modifier: pick('modifier', (v) => ['Alt', 'Control', 'Meta', 'Shift'].includes(v as string)),
    chatMode: pick('chatMode', (v) => v === 'popover' || v === 'panel'),
    chatSide: pick('chatSide', (v) => v === 'left' || v === 'right'),
    maxSelection: pick('maxSelection', (v) => Number.isInteger(v) && (v as number) > 0),
  };
}

/** The DCI options the settings control (everything but the transport). */
export function settingsToConfig(settings: Settings): Partial<DciConfig> {
  return {
    modifier: settings.modifier,
    maxSelection: settings.maxSelection,
    chat: { mode: settings.chatMode, side: settings.chatSide },
  };
}
