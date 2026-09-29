import type { DciEvent } from './types';
import { toEvent } from './validate';

/** Serialize one event as an SSE message: `event: <type>\ndata: <json>\n\n`. */
export function encodeEvent(event: DciEvent): string {
  const { type, ...data } = event;
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** An SSE comment line, used as a keep-alive ping. */
export const encodeComment = (text = 'ping'): string => `: ${text}\n\n`;

export interface SSEDecoder {
  /** Feed bytes or text; returns the events completed by this chunk. */
  push(chunk: Uint8Array | string): DciEvent[];
  /** Finish the stream; returns any event completed by the end of input. */
  end(): DciEvent[];
}

/**
 * Incremental SSE decoder. Chunks may split anywhere, including inside a
 * multi-byte UTF-8 character or between `\r` and `\n`. Handles CR, LF and
 * CRLF line endings, comment lines, multi-line `data:` and keep-alive pings.
 * Unknown or malformed events are skipped.
 */
export function createSSEDecoder(): SSEDecoder {
  const utf8 = new TextDecoder();
  let buffer = '';
  let eventType = '';
  let data: string[] = [];

  function dispatch(out: DciEvent[]) {
    if (data.length) {
      const type = eventType || 'message';
      let payload: unknown;
      try {
        payload = JSON.parse(data.join('\n'));
      } catch {
        payload = undefined;
      }
      const event = payload === undefined ? null : toEvent(type, payload);
      if (event) out.push(event);
    }
    eventType = '';
    data = [];
  }

  function line(text: string, out: DciEvent[]) {
    if (text === '') return dispatch(out);
    if (text.startsWith(':')) return; // comment / ping
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventType = value;
    else if (field === 'data') data.push(value);
    // `id` and `retry` are not used by DCI.
  }

  function drain(final: boolean): DciEvent[] {
    const out: DciEvent[] = [];
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (ch !== '\n' && ch !== '\r') continue;
      // A trailing '\r' may be the first half of '\r\n'; wait for more input.
      if (ch === '\r' && i === buffer.length - 1 && !final) break;
      line(buffer.slice(start, i), out);
      if (ch === '\r' && buffer[i + 1] === '\n') i++;
      start = i + 1;
    }
    buffer = buffer.slice(start);
    if (final) {
      if (buffer) line(buffer, out);
      buffer = '';
      dispatch(out);
    }
    return out;
  }

  return {
    push(chunk) {
      buffer += typeof chunk === 'string' ? chunk : utf8.decode(chunk, { stream: true });
      return drain(false);
    },
    end() {
      buffer += utf8.decode();
      return drain(true);
    },
  };
}

/** Decode a byte stream (e.g. `response.body`) into DCI events. */
export async function* decodeSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<DciEvent, void, undefined> {
  const decoder = createSSEDecoder();
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* decoder.push(value);
    }
    yield* decoder.end();
  } finally {
    reader.releaseLock();
  }
}
