import {
  encodeEvent,
  type DciContextNode,
  type DciEvent,
  type DciRequest,
} from '@samirdamle/dci-protocol';
import { createSSEDecoder } from '@samirdamle/dci-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDciStream,
  dciHandler,
  DciRequestError,
  formatContextForPrompt,
  parseDciRequest,
  SSE_HEADERS,
} from '../src/index';

const valid: DciRequest = {
  v: 1,
  sessionId: 's1',
  prompt: 'Why is this overdue?',
  context: [],
  page: { url: 'https://x.test/', title: 'X' },
};

const post = (body: unknown, init: RequestInit = {}) =>
  new Request('https://x.test/api/dci', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

async function events(response: Response): Promise<DciEvent[]> {
  const decoder = createSSEDecoder();
  const text = await response.text();
  return [...decoder.push(text), ...decoder.end()];
}

afterEach(() => {
  vi.useRealTimers();
});

describe('parseDciRequest', () => {
  it('returns a valid request', async () => {
    await expect(parseDciRequest(post(valid))).resolves.toEqual(valid);
  });

  it.each([
    ['non-POST', new Request('https://x.test/', { method: 'GET' }), 405, 'method_not_allowed'],
    [
      'non-JSON',
      post(valid, { headers: { 'Content-Type': 'text/plain' } }),
      415,
      'unsupported_media_type',
    ],
    ['invalid JSON', post('{nope'), 400, 'bad_request'],
    ['invalid fields', post({ ...valid, prompt: 1 }), 400, 'bad_request'],
    ['unknown version', post({ ...valid, v: 2 }), 400, 'unsupported_version'],
  ])('rejects %s', async (_name, request, status, code) => {
    const err = await parseDciRequest(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DciRequestError);
    expect(err).toMatchObject({ status, code });
  });

  it('lists validation issues', async () => {
    const err = (await parseDciRequest(post({ ...valid, prompt: 1 })).catch(
      (e: unknown) => e,
    )) as DciRequestError;
    expect(err.issues).toEqual(['prompt must be a string']);
  });
});

describe('createDciStream', () => {
  it('sets SSE headers and streams helper events', async () => {
    const stream = createDciStream({ pingIntervalMs: 0 });
    expect(Object.fromEntries(stream.response.headers)).toMatchObject({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    });
    expect(SSE_HEADERS['X-Accel-Buffering']).toBe('no');
    stream.text('Hi');
    stream.toolStart('t1', 'update_invoice', 'Updating invoice…');
    stream.toolEnd('t1', true);
    stream.clientAction('highlight', { ids: ['inv_1'] });
    stream.clientAction('refresh');
    stream.error('careful', 'warn');
    stream.done();
    stream.text('ignored after done');
    stream.done();
    expect(stream.closed).toBe(true);
    expect(await events(stream.response)).toEqual([
      { type: 'text-delta', text: 'Hi' },
      { type: 'tool-start', id: 't1', name: 'update_invoice', label: 'Updating invoice…' },
      { type: 'tool-end', id: 't1', ok: true },
      { type: 'client-action', name: 'highlight', args: { ids: ['inv_1'] } },
      { type: 'client-action', name: 'refresh', args: {} },
      { type: 'error', message: 'careful', code: 'warn' },
      { type: 'done' },
    ]);
  });

  it('sends keep-alive pings on an interval', async () => {
    vi.useFakeTimers();
    const stream = createDciStream({ pingIntervalMs: 15_000 });
    vi.advanceTimersByTime(45_000);
    stream.done();
    const text = await stream.response.text();
    expect(text.match(/^: ping$/gm)).toHaveLength(3);
    vi.advanceTimersByTime(60_000);
  });

  it('stops and calls onAbort when the client disconnects', async () => {
    const onAbort = vi.fn();
    const stream = createDciStream({ pingIntervalMs: 0, onAbort });
    await stream.response.body!.cancel();
    expect(onAbort).toHaveBeenCalledOnce();
    expect(stream.closed).toBe(true);
    stream.text('ignored');
  });

  it('stops when its signal aborts, including an already-aborted signal', () => {
    const controller = new AbortController();
    const onAbort = vi.fn();
    const stream = createDciStream({ pingIntervalMs: 0, signal: controller.signal, onAbort });
    controller.abort();
    controller.abort();
    expect(stream.closed).toBe(true);
    expect(onAbort).toHaveBeenCalledOnce();

    const aborted = AbortSignal.abort();
    expect(createDciStream({ pingIntervalMs: 0, signal: aborted }).closed).toBe(true);
  });
});

describe('dciHandler', () => {
  it('streams what the handler sends and finishes with done', async () => {
    const handler = dciHandler(async (req, stream) => {
      stream.text(`You asked: ${req.prompt}`);
    });
    const response = await handler(post(valid));
    expect(response.status).toBe(200);
    expect(await events(response)).toEqual([
      { type: 'text-delta', text: 'You asked: Why is this overdue?' },
      { type: 'done' },
    ]);
  });

  it('guarantees error + done when the handler throws', async () => {
    const handler = dciHandler(async (_req, stream) => {
      stream.text('partial');
      throw new Error('LLM exploded');
    });
    expect(await events(await handler(post(valid)))).toEqual([
      { type: 'text-delta', text: 'partial' },
      { type: 'error', message: 'LLM exploded', code: 'handler_error' },
      { type: 'done' },
    ]);
    const sync = dciHandler(() => {
      throw 'plain string';
    });
    expect(await events(await sync(post(valid)))).toEqual([
      { type: 'error', message: 'plain string', code: 'handler_error' },
      { type: 'done' },
    ]);
  });

  it('answers invalid requests with JSON errors', async () => {
    const response = await dciHandler(() => {})(post({ ...valid, sessionId: '' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid DCI request',
      code: 'bad_request',
      issues: ['sessionId must be a non-empty string'],
    });
  });

  it('answers an unknown version with an in-protocol error event', async () => {
    const fn = vi.fn();
    const response = await dciHandler(fn)(post({ ...valid, v: 9 }));
    expect(fn).not.toHaveBeenCalled();
    expect(await events(response)).toEqual([
      {
        type: 'error',
        message: 'Unsupported protocol version 9 (server speaks 1)',
        code: 'unsupported_version',
      },
      { type: 'done' },
    ]);
  });

  it('rethrows errors that are not request errors', async () => {
    const weird = post(valid);
    Object.defineProperty(weird, 'method', {
      get: () => {
        throw new RangeError('odd');
      },
    });
    await expect(dciHandler(() => {})(weird)).rejects.toThrow(RangeError);
  });

  it('propagates client aborts to the handler signal', async () => {
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    let release!: () => void;
    const handler = dciHandler(
      (_req, stream, ctx) =>
        new Promise<void>((resolve) => {
          signal = ctx.signal;
          release = resolve;
          stream.text('working');
        }),
    );
    const request = post(valid, { signal: controller.signal });
    const response = await handler(request);
    await response.body!.cancel();
    expect(signal?.aborted).toBe(true);
    release();
  });
});

describe('formatContextForPrompt', () => {
  const context: DciContextNode[] = [
    {
      id: 'inv_123',
      type: 'invoice',
      label: 'Invoice #123 <Acme & Co>',
      data: { amount: 420, status: 'overdue' },
      ancestors: [
        { id: 'dash', type: 'page', label: 'Dashboard' },
        { private: true },
        { id: 'invoices', type: 'table' },
      ],
      source: 'annotated',
    },
    { id: 'plain', data: {}, source: 'annotated' },
    {
      data: {},
      source: 'fallback',
      fallback: { tagName: 'td', text: 'Acme Corp', path: 'main > td' },
    },
    { type: 'cell', data: {}, source: 'annotated', ancestors: [{}] },
  ];

  it('formats XML by default', () => {
    expect(formatContextForPrompt(context)).toMatchInlineSnapshot(`
      "<selected_context>
        <node index="1" type="invoice" id="inv_123" source="annotated">
          <label>Invoice #123 &lt;Acme &amp; Co&gt;</label>
          <path>Dashboard › (private) › invoices › Invoice #123 &lt;Acme &amp; Co&gt;</path>
          <data>{"amount":420,"status":"overdue"}</data>
        </node>
        <node index="2" id="plain" source="annotated" />
        <node index="3" source="fallback">
          <element>{"tagName":"td","text":"Acme Corp","path":"main &gt; td"}</element>
        </node>
        <node index="4" type="cell" source="annotated">
          <path>(unnamed) › cell</path>
        </node>
      </selected_context>"
    `);
  });

  it('formats markdown', () => {
    expect(formatContextForPrompt(context, { style: 'markdown' })).toMatchInlineSnapshot(`
      "## Selected context

      1. **Invoice #123 <Acme & Co>** (invoice, id \`inv_123\`)
         - Path: Dashboard › (private) › invoices › Invoice #123 <Acme & Co>
         - Data: \`{"amount":420,"status":"overdue"}\`
      2. **plain** (id \`plain\`)
      3. **<td>**
         - Element: \`{"tagName":"td","text":"Acme Corp","path":"main > td"}\`
      4. **cell** (cell)
         - Path: (unnamed) › cell"
    `);
  });

  it('formats JSON', () => {
    expect(JSON.parse(formatContextForPrompt(context, { style: 'json' }))).toEqual(context);
    expect(formatContextForPrompt([], { style: 'json' })).toBe('[]');
  });
});

describe('encodeEvent compatibility', () => {
  it('matches what the stream writes', async () => {
    const stream = createDciStream({ pingIntervalMs: 0 });
    stream.done();
    expect(await stream.response.text()).toBe(encodeEvent({ type: 'done' }));
  });
});
