import { encodeEvent, type DciEvent, type DciRequest } from '@samirdamle/dci-protocol';
import { describe, expect, it, vi } from 'vitest';
import { createSSETransport } from '../src/transport';

const request: DciRequest = {
  v: 1,
  sessionId: 's',
  prompt: 'hi',
  context: [],
  page: { url: 'https://x.test/', title: 'X' },
};

/** A Response whose body streams the given chunks. */
function streamResponse(
  chunks: string[],
  init: ResponseInit = {},
  { error }: { error?: Error } = {},
) {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
      else if (error) controller.error(error);
      else controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    ...init,
  });
}

async function collect(iterable: AsyncIterable<DciEvent>): Promise<DciEvent[]> {
  const out: DciEvent[] = [];
  for await (const e of iterable) out.push(e);
  return out;
}

const sse = (...events: DciEvent[]) => events.map(encodeEvent).join('');

describe('createSSETransport', () => {
  it('posts JSON and streams events, split across chunks', async () => {
    const body = sse(
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo 🎉' },
      { type: 'done' },
    );
    const fetch = vi.fn(async () =>
      streamResponse([body.slice(0, 20), body.slice(20, 57), body.slice(57)]),
    );
    const transport = createSSETransport({
      endpoint: '/api/dci',
      fetch,
      headers: { 'X-App': '1' },
    });

    const events = await collect(transport.send(request, { signal: new AbortController().signal }));

    expect(events).toEqual([
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo 🎉' },
      { type: 'done' },
    ]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/dci');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body as string)).toEqual(request);
    const headers = init.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Accept')).toBe('text/event-stream');
    expect(headers.get('X-App')).toBe('1');
  });

  it('calls a headers function on every request', async () => {
    let n = 0;
    const headers = vi.fn(async () => ({ Authorization: `Bearer t${++n}` }));
    const fetch = vi.fn(async () => streamResponse([sse({ type: 'done' })]));
    const transport = createSSETransport({
      endpoint: '/e',
      fetch,
      headers,
      credentials: 'include',
    });
    const signal = new AbortController().signal;
    await collect(transport.send(request, { signal }));
    await collect(transport.send(request, { signal }));
    expect(headers).toHaveBeenCalledTimes(2);
    const auth = fetch.mock.calls.map((c) =>
      ((c as unknown as [string, RequestInit])[1].headers as Headers).get('Authorization'),
    );
    expect(auth).toEqual(['Bearer t1', 'Bearer t2']);
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].credentials).toBe(
      'include',
    );
  });

  it('turns a non-2xx response into an error event with the status and body', async () => {
    const fetch = vi.fn(async () => new Response('x'.repeat(900), { status: 502 }));
    const events = await collect(
      createSSETransport({ endpoint: '/e', fetch }).send(request, {
        signal: new AbortController().signal,
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', code: 'http_502' });
    expect((events[0] as { message: string }).message).toBe(`HTTP 502: ${'x'.repeat(500)}`);
  });

  it('reports network failures with code network', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const events = await collect(
      createSSETransport({ endpoint: '/e', fetch }).send(request, {
        signal: new AbortController().signal,
      }),
    );
    expect(events).toEqual([
      { type: 'error', message: 'Network error: Failed to fetch', code: 'network' },
    ]);
  });

  it('reports a stream that breaks mid-way as a network error', async () => {
    const fetch = vi.fn(async () =>
      streamResponse([sse({ type: 'text-delta', text: 'a' })], {}, { error: new Error('reset') }),
    );
    const events = await collect(
      createSSETransport({ endpoint: '/e', fetch }).send(request, {
        signal: new AbortController().signal,
      }),
    );
    expect(events).toEqual([
      { type: 'text-delta', text: 'a' },
      { type: 'error', message: 'Network error: reset', code: 'network' },
      { type: 'done' },
    ]);
  });

  it('ends quietly when aborted, before or during the stream', async () => {
    const before = new AbortController();
    before.abort();
    const rejecting = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return streamResponse([]);
    });
    expect(
      await collect(
        createSSETransport({ endpoint: '/e', fetch: rejecting }).send(request, {
          signal: before.signal,
        }),
      ),
    ).toEqual([]);

    const during = new AbortController();
    const fetch = vi.fn(async () =>
      streamResponse(
        [sse({ type: 'text-delta', text: 'a' })],
        {},
        { error: new DOMException('Aborted', 'AbortError') },
      ),
    );
    const events: DciEvent[] = [];
    for await (const e of createSSETransport({ endpoint: '/e', fetch }).send(request, {
      signal: during.signal,
    })) {
      events.push(e);
      during.abort();
    }
    expect(events).toEqual([{ type: 'text-delta', text: 'a' }]);
  });

  it('synthesizes done and warns when the stream ends without one', async () => {
    const warn = vi.fn();
    const fetch = vi.fn(async () => streamResponse([sse({ type: 'text-delta', text: 'a' })]));
    const events = await collect(
      createSSETransport({ endpoint: '/e', fetch, warn }).send(request, {
        signal: new AbortController().signal,
      }),
    );
    expect(events).toEqual([{ type: 'text-delta', text: 'a' }, { type: 'done' }]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('stops reading after done', async () => {
    const fetch = vi.fn(async () =>
      streamResponse([sse({ type: 'done' }, { type: 'text-delta', text: 'late' })]),
    );
    const events = await collect(
      createSSETransport({ endpoint: '/e', fetch }).send(request, {
        signal: new AbortController().signal,
      }),
    );
    expect(events).toEqual([{ type: 'done' }]);
  });
});
