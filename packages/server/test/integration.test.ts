import { createSSETransport } from '@dci/core';
import type { DciEvent, DciRequest } from '@dci/protocol';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dciHandler, formatContextForPrompt } from '../src/index';
import { toNodeHandler } from '../src/node';

let server: Server;
let endpoint: string;
let aborted: Promise<void>;
let resolveAborted: () => void;

beforeAll(async () => {
  aborted = new Promise((r) => (resolveAborted = r));
  const handler = dciHandler(async (req, stream, { signal }) => {
    if (req.prompt === 'hang') {
      stream.text('thinking…');
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      resolveAborted();
      return;
    }
    stream.toolStart('t1', 'lookup', 'Looking up invoice…');
    stream.toolEnd('t1', true);
    stream.text(`Context:\n${formatContextForPrompt(req.context)}\n`);
    for (const word of ['It', ' is', ' overdue', ' 🎉']) stream.text(word);
    stream.clientAction('highlight', { ids: req.context.map((n) => n.id) });
  });
  server = createServer(toNodeHandler(handler));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/dci`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const request = (prompt: string): DciRequest => ({
  v: 1,
  sessionId: 'session-1',
  prompt,
  context: [
    { id: 'inv_1', type: 'invoice', label: 'Invoice 1', data: { amount: 5 }, source: 'annotated' },
  ],
  page: { url: 'http://localhost/', title: 'Test' },
});

describe('core transport ↔ @dci/server over Node http', () => {
  it('round-trips a request and streams every event type', async () => {
    const transport = createSSETransport({
      endpoint,
      headers: () => ({ Authorization: 'Bearer x' }),
    });
    const events: DciEvent[] = [];
    for await (const e of transport.send(request('why?'), {
      signal: new AbortController().signal,
    })) {
      events.push(e);
    }
    expect(events[0]).toEqual({
      type: 'tool-start',
      id: 't1',
      name: 'lookup',
      label: 'Looking up invoice…',
    });
    expect(events[1]).toEqual({ type: 'tool-end', id: 't1', ok: true });
    const text = events
      .filter((e) => e.type === 'text-delta')
      .map((e) => (e as { text: string }).text)
      .join('');
    expect(text).toContain('<node index="1" type="invoice" id="inv_1" source="annotated">');
    expect(text.endsWith('It is overdue 🎉')).toBe(true);
    expect(events.at(-2)).toEqual({
      type: 'client-action',
      name: 'highlight',
      args: { ids: ['inv_1'] },
    });
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('returns HTTP errors for invalid requests as error events', async () => {
    const transport = createSSETransport({ endpoint });
    const bad = { ...request('x'), sessionId: '' };
    const events: DciEvent[] = [];
    for await (const e of transport.send(bad, { signal: new AbortController().signal }))
      events.push(e);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', code: 'http_400' });
  });

  it('propagates a client abort to the server handler', async () => {
    const controller = new AbortController();
    const transport = createSSETransport({ endpoint });
    const events: DciEvent[] = [];
    for await (const e of transport.send(request('hang'), { signal: controller.signal })) {
      events.push(e);
      controller.abort();
    }
    await aborted;
    expect(events).toEqual([{ type: 'text-delta', text: 'thinking…' }]);
  });
});
