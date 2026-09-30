import type { DciEvent, DciRequest } from '@samirdamle/dci-protocol';
import { describe, expect, it, vi } from 'vitest';
import { claudeBackend, type History } from '../src/backends/claude';
import { endpointBackend } from '../src/backends/endpoint';
import { selectBackend } from '../src/backends/index';
import { EMPTY_SECRETS } from '../src/secrets';
import { DEFAULT_SETTINGS } from '../src/settings';

const request: DciRequest = {
  v: 1,
  sessionId: 's1',
  prompt: 'Who is this?',
  context: [{ data: {}, source: 'fallback', fallback: { tagName: 'td', text: 'Ada', path: 'td' } }],
  page: { url: 'https://shop.example/orders', title: 'Orders' },
};

async function collect(events: AsyncIterable<DciEvent>) {
  const out: DciEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const run = (backend: ReturnType<typeof selectBackend>) =>
  collect(backend(request, new AbortController().signal));

function memoryHistory(): History & { data: Map<string, unknown[]> } {
  const data = new Map<string, unknown[]>();
  return {
    data,
    get: async (id) => structuredClone((data.get(id) ?? []) as never),
    set: async (id, messages) => void data.set(id, structuredClone(messages)),
  };
}

const sse = (frames: Array<[string, unknown]>) =>
  frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');

function claudeStream(text: string[], stopReason = 'end_turn') {
  return sse([
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      },
    ],
    [
      'content_block_start',
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ],
    ...text.map(
      (t) =>
        [
          'content_block_delta',
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
        ] as [string, unknown],
    ),
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ]);
}

const streamResponse = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });

describe('selectBackend', () => {
  it('uses the offline placeholder by default', async () => {
    const events = await run(selectBackend(DEFAULT_SETTINGS, EMPTY_SECRETS, memoryHistory()));
    expect(events.some((e) => e.type === 'text-delta')).toBe(true);
  }, 10_000);

  it('says what to set up when the chosen backend is incomplete', async () => {
    const claude = selectBackend(
      { ...DEFAULT_SETTINGS, backend: 'claude' },
      EMPTY_SECRETS,
      memoryHistory(),
    );
    expect(await run(claude)).toEqual([
      expect.objectContaining({ type: 'error', code: 'not_configured' }),
    ]);
    const endpoint = selectBackend(
      { ...DEFAULT_SETTINGS, backend: 'endpoint' },
      EMPTY_SECRETS,
      memoryHistory(),
    );
    expect((await run(endpoint))[0]).toMatchObject({ code: 'not_configured' });
  });
});

describe('endpoint backend', () => {
  it('posts the request with the auth header and relays the events', async () => {
    const fetch = vi.fn(async () =>
      streamResponse(
        'event: text-delta\ndata: {"text":"Hi from the endpoint"}\n\nevent: done\ndata: {}\n\n',
      ),
    );
    const events = await run(
      endpointBackend({ url: 'https://api.example/dci', authorization: 'Bearer t0k', fetch }),
    );
    expect(events).toEqual([
      { type: 'text-delta', text: 'Hi from the endpoint' },
      { type: 'done' },
    ]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example/dci');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer t0k');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body as string)).toMatchObject({ prompt: 'Who is this?' });
  });

  it('turns an HTTP failure into an error event', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 401 }));
    const events = await run(endpointBackend({ url: 'https://api.example/dci', fetch }));
    expect(events[0]).toMatchObject({ type: 'error', code: 'http_401' });
  });
});

describe('Claude backend', () => {
  it('streams the answer, sends the page and selection, and keeps the conversation', async () => {
    const fetch = vi.fn(async () => streamResponse(claudeStream(['Ada ', 'Lovelace.'])));
    const history = memoryHistory();
    const backend = claudeBackend({ apiKey: 'sk-test', model: 'claude-opus-5-5', history, fetch });
    const events = await collect(backend(request, new AbortController().signal));
    expect(events).toEqual([
      { type: 'text-delta', text: 'Ada ' },
      { type: 'text-delta', text: 'Lovelace.' },
    ]);

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-api-key')).toBe('sk-test');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      stream: true,
      output_config: { effort: 'medium' },
      fallbacks: 'default',
    });
    const turn = body.messages[0].content as string;
    expect(turn).toContain('URL: https://shop.example/orders');
    expect(turn).toContain('<selected_context>');
    expect(turn).toContain('Ada');
    expect(turn.endsWith('Who is this?')).toBe(true);

    // The assistant turn is stored exactly as received, for follow-ups.
    expect(history.data.get('s1')).toMatchObject([
      { role: 'user', content: turn },
      { role: 'assistant', content: [{ type: 'text', text: 'Ada Lovelace.' }] },
    ]);
  });

  it('reports a rejected key as an error event', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'error',
            error: { type: 'authentication_error', message: 'invalid x-api-key' },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
    );
    const backend = claudeBackend({
      apiKey: 'bad',
      model: 'claude-opus-5-5',
      history: memoryHistory(),
      fetch,
    });
    const events = await collect(backend(request, new AbortController().signal));
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'auth' })]);
  });

  it('says so when Claude declines', async () => {
    const fetch = vi.fn(async () => streamResponse(claudeStream([], 'refusal')));
    const backend = claudeBackend({
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5',
      history: memoryHistory(),
      fetch,
    });
    const events = await collect(backend(request, new AbortController().signal));
    expect(events).toEqual([{ type: 'text-delta', text: '\n\nI can’t help with that request.' }]);
    // Haiku doesn't take fallbacks.
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('fallbacks');
  });
});
