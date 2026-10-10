import { devWarn } from './env';

/**
 * How selected nodes are named in badges, chips and requests:
 * `'letters'` (A, B … Z, AA, AB …), `'numbers'` (1, 2, 3 …), or a function
 * from the 0-based selection index to a short label (e.g. `(i) => `R${i + 1}``).
 */
export type MarkerSeries = 'letters' | 'numbers' | ((index: number) => string);

/** A, B … Z, AA, AB … for 0, 1 … 25, 26, 27 … */
export function letterMarker(index: number): string {
  let out = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  }
  return out;
}

/** The marker for the `index`-th selected node (0-based). */
export function formatMarker(index: number, series: MarkerSeries): string {
  if (series === 'numbers') return String(index + 1);
  if (typeof series === 'function') return String(series(index));
  return letterMarker(index);
}

/** Warn (in development) when a custom series gives two nodes the same marker. */
export function checkMarkers(markers: Array<string | undefined>): void {
  const seen = new Set<string>();
  for (const m of markers) {
    if (m === undefined) continue;
    if (seen.has(m)) {
      devWarn(
        `Two selected nodes share the marker "${m}"; a custom \`markers\` series must return unique values.`,
      );
      return;
    }
    seen.add(m);
  }
}
