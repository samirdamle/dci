import type { PortLike } from '../src/transport';
import type { WorkerPort } from '../src/worker';

type Listener<T> = (value: T) => void;

function channel<T>() {
  const listeners: Array<Listener<T>> = [];
  return {
    addListener: (fn: Listener<T>) => void listeners.push(fn),
    emit: (value: T) => listeners.forEach((fn) => fn(value)),
  };
}

/**
 * Two connected fake runtime ports, like `chrome.runtime.connect` gives the
 * content script and `onConnect` gives the worker. Messages are delivered
 * asynchronously and structured-cloned, as in a browser.
 */
export function portPair() {
  const toWorker = channel<never>();
  const toContent = channel<never>();
  const workerGone = channel<void>();
  const contentGone = channel<void>();
  let open = true;
  const close = (notify: { emit: (v: void) => void }) => {
    if (!open) return;
    open = false;
    queueMicrotask(() => notify.emit());
  };
  const content: PortLike = {
    postMessage: (m) => open && queueMicrotask(() => toWorker.emit(structuredClone(m) as never)),
    disconnect: () => close(contentGone),
    onMessage: { addListener: (fn) => toContent.addListener(fn as Listener<never>) },
    onDisconnect: { addListener: (fn) => workerGone.addListener(fn) },
  };
  const worker: WorkerPort = {
    postMessage: (m) => open && queueMicrotask(() => toContent.emit(structuredClone(m) as never)),
    disconnect: () => close(workerGone),
    onMessage: { addListener: (fn) => toWorker.addListener(fn as Listener<never>) },
    onDisconnect: { addListener: (fn) => contentGone.addListener(fn) },
  };
  return { content, worker, isOpen: () => open };
}
