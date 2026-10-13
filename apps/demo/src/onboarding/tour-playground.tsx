import type { DciConfig } from '@samirdamle/dci-core';
import { DciProvider, useDci, useSelection } from '@samirdamle/dci-react';
import { useEffect, useMemo, useRef } from 'react';
import { ACTIONS } from '@/app/dci-config';
import { useTheme } from '@/lib/theme-context';
import { mockTransport } from '@/mock-backend';
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
}: {
  /** A new value clears the selection (e.g. the id of a step that starts fresh). */
  resetKey: string | null;
  onCount: (count: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { settings } = usePlayground();
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
      chat: { mode: 'panel', side: 'right', panelWidth: TOUR_CHAT_WIDTH, pushContent: false },
    }),
    [theme, settings.modifier, settings.markers],
  );
  return (
    <DciProvider config={config} root={root}>
      <SelectionReporter resetKey={resetKey} onCount={onCount} />
      <div ref={root} data-testid="tour-deals">
        <SampleDeals />
      </div>
    </DciProvider>
  );
}
