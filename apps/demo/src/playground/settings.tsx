import { useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_SETTINGS,
  PlaygroundContext,
  settingsFromSearch,
  type DemoSettings,
} from './settings-context';
import { shouldAutoOpenTour } from '@/onboarding/tour-storage';

/** Playground state: the DCI options being tried, and which panels are open. */
export function PlaygroundProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DemoSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...settingsFromSearch(window.location.search),
  }));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => shouldAutoOpenTour(window.location.search));
  const value = useMemo(
    () => ({
      settings,
      update: (patch: Partial<DemoSettings>) => setSettings((s) => ({ ...s, ...patch })),
      drawerOpen,
      setDrawerOpen,
      cheatSheetOpen,
      setCheatSheetOpen,
      tourOpen,
      setTourOpen,
    }),
    [settings, drawerOpen, cheatSheetOpen, tourOpen],
  );
  return <PlaygroundContext.Provider value={value}>{children}</PlaygroundContext.Provider>;
}
