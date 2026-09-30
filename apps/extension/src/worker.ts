import type { DciEvent } from '@samirdamle/dci-protocol';
import type { Backend } from './backends/types';
import type { EventMessage, RequestMessage } from './messages';

/** The part of `chrome.runtime.Port` the worker uses (a fake in tests). */
export interface WorkerPort {
  postMessage(message: EventMessage): void;
  disconnect(): void;
  onMessage: { addListener(fn: (message: RequestMessage) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Answer the request on one port: run the backend, post its events, and always
 * finish with `done` (after an `error` event if the backend throws). The
 * content script disconnecting (Stop, navigation) aborts the backend.
 */
export function serve(port: WorkerPort, backend: Backend): void {
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  const post = (event: DciEvent) => {
    if (!controller.signal.aborted) port.postMessage({ type: 'event', event });
  };

  port.onMessage.addListener(async (message) => {
    if (message.type !== 'request') return;
    try {
      for await (const event of backend(message.request, controller.signal)) {
        if (controller.signal.aborted) return;
        if (event.type === 'done') break;
        post(event);
      }
    } catch (err) {
      post({ type: 'error', message: errorMessage(err), code: 'handler_error' });
    }
    post({ type: 'done' });
  });
}
