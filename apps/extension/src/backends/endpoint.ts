import { createSSETransport } from '@samirdamle/dci-core';
import type { Backend } from './types';

export interface EndpointOptions {
  /** A DCI endpoint: `POST` a `DciRequest`, get DCI events back as SSE. */
  url: string;
  /** Sent as the `Authorization` header when set. */
  authorization?: string;
  /** For tests. Default: the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Forwards requests to a DCI endpoint (any backend speaking the protocol in
 * docs/protocol.md), reusing core's SSE transport. Runs in the worker, so the
 * auth header stays out of the page. HTTP failures become `error` events.
 */
export function endpointBackend({ url, authorization, fetch }: EndpointOptions): Backend {
  const transport = createSSETransport({
    endpoint: url,
    credentials: 'omit',
    ...(authorization ? { headers: { Authorization: authorization } } : {}),
    ...(fetch ? { fetch } : {}),
  });
  return (request, signal) => transport.send(request, { signal });
}
