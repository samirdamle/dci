import type { DciEvent, DciRequest, Transport } from '@dci/core';
import { useSyncExternalStore } from 'react';

export interface ExchangeLog {
  request: DciRequest;
  events: DciEvent[];
  /** Still streaming. */
  open: boolean;
}

let last: ExchangeLog | null = null;
const listeners = new Set<() => void>();
const publish = (next: ExchangeLog) => {
  last = next;
  listeners.forEach((fn) => fn());
};

/** Wrap a transport to record the last request and its raw events (for the inspector). */
export function withEventLog(transport: Transport): Transport {
  return {
    async *send(request, options) {
      let log: ExchangeLog = { request, events: [], open: true };
      publish(log);
      try {
        for await (const event of transport.send(request, options)) {
          log = { ...log, events: [...log.events, event] };
          publish(log);
          yield event;
        }
      } finally {
        publish({ ...log, open: false });
      }
    },
  };
}

export function useLastExchange(): ExchangeLog | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => last,
    () => null,
  );
}
