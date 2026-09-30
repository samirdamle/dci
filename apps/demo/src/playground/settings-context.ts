import type { DciConfig, ModifierKey } from '@samirdamle/dci-core';
import { createContext, useContext } from 'react';

/** The DCI options the playground can change live. */
export interface DemoSettings {
  chatMode: 'popover' | 'panel';
  /** The built-in chat, or the custom shadcn chat built on the headless hooks. */
  chatUi: 'default' | 'custom';
  modifier: ModifierKey;
  fallback: boolean;
  includeAncestors: boolean;
  ancestorData: 'compact' | 'full';
  maxSelection: number;
  overlayMode: 'boxes' | 'outline';
  confirmBeforeSend: boolean;
}

export const DEFAULT_SETTINGS: DemoSettings = {
  chatMode: 'popover',
  chatUi: 'default',
  modifier: 'Alt',
  fallback: true,
  includeAncestors: true,
  ancestorData: 'compact',
  maxSelection: 50,
  overlayMode: 'boxes',
  confirmBeforeSend: false,
};

const CHOICES: { [K in keyof DemoSettings]?: readonly DemoSettings[K][] } = {
  chatMode: ['popover', 'panel'],
  chatUi: ['default', 'custom'],
  modifier: ['Alt', 'Control', 'Meta', 'Shift'],
  ancestorData: ['compact', 'full'],
  overlayMode: ['boxes', 'outline'],
};

/**
 * Starting settings from the page URL, e.g. `?modifier=Control&fallback=off`,
 * so a playground setup can be shared as a link. Unknown keys and invalid
 * values are ignored.
 */
export function settingsFromSearch(search: string): Partial<DemoSettings> {
  const params = new URLSearchParams(search);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of params) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) continue;
    const current = DEFAULT_SETTINGS[key as keyof DemoSettings];
    const choices = CHOICES[key as keyof DemoSettings] as readonly string[] | undefined;
    if (typeof current === 'boolean') {
      if (['on', 'true', '1'].includes(raw)) out[key] = true;
      else if (['off', 'false', '0'].includes(raw)) out[key] = false;
    } else if (typeof current === 'number') {
      const n = Number(raw);
      if (Number.isInteger(n) && n > 0) out[key] = n;
    } else if (choices?.includes(raw)) {
      out[key] = raw;
    }
  }
  return out as Partial<DemoSettings>;
}

/** The settings as `createDci` options (the chat UI switch is handled by `<DciChat>`). */
export function settingsToConfig(s: DemoSettings): DciConfig {
  return {
    modifier: s.modifier,
    fallback: s.fallback,
    includeAncestors: s.includeAncestors,
    ancestorData: s.ancestorData,
    maxSelection: s.maxSelection,
    overlay: { mode: s.overlayMode },
    chat: { mode: s.chatMode, confirmBeforeSend: s.confirmBeforeSend },
  };
}

export interface PlaygroundState {
  settings: DemoSettings;
  update(patch: Partial<DemoSettings>): void;
  drawerOpen: boolean;
  setDrawerOpen(open: boolean): void;
  cheatSheetOpen: boolean;
  setCheatSheetOpen(open: boolean): void;
}

export const PlaygroundContext = createContext<PlaygroundState>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  drawerOpen: false,
  setDrawerOpen: () => {},
  cheatSheetOpen: false,
  setCheatSheetOpen: () => {},
});

export const usePlayground = () => useContext(PlaygroundContext);
