import { encodeComment, encodeEvent, type DciEvent } from '@samirdamle/dci-protocol';

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export interface DciStreamOptions {
  /** Keep-alive comment interval. Default 15 000 ms; `0` disables pings. */
  pingIntervalMs?: number;
  /** Aborting it stops the stream (e.g. the request's signal). */
  signal?: AbortSignal;
  /** Called once when the client disconnects before `done`. */
  onAbort?: () => void;
}

export interface DciStream {
  /** The streaming `Response` to return from your route. */
  readonly response: Response;
  /** `true` once `done()` was sent or the client went away. */
  readonly closed: boolean;
  send(event: DciEvent): void;
  text(delta: string): void;
  toolStart(id: string, name: string, label?: string): void;
  toolEnd(id: string, ok: boolean, label?: string): void;
  /** Ask the page to act, e.g. `clientAction('highlight', { ids: ['inv_1'] })`. */
  clientAction(name: string, args?: Record<string, unknown>): void;
  error(message: string, code?: string): void;
  /** End the response. Safe to call more than once. */
  done(): void;
}

/**
 * An SSE response for the DCI protocol. Writes after `done()` or after the
 * client disconnects are ignored, so handlers never have to check.
 */
export function createDciStream(options: DciStreamOptions = {}): DciStream {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    closed = true;
    if (ping) clearInterval(ping);
    options.signal?.removeEventListener('abort', abort);
  };

  function abort() {
    if (closed) return;
    stop();
    options.onAbort?.();
  }

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel: abort,
  });

  const write = (chunk: string) => {
    if (!closed) controller.enqueue(encoder.encode(chunk));
  };

  const interval = options.pingIntervalMs ?? 15_000;
  if (interval > 0) {
    ping = setInterval(() => write(encodeComment('ping')), interval);
    (ping as { unref?: () => void }).unref?.();
  }
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort);

  const send = (event: DciEvent) => {
    if (closed) return;
    write(encodeEvent(event));
    if (event.type === 'done') {
      stop();
      controller.close();
    }
  };

  return {
    response: new Response(body, { status: 200, headers: SSE_HEADERS }),
    get closed() {
      return closed;
    },
    send,
    text: (text) => send({ type: 'text-delta', text }),
    toolStart: (id, name, label) =>
      send({ type: 'tool-start', id, name, ...(label !== undefined ? { label } : {}) }),
    toolEnd: (id, ok, label) =>
      send({ type: 'tool-end', id, ok, ...(label !== undefined ? { label } : {}) }),
    clientAction: (name, args = {}) => send({ type: 'client-action', name, args }),
    error: (message, code) =>
      send({ type: 'error', message, ...(code !== undefined ? { code } : {}) }),
    done: () => send({ type: 'done' }),
  };
}
