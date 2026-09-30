import type { Transport } from '@samirdamle/dci-core';
import type { DciEvent } from '@samirdamle/dci-protocol';
import { ext } from './ext';
import { PORT_NAME, type EventMessage, type RequestMessage } from './messages';

/** The part of `chrome.runtime.Port` the transport uses (a fake in tests). */
export interface PortLike {
  postMessage(message: RequestMessage): void;
  disconnect(): void;
  onMessage: { addListener(fn: (message: EventMessage) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
}

/**
 * A DCI `Transport` for content scripts: each request opens a runtime port to
 * the extension's background worker, which calls the configured backend and
 * posts the events back. Keys and backend URLs never reach the page. Aborting
 * (the chat's Stop button) disconnects the port, which aborts the backend call.
 */
export function portTransport(
  connect: () => PortLike = () => ext().runtime.connect({ name: PORT_NAME }) as PortLike,
): Transport {
  return {
    async *send(request, { signal }) {
      const port = connect();
      const queue: DciEvent[] = [];
      let closed = false;
      let wake: (() => void) | null = null;
      const notify = () => {
        wake?.();
        wake = null;
      };
      port.onMessage.addListener((message) => {
        if (message.type !== 'event') return;
        queue.push(message.event);
        notify();
      });
      port.onDisconnect.addListener(() => {
        closed = true;
        notify();
      });
      const abort = () => {
        closed = true;
        port.disconnect();
        notify();
      };
      signal.addEventListener('abort', abort, { once: true });
      port.postMessage({ type: 'request', request });

      try {
        for (;;) {
          while (queue.length) {
            const event = queue.shift()!;
            yield event;
            if (event.type === 'done') return;
          }
          if (closed) {
            if (signal.aborted) return;
            throw new Error('The DCI extension stopped responding. Reload the page and try again.');
          }
          await new Promise<void>((resolve) => (wake = resolve));
        }
      } finally {
        signal.removeEventListener('abort', abort);
        if (!closed) port.disconnect();
      }
    },
  };
}
