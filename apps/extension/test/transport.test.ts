import type { DciEvent, DciRequest } from '@samirdamle/dci-protocol';
import { describe, expect, it } from 'vitest';
import { offlineBackend } from '../src/backends/offline';
import type { Backend } from '../src/backends/types';
import { portTransport } from '../src/transport';
import { serve } from '../src/worker';
import { portPair } from './ports';

const request: DciRequest = {
  v: 1,
  sessionId: 's1',
  prompt: 'What is this?',
  context: [{ data: {}, source: 'annotated', id: 'inv_1', label: 'Invoice 1' }],
  page: { url: 'https://example.com/', title: 'Example' },
};

/** A transport wired to a worker running `backend`, over fake ports. */
function setup(backend: Backend) {
  const ports = portPair();
  serve(ports.worker, backend);
  return { transport: portTransport(() => ports.content), ports };
}

async function collect(events: AsyncIterable<DciEvent>) {
  const out: DciEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const text = (events: DciEvent[]) =>
  events.map((e) => (e.type === 'text-delta' ? e.text : '')).join('');

describe('port transport + worker', () => {
  it('streams the offline answer and ends with done', async () => {
    const { transport } = setup(offlineBackend({ delayMs: 0 }));
    const events = await collect(transport.send(request, { signal: new AbortController().signal }));
    expect(text(events)).toContain('Context (1 selected item) and prompt passed on to model.');
    expect(text(events)).toContain('Analysis of the context sent back from model.');
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('turns a backend failure into an error event, then done', async () => {
    const { transport } = setup(async function* () {
      yield { type: 'text-delta', text: 'Partial' };
      throw new Error('Rate limited');
    });
    const events = await collect(transport.send(request, { signal: new AbortController().signal }));
    expect(events).toEqual([
      { type: 'text-delta', text: 'Partial' },
      { type: 'error', message: 'Rate limited', code: 'handler_error' },
      { type: 'done' },
    ]);
  });

  it('sends a single done even when the backend sends its own', async () => {
    const { transport } = setup(async function* () {
      yield { type: 'text-delta', text: 'Hi' };
      yield { type: 'done' };
    });
    const events = await collect(transport.send(request, { signal: new AbortController().signal }));
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
  });

  it('Stop disconnects the port and aborts the backend', async () => {
    let backendSignal: AbortSignal | undefined;
    const { transport, ports } = setup(async function* (_req, signal) {
      backendSignal = signal;
      yield { type: 'text-delta', text: 'First' };
      await new Promise((resolve) => signal.addEventListener('abort', resolve));
    });
    const controller = new AbortController();
    const seen: DciEvent[] = [];
    for await (const event of transport.send(request, { signal: controller.signal })) {
      seen.push(event);
      controller.abort();
    }
    expect(seen).toEqual([{ type: 'text-delta', text: 'First' }]);
    expect(ports.isOpen()).toBe(false);
    await Promise.resolve();
    expect(backendSignal?.aborted).toBe(true);
  });

  it('fails clearly if the worker goes away mid-answer', async () => {
    const ports = portPair();
    ports.worker.onMessage.addListener(() => {
      ports.worker.postMessage({ type: 'event', event: { type: 'text-delta', text: 'Hi' } });
      ports.worker.disconnect();
    });
    const transport = portTransport(() => ports.content);
    const seen: DciEvent[] = [];
    await expect(async () => {
      for await (const e of transport.send(request, { signal: new AbortController().signal }))
        seen.push(e);
    }).rejects.toThrow('stopped responding');
    expect(seen).toEqual([{ type: 'text-delta', text: 'Hi' }]);
  });
});
