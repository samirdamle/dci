import type { DciConfig } from '@samirdamle/dci-core';
import { DciProvider, useDci, useSelection } from '@samirdamle/dci-react';
import { useEffect, useMemo, useRef } from 'react';
import { ACTIONS } from '@/app/dci-config';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@/lib/theme-context';
import { mockTransport } from '@/mock-backend';
import { SelectModeBar } from '@/playground/select-mode-bar';
import { usePlayground } from '@/playground/settings-context';
import { SampleDeals } from './sample-deals';
import { TOUR_CHAT_WIDTH } from './tour-data';

/** Reports the selection size, and clears it when `resetKey` changes to a truthy value. */
function SelectionReporter({
  resetKey,
  onCount,
}: {
  resetKey: string | null;
  onCount: (count: number) => void;
}) {
  const dci = useDci();
  const { nodes } = useSelection();
  useEffect(() => onCount(nodes.length), [nodes.length, onCount]);
  useEffect(() => {
    if (!dci || !resetKey) return;
    dci.selection.clear();
    dci.chat.close();
  }, [dci, resetKey]);
  return null;
}

/**
 * The sample deals with their own DCI instance: scoped to the deals, answered
 * by the in-browser mock (instant, offline, free), and keyed like the page.
 */
export function TourPlayground({
  resetKey,
  onCount,
  selectBar = false,
}: {
  /** A new value clears the selection (e.g. the id of a step that starts fresh). */
  resetKey: string | null;
  onCount: (count: number) => void;
  /** Show the Select mode bar under the deals (touch screens). */
  selectBar?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { settings } = usePlayground();
  const narrow = useIsMobile();
  const config = useMemo<DciConfig>(
    () => ({
      transport: mockTransport,
      actions: ACTIONS,
      theme,
      modifier: settings.modifier,
      markers: settings.markers === 'off' ? false : settings.markers,
      // Only the cards count; a click between them clears the selection.
      fallback: false,
      // Docked beside the tour, so it never covers the deals or the buttons.
      chat: {
        mode: 'panel',
        side: 'right',
        panelWidth: TOUR_CHAT_WIDTH,
        pushContent: false,
        // On a phone it would cover the tour: it opens from the Select bar's Ask instead.
        ...(narrow ? { autoOpen: false as const } : {}),
      },
    }),
    [theme, settings.modifier, settings.markers, narrow],
  );
  return (
    <DciProvider config={config} root={root}>
      <SelectionReporter resetKey={resetKey} onCount={onCount} />
      <div ref={root} data-testid="tour-deals">
        <SampleDeals />
      </div>
      {selectBar && <SelectModeBar always className="mt-2 justify-center" />}
    </DciProvider>
  );
}
