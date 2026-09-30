import type { DciConfig, ModifierKey } from '@samirdamle/dci-core';

/** Where chat requests go. */
export type BackendKind = 'offline' | 'endpoint' | 'claude';

/** Claude models offered in the options (the first is the default). */
export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'] as const;

/**
 * What the user can set in the extension. These are not secrets: content
 * scripts read them. Keys and auth headers live in `Secrets`, which only the
 * background worker and the options page read.
 */
export interface Settings {
  modifier: ModifierKey;
  chatMode: 'popover' | 'panel';
  chatSide: 'left' | 'right';
  maxSelection: number;
  backend: BackendKind;
  /** A DCI endpoint (the protocol in docs/protocol.md), for `backend: 'endpoint'`. */
  endpointUrl: string;
  claudeModel: string;
  /** Origins (e.g. `https://example.com`) where DCI starts on every page load. */
  alwaysOnSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  modifier: 'Alt',
  chatMode: 'popover',
  chatSide: 'right',
  maxSelection: 50,
  backend: 'offline',
  endpointUrl: '',
  claudeModel: CLAUDE_MODELS[0],
  alwaysOnSites: [],
};

/** Storage key for `Settings` in `storage.local`. */
export const SETTINGS_KEY = 'settings';

const isOrigin = (v: unknown) => {
  if (typeof v !== 'string') return false;
  try {
    const url = new URL(v);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === v;
  } catch {
    return false;
  }
};

const isHttpUrl = (v: unknown) => {
  if (typeof v !== 'string') return false;
  try {
    return /^https?:$/.test(new URL(v).protocol);
  } catch {
    return false;
  }
};

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
    backend: pick('backend', (v) => v === 'offline' || v === 'endpoint' || v === 'claude'),
    endpointUrl: pick('endpointUrl', (v) => v === '' || isHttpUrl(v)),
    claudeModel: pick('claudeModel', (v) => typeof v === 'string' && /^claude-[\w.-]+$/.test(v)),
    alwaysOnSites: pick('alwaysOnSites', (v) => Array.isArray(v) && v.every(isOrigin)),
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

/** Match pattern for every page of an origin, for permissions and content scripts. */
export const originPattern = (origin: string) => `${origin}/*`;
