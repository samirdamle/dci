import type { DciConfig, ModifierKey } from '@dci/core';
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
