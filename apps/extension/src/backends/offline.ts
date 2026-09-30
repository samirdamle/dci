import type { DciEvent } from '@samirdamle/dci-protocol';
import type { Backend } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The no-setup backend: streams a placeholder answer so the extension works out
 * of the box. Configure a DCI endpoint or Claude in the options to get real ones.
 */
export function offlineBackend({ delayMs = 25 } = {}): Backend {
  return async function* (request, signal): AsyncIterable<DciEvent> {
    const items = request.context.length;
    const replies = [
      `Context (${items} selected item${items === 1 ? '' : 's'}) and prompt passed on to model.\n\n`,
      'Analysis of the context sent back from model.\n\n',
      '_This is the offline placeholder. Choose a backend in the DCI extension options to get real answers._',
    ];
    for (const reply of replies) {
      for (const word of reply.split(/(\s+)/)) {
        if (signal.aborted) return;
        if (delayMs) await sleep(delayMs);
        yield { type: 'text-delta', text: word };
      }
    }
  };
}
