import { decodeSSEStream, ERROR_CODES, type DciEvent, type DciRequest } from '@dci/protocol';
import { devWarn, type Warn } from './env';

/**
 * How DCI talks to a backend. The default speaks the SSE protocol over
 * `fetch`; adapters (Vercel AI SDK, AG-UI, WebSocket, …) implement the same
 * interface, so swapping one in needs no other changes.
 */
export interface Transport {
  send(request: DciRequest, options: { signal: AbortSignal }): AsyncIterable<DciEvent>;
}

type HeadersInput = Record<string, string> | Headers;

export interface SSETransportOptions {
  /** URL to `POST` requests to. */
  endpoint: string;
  /** Extra headers, or a (possibly async) function evaluated on every request. */
  headers?: HeadersInput | (() => HeadersInput | Promise<HeadersInput>);
  /** Custom `fetch`, e.g. an auth wrapper or a test double. Default: global `fetch`. */
  fetch?: typeof fetch;
  /** Default `'same-origin'`. */
  credentials?: RequestCredentials;
  /** Receives protocol warnings. Default: dev-mode `console.warn`. */
  warn?: Warn;
}

const MAX_ERROR_BODY = 500;

const isAbort = (err: unknown, signal: AbortSignal) =>
  signal.aborted || (err instanceof Error && err.name === 'AbortError');

/**
 * The default transport: `POST`s the request as JSON and reads the SSE
 * response. Failures become `error` events (HTTP status, `network`); an abort
 * ends quietly; a stream that stops without `done` gets a synthetic one.
 * There are no automatic retries: retrying is a user action.
 */
export function createSSETransport(options: SSETransportOptions): Transport {
  const warn = options.warn ?? devWarn;

  return {
    async *send(request, { signal }) {
      const doFetch = options.fetch ?? fetch;
      let response: Response;
      try {
        const extra =
          typeof options.headers === 'function' ? await options.headers() : options.headers;
        const headers = new Headers(extra);
        headers.set('Content-Type', 'application/json');
        headers.set('Accept', 'text/event-stream');
        response = await doFetch(options.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
          credentials: options.credentials ?? 'same-origin',
          signal,
        });
      } catch (err) {
        if (isAbort(err, signal)) return;
        const message = err instanceof Error ? err.message : String(err);
        yield { type: 'error', message: `Network error: ${message}`, code: ERROR_CODES.network };
        return;
      }

      if (!response.ok || !response.body) {
        let body = '';
        try {
          body = (await response.text()).slice(0, MAX_ERROR_BODY);
        } catch {
          // Body unreadable; the status alone will do.
        }
        yield {
          type: 'error',
          message: `HTTP ${response.status}${body ? `: ${body}` : ''}`,
          code: `http_${response.status}`,
        };
        return;
      }

      let sawDone = false;
      try {
        for await (const event of decodeSSEStream(response.body)) {
          yield event;
          if (event.type === 'done') {
            sawDone = true;
            return;
          }
        }
      } catch (err) {
        if (isAbort(err, signal)) return;
        const message = err instanceof Error ? err.message : String(err);
        yield { type: 'error', message: `Network error: ${message}`, code: ERROR_CODES.network };
      }
      if (!sawDone && !signal.aborted) {
        warn('The response stream ended without a done event.');
        yield { type: 'done' };
      }
    },
  };
}
