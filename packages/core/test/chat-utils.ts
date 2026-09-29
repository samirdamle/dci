import type { DciEvent, DciRequest } from '@dci/protocol';
import type { Transport } from '../src/transport';

/** A transport that replays scripted events; `gate` pauses before the rest. */
export function fakeTransport(script: (req: DciRequest) => DciEvent[], gate?: Promise<void>) {
  const requests: DciRequest[] = [];
  const transport: Transport = {
    async *send(req, { signal }) {
      requests.push(req);
      const events = script(req);
      for (const [i, e] of events.entries()) {
        if (i === 1 && gate)
          await Promise.race([gate, new Promise((r) => signal.addEventListener('abort', r))]);
        if (signal.aborted) return;
        yield e;
      }
    },
  };
  return { transport, requests };
}

export const reply = (text: string): DciEvent[] => [
  { type: 'text-delta', text: text.slice(0, 2) },
  { type: 'text-delta', text: text.slice(2) },
  { type: 'done' },
];

export const tick = () => new Promise((r) => setTimeout(r, 0));
