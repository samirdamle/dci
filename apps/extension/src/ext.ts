/**
 * The WebExtension API: Firefox's `browser`, else Chrome's `chrome`. Both are
 * promise-based in Manifest V3 and share the shape used here.
 */
export function ext(): typeof chrome {
  const g = globalThis as { browser?: typeof chrome; chrome?: typeof chrome };
  const api = g.browser ?? g.chrome;
  if (!api?.runtime) throw new Error('DCI: no WebExtension API in this context.');
  return api;
}
