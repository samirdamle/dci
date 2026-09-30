import { createSSETransport, type Transport } from '@samirdamle/dci-core';
import { useSyncExternalStore } from 'react';
import { createMockResponder } from '@/agent/mock-responder';
import { createOrgStore, generateOrg } from '@/data';

export type BackendMode = 'claude' | 'mock' | 'browser';

export interface Backend {
  mode: BackendMode;
  /** The Claude model, in Claude mode. */
  model?: string;
  transport: Transport;
}

/**
 * The mock responder running in the page (static hosting, e.g. GitHub Pages).
 * It keeps its own copy of the org, like the server does, and changes the
 * page's copy only through `client-action`s.
 */
function browserBackend(): Backend {
  const respond = createMockResponder({ store: createOrgStore(generateOrg()) });
  return {
    mode: 'browser',
    transport: {
      async *send(request, { signal }) {
        yield* respond(request, signal);
        if (!signal.aborted) yield { type: 'done' };
      },
    },
  };
}

let backend: Promise<Backend> | null = null;
let current: Backend | null = null;
const listeners = new Set<() => void>();

/** Use the demo server when it answers `/api/mode`; otherwise run in the browser. */
export function resolveBackend(): Promise<Backend> {
  backend ??= fetch('/api/mode', { headers: { Accept: 'application/json' } })
    .then(async (res) => {
      if (!res.ok || !res.headers.get('content-type')?.includes('json'))
        throw new Error('no server');
      const info = (await res.json()) as { mode: 'claude' | 'mock'; model?: string };
      return {
        mode: info.mode,
        ...(info.model ? { model: info.model } : {}),
        transport: createSSETransport({ endpoint: '/api/dci' }),
      };
    })
    .catch(browserBackend)
    .then((b) => {
      current = b;
      listeners.forEach((fn) => fn());
      return b;
    });
  return backend;
}

/** A transport that waits for the backend to be resolved, then delegates. */
export const autoTransport: Transport = {
  async *send(request, options) {
    const { transport } = await resolveBackend();
    yield* transport.send(request, options);
  },
};

/** The resolved backend (`null` while it is being detected). */
export function useBackend(): Backend | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      void resolveBackend();
      return () => listeners.delete(fn);
    },
    () => current,
    () => null,
  );
}
