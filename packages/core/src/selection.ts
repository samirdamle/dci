import { toContextNode, type ContextOptions, type DciContextNode } from './context';

export interface SelectionOptions extends ContextOptions {
  /** Maximum number of selected nodes. Default `50`. */
  maxSelection?: number;
}

export interface SelectionChange {
  /** The full selection, in selection order. */
  elements: Element[];
  added: Element[];
  removed: Element[];
  primary: Element | null;
}

export interface SelectionLimit {
  /** How many elements were rejected since the last event. */
  dropped: number;
  max: number;
}

export interface SelectionEvents {
  selectionchange: SelectionChange;
  selectionlimit: SelectionLimit;
}

type Listener<T> = (event: T) => void;

export interface SelectionStore {
  /** Selected elements, in selection order. */
  get(): Element[];
  /** Replace the selection. */
  set(els: Iterable<Element>): void;
  /** Append, skipping elements already selected. */
  add(els: Iterable<Element> | Element): void;
  remove(els: Iterable<Element> | Element): void;
  /** Add `el` if absent, otherwise remove it. */
  toggle(el: Element): void;
  clear(): void;
  has(el: Element): boolean;
  /** Last-interacted node (breadcrumb, keyboard navigation), or `null`. */
  primary(): Element | null;
  /** Make an already-selected element the primary node. */
  setPrimary(el: Element): void;
  /** Listen for `selectionchange`; returns an unsubscribe function. */
  subscribe(fn: Listener<SelectionChange>): () => void;
  on<K extends keyof SelectionEvents>(type: K, fn: Listener<SelectionEvents[K]>): () => void;
  /** The selection as backend payloads (private/unsupported nodes dropped). */
  toContext(): DciContextNode[];
  /** Stop observing the DOM and drop all listeners. */
  destroy(): void;
}

const last = (els: Element[]): Element | null => els[els.length - 1] ?? null;

const toArray = (els: Iterable<Element> | Element) =>
  els instanceof Element ? [els] : Array.from(els);

/**
 * Framework-agnostic selection store. State updates synchronously; change
 * events are batched per microtask, so a burst of mutations (e.g. a window
 * select) emits a single `selectionchange`.
 */
export function createSelectionStore(options: SelectionOptions = {}): SelectionStore {
  const max = options.maxSelection ?? 50;
  const listeners: { [K in keyof SelectionEvents]: Set<Listener<SelectionEvents[K]>> } = {
    selectionchange: new Set(),
    selectionlimit: new Set(),
  };

  let selected: Element[] = [];
  let primaryEl: Element | null = null;
  let emitted: Element[] = [];
  let emittedPrimary: Element | null = null;
  let dropped = 0;
  let scheduled = false;
  let observer: MutationObserver | null = null;
  let destroyed = false;

  function emit<K extends keyof SelectionEvents>(type: K, event: SelectionEvents[K]) {
    for (const fn of listeners[type]) fn(event);
  }

  function flush() {
    scheduled = false;
    if (dropped) {
      emit('selectionlimit', { dropped, max });
      dropped = 0;
    }
    const before = new Set(emitted);
    const after = new Set(selected);
    const added = selected.filter((el) => !before.has(el));
    const removed = emitted.filter((el) => !after.has(el));
    if (!added.length && !removed.length && primaryEl === emittedPrimary) return;
    emitted = selected.slice();
    emittedPrimary = primaryEl;
    emit('selectionchange', { elements: selected.slice(), added, removed, primary: primaryEl });
  }

  function syncObserver() {
    if (selected.length && !observer && !destroyed) {
      observer = new MutationObserver(pruneDetached);
      observer.observe(options.root ?? document.body, { childList: true, subtree: true });
    } else if (!selected.length && observer) {
      observer.disconnect();
      observer = null;
    }
  }

  /** Apply a new selection and schedule one batched event. */
  function commit(next: Element[], nextPrimary: Element | null) {
    selected = next;
    primaryEl = nextPrimary && next.includes(nextPrimary) ? nextPrimary : last(next);
    syncObserver();
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  }

  function limit(els: Element[], room: number): Element[] {
    if (els.length <= room) return els;
    dropped += els.length - Math.max(room, 0);
    return els.slice(0, Math.max(room, 0));
  }

  function pruneDetached() {
    const live = selected.filter((el) => el.isConnected);
    if (live.length !== selected.length) commit(live, primaryEl);
  }

  function add(els: Iterable<Element> | Element) {
    const current = new Set(selected);
    const fresh = [...new Set(toArray(els))].filter((el) => !current.has(el));
    const accepted = limit(fresh, max - selected.length);
    if (!accepted.length && !dropped) return;
    commit([...selected, ...accepted], last(accepted) ?? primaryEl);
  }

  function remove(els: Iterable<Element> | Element) {
    const gone = new Set(toArray(els));
    const next = selected.filter((el) => !gone.has(el));
    if (next.length !== selected.length) commit(next, primaryEl);
  }

  return {
    get: () => selected.slice(),
    set(els) {
      const accepted = limit([...new Set(els)], max);
      commit(accepted, last(accepted));
    },
    add,
    remove,
    toggle(el) {
      if (selected.includes(el)) remove(el);
      else add(el);
    },
    clear() {
      if (selected.length) commit([], null);
    },
    has: (el) => selected.includes(el),
    primary: () => primaryEl,
    setPrimary(el) {
      if (el !== primaryEl && selected.includes(el)) commit(selected, el);
    },
    subscribe: (fn) => {
      listeners.selectionchange.add(fn);
      return () => listeners.selectionchange.delete(fn);
    },
    on(type, fn) {
      listeners[type].add(fn);
      return () => listeners[type].delete(fn);
    },
    toContext: () =>
      selected
        .map((el) => toContextNode(el, options))
        .filter((node): node is DciContextNode => node !== null),
    destroy() {
      destroyed = true;
      observer?.disconnect();
      observer = null;
      listeners.selectionchange.clear();
      listeners.selectionlimit.clear();
    },
  };
}
