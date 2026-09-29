import { describe, expect, it } from 'vitest';
import {
  createSSEDecoder,
  decodeSSEStream,
  encodeComment,
  encodeEvent,
  type DciEvent,
} from '../src/index';

const bytes = (s: string) => new TextEncoder().encode(s);

/** Deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const TEXTS = [
  'hello',
  'naïve café',
  'emoji 🎉🚀 ok',
  '日本語テキスト',
  'line\nbreak',
  '"quoted" \\ back',
  '',
];

function randomEvent(r: () => number): DciEvent {
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  switch (Math.floor(r() * 7)) {
    case 0:
      return { type: 'text-delta', text: pick(TEXTS) };
    case 1:
      return {
        type: 'tool-start',
        id: `t${Math.floor(r() * 99)}`,
        name: 'update_invoice',
        label: pick(TEXTS),
      };
    case 2:
      return { type: 'tool-end', id: 't1', ok: r() > 0.5 };
    case 3:
      return { type: 'client-action', name: 'highlight', args: { ids: ['inv_1', pick(TEXTS)] } };
    case 4:
      return { type: 'error', message: pick(TEXTS), code: 'x' };
    case 5:
      return { type: 'x-usage', tokens: Math.floor(r() * 1000), note: pick(TEXTS) };
    default:
      return { type: 'done' };
  }
}

function decodeInChunks(input: Uint8Array, cuts: number[]): DciEvent[] {
  const decoder = createSSEDecoder();
  const out: DciEvent[] = [];
  let prev = 0;
  for (const cut of [...cuts, input.length]) {
    out.push(...decoder.push(input.subarray(prev, cut)));
    prev = cut;
  }
  return [...out, ...decoder.end()];
}

describe('SSE round trip', () => {
  it('decodes exactly what was encoded, split at random byte offsets', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const events = Array.from({ length: 1 + Math.floor(r() * 8) }, () => randomEvent(r));
      const input = bytes(events.map(encodeEvent).join(''));
      const cuts = Array.from({ length: Math.floor(r() * 12) }, () =>
        Math.floor(r() * input.length),
      ).sort((a, b) => a - b);
      expect(decodeInChunks(input, cuts), `seed ${seed}`).toEqual(events);
    }
  });

  it('survives one byte at a time', () => {
    const events: DciEvent[] = [{ type: 'text-delta', text: 'Hé 🎉' }, { type: 'done' }];
    const input = bytes(events.map(encodeEvent).join(''));
    const cuts = Array.from({ length: input.length - 1 }, (_, i) => i + 1);
    expect(decodeInChunks(input, cuts)).toEqual(events);
  });
});

describe('encodeEvent', () => {
  it('writes the event name and JSON payload without the type', () => {
    expect(encodeEvent({ type: 'text-delta', text: 'hi' })).toBe(
      'event: text-delta\ndata: {"text":"hi"}\n\n',
    );
    expect(encodeEvent({ type: 'done' })).toBe('event: done\ndata: {}\n\n');
    expect(encodeComment()).toBe(': ping\n\n');
  });
});

describe('createSSEDecoder fixtures', () => {
  const decode = (...chunks: Array<string | Uint8Array>) => {
    const d = createSSEDecoder();
    return [...chunks.flatMap((c) => d.push(c)), ...d.end()];
  };

  it('handles CRLF and bare CR line endings, including CR/LF split across chunks', () => {
    expect(decode('event: text-delta\r\ndata: {"text":"a"}\r\n\r\n')).toEqual([
      { type: 'text-delta', text: 'a' },
    ]);
    expect(decode('event: done\rdata: {}\r\r')).toEqual([{ type: 'done' }]);
    expect(decode('event: done\r', '\ndata: {}\r', '\n\r', '\n')).toEqual([{ type: 'done' }]);
  });

  it('ignores comments and keep-alive pings', () => {
    expect(decode(': ping\n\n', ':\n', 'event: done\n: mid-event comment\ndata: {}\n\n')).toEqual([
      { type: 'done' },
    ]);
  });

  it('joins multi-line data', () => {
    expect(decode('event: text-delta\ndata: {"text":\ndata: "multi"}\n\n')).toEqual([
      { type: 'text-delta', text: 'multi' },
    ]);
  });

  it('accepts fields without a space after the colon and fields without a value', () => {
    expect(decode('event:done\ndata:{}\nid\nretry: 5\n\n')).toEqual([{ type: 'done' }]);
  });

  it('skips unknown events, unnamed events and malformed payloads', () => {
    expect(
      decode(
        'event: future-thing\ndata: {"a":1}\n\n',
        'data: {"text":"no event name"}\n\n',
        'event: text-delta\ndata: not json\n\n',
        'event: text-delta\ndata: {"text":5}\n\n',
        'event: tool-start\ndata: {"id":"t"}\n\n',
        'event: tool-end\ndata: {"id":"t"}\n\n',
        'event: client-action\ndata: {"args":{}}\n\n',
        'event: error\ndata: {"code":"x"}\n\n',
        'event: done\n\n',
        'event: done\ndata: {}\n\n',
      ),
    ).toEqual([{ type: 'done' }]);
  });

  it('fills defaults and drops unknown optional fields', () => {
    expect(
      decode(
        'event: client-action\ndata: {"name":"scrollTo","args":"bad"}\n\n',
        'event: tool-start\ndata: {"id":"t","name":"n","label":7}\n\n',
        'event: error\ndata: {"message":"m","code":3}\n\n',
        'event: tool-end\ndata: {"id":"t","ok":true,"label":"Saved"}\n\n',
      ),
    ).toEqual([
      { type: 'client-action', name: 'scrollTo', args: {} },
      { type: 'tool-start', id: 't', name: 'n' },
      { type: 'error', message: 'm' },
      { type: 'tool-end', id: 't', ok: true, label: 'Saved' },
    ]);
  });

  it('passes custom x- events through, including non-object payloads', () => {
    expect(decode('event: x-usage\ndata: {"tokens":42}\n\n', 'event: x-raw\ndata: 7\n\n')).toEqual([
      { type: 'x-usage', tokens: 42 },
      { type: 'x-raw' },
    ]);
  });

  it('decodes a multi-byte emoji split across chunks', () => {
    const input = bytes('event: text-delta\ndata: {"text":"🎉"}\n\n');
    const at = new TextDecoder().decode(input).indexOf('🎉');
    const split = bytes('event: text-delta\ndata: {"text":"').length + 2; // inside the emoji
    expect(at).toBeGreaterThan(0);
    expect(decode(input.subarray(0, split), input.subarray(split))).toEqual([
      { type: 'text-delta', text: '🎉' },
    ]);
  });

  it('dispatches a final event that has no trailing blank line', () => {
    expect(decode('event: done\ndata: {}')).toEqual([{ type: 'done' }]);
    expect(decode('event: done\ndata: {}\r')).toEqual([{ type: 'done' }]);
  });
});

describe('decodeSSEStream', () => {
  it('yields events from a ReadableStream of bytes', async () => {
    const payload = bytes(
      encodeEvent({ type: 'text-delta', text: 'hi 🎉' }) + encodeEvent({ type: 'done' }),
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload.subarray(0, 25));
        controller.enqueue(payload.subarray(25));
        controller.close();
      },
    });
    const events: DciEvent[] = [];
    for await (const e of decodeSSEStream(stream)) events.push(e);
    expect(events).toEqual([{ type: 'text-delta', text: 'hi 🎉' }, { type: 'done' }]);
  });
});
