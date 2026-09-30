import { ERROR_CODES, type DciRequest } from '@samirdamle/dci-protocol';
import { DciRequestError } from './errors';
import { parseDciRequest } from './parse';
import { createDciStream, type DciStream, type DciStreamOptions } from './stream';

export type DciHandlerFn = (
  request: DciRequest,
  stream: DciStream,
  context: { signal: AbortSignal; raw: Request },
) => void | Promise<void>;

export type DciHandlerOptions = Pick<DciStreamOptions, 'pingIntervalMs'>;

/** A Web-standard route handler: `(Request) => Promise<Response>`. */
export type WebHandler = (request: Request) => Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Wrap your agent code as a route handler. It parses and validates the
 * request, streams whatever you send, and always finishes with `done`
 * (after an `error` event if your function throws). `signal` aborts when
 * the client disconnects; stop your LLM call when it fires.
 */
export function dciHandler(fn: DciHandlerFn, options: DciHandlerOptions = {}): WebHandler {
  return async (raw) => {
    let request: DciRequest;
    try {
      request = await parseDciRequest(raw);
    } catch (err) {
      if (!(err instanceof DciRequestError)) throw err;
      if (err.code === ERROR_CODES.unsupportedVersion) {
        // The client understands SSE errors, so answer in-protocol.
        const stream = createDciStream({ pingIntervalMs: 0 });
        stream.error(err.message, err.code);
        stream.done();
        return stream.response;
      }
      return json(err.status, { error: err.message, code: err.code, issues: err.issues });
    }

    const controller = new AbortController();
    const stream = createDciStream({
      ...options,
      signal: raw.signal,
      onAbort: () => controller.abort(),
    });

    void (async () => {
      try {
        await fn(request, stream, { signal: controller.signal, raw });
      } catch (err) {
        if (!controller.signal.aborted) {
          stream.error(err instanceof Error ? err.message : String(err), ERROR_CODES.handler);
        }
      } finally {
        stream.done();
      }
    })();

    return stream.response;
  };
}
