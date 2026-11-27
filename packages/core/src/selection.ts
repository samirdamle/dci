import { toContextNode, type ContextOptions, type DciContextNode } from './context';
import { formatMarker, type MarkerSeries } from './markers';
import { deserializeRange, serializeRange, type TextSelectionItem } from './text-selection';

export type { TextSelectionItem };

export interface SelectionOptions extends ContextOptions {
  /** Maximum number of selected nodes. Default `50`. */
  maxSelection?: number;
  /** Marker series for selected nodes, or `false` for none. Default `'letters'`. */
  markers?: MarkerSeries | false;
}

export interface SelectionChange {
  /** The full selection, in selection order. */
  elements: Element[];
  /** The selected text items, in selection order. */
  textItems: TextSelectionItem[];
  added: Element[];
  removed: Element[];
  /** Text items added since the previous event, in selection order. */
  addedText: TextSelectionItem[];
  /** Text items removed since the previous event, in selection order. */
  removedText: TextSelectionItem[];
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

/** One item of the unified selection: an element, or a captured text range. */
export type SelectionItem = Element | TextSelectionItem;

/** Whether a selection item is a text item. */
export const isTextItem = (item: SelectionItem): item is TextSelectionItem =>
  (item as TextSelectionItem).kind === 'text';

export interface SelectionStore {
  /** Selected elements, in selection order. */
  get(): Element[];
  /** Selected text items, in selection order. */
  textItems(): TextSelectionItem[];
  /** Every selected item (elements and text), in selection order. */
  items(): SelectionItem[];
  /** Replace the selection (elements and text). */
  set(els: Iterable<Element>): void;
  /** Append, skipping elements already selected. */
  add(els: Iterable<Element> | Element): void;
  remove(els: Iterable<Element> | Element): void;
  /** Add `el` if absent, otherwise remove it. */
  toggle(el: Element): void;
  /**
   * Append a captured text item, skipping an identical range. Returns `false`
   * when the range is already selected or the selection is full (the latter
   * fires `selectionlimit`, as for elements).
   */
  addText(item: TextSelectionItem): boolean;
  /** Remove a text item, matched by its range key. */
  removeText(item: TextSelectionItem): void;
  /** Whether a text item with the same range key is selected. */
  hasText(item: TextSelectionItem): boolean;
  clear(): void;
  has(el: Element): boolean;
  /** Last-interacted node (breadcrumb, keyboard navigation), or `null`. */
  primary(): Element | null;
  /**
   * The node's marker (`"A"`, `"B"`…): assigned in selection order, kept while
   * the node stays selected, restarted when the selection is replaced or
   * cleared. `null` when not selected or markers are off.
   */
  marker(el: Element): string | null;
  /** A text item's marker, assigned in the same order as element markers. */
  markerForText(item: TextSelectionItem): string | null;
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

/** Elements of an ordered selection, in order. */
const elementsOf = (items: SelectionItem[]): Element[] =>
  items.filter((i): i is Element => !isTextItem(i));
/** Text items of an ordered selection, in order. */
const textOf = (items: SelectionItem[]): TextSelectionItem[] => items.filter(isTextItem);

/** Marker-index key: the element itself, or a text item's range key. */
const markerKey = (item: SelectionItem): Element | string => (isTextItem(item) ? item.key : item);

/**
 * Framework-agnostic selection store. State updates synchronously; change
 * events are batched per microtask, so a burst of mutations (e.g. a window
 * select) emits a single `selectionchange`. Elements and text items share
 * one selection order and one marker series.
 */
export function createSelectionStore(options: SelectionOptions = {}): SelectionStore {
  const max = options.maxSelection ?? 50;
  const listeners: { [K in keyof SelectionEvents]: Set<Listener<SelectionEvents[K]>> } = {
    selectionchange: new Set(),
    selectionlimit: new Set(),
  };

  /** The selection, elements and text items in selection order. */
  let ordered: SelectionItem[] = [];
  let primaryEl: Element | null = null;
  let emitted: SelectionItem[] = [];
  let emittedPrimary: Element | null = null;
  let dropped = 0;
  let scheduled = false;
  let observer: MutationObserver | null = null;
  let destroyed = false;
  /** Each selected item's 0-based marker index; never reused within a selection. */
  const markerIndex = new Map<Element | string, number>();
  let nextMarker = 0;

  function emit<K extends keyof SelectionEvents>(type: K, event: SelectionEvents[K]) {
    for (const fn of listeners[type]) fn(event);
  }

  function scheduleFlush() {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  }

  function flush() {
    scheduled = false;
    if (dropped) {
      emit('selectionlimit', { dropped, max });
      dropped = 0;
    }
    const before = new Set(emitted);
    const after = new Set(ordered);
    const addedItems = ordered.filter((item) => !before.has(item));
    const removedItems = emitted.filter((item) => !after.has(item));
    if (!addedItems.length && !removedItems.length && primaryEl === emittedPrimary) return;
    emitted = ordered.slice();
    emittedPrimary = primaryEl;
    emit('selectionchange', {
      elements: elementsOf(ordered),
      textItems: textOf(ordered),
      added: elementsOf(addedItems),
      removed: elementsOf(removedItems),
      addedText: textOf(addedItems),
      removedText: textOf(removedItems),
      primary: primaryEl,
    });
  }

  function syncObserver() {
    if (ordered.length && !observer && !destroyed) {
      observer = new MutationObserver(pruneDetached);
      // `characterData` as well as `childList`: a text item must be pruned
      // when the words it captured are edited in place, not only when its
      // elements leave the DOM.
      observer.observe(options.root ?? document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    } else if (!ordered.length && observer) {
      observer.disconnect();
      observer = null;
    }
  }

  /** Apply a new selection and schedule one batched event. */
  function commit(next: SelectionItem[], nextPrimary: Element | null) {
    ordered = next;
    const keep = new Set(next.map(markerKey));
    for (const key of markerIndex.keys()) if (!keep.has(key)) markerIndex.delete(key);
    if (!next.length) nextMarker = 0;
    for (const item of next) {
      const key = markerKey(item);
      if (!markerIndex.has(key)) markerIndex.set(key, nextMarker++);
    }
    const els = elementsOf(next);
    primaryEl = nextPrimary && next.includes(nextPrimary) ? nextPrimary : last(els);
    syncObserver();
    scheduleFlush();
  }

  function limit<T>(items: T[], room: number): T[] {
    if (items.length <= room) return items;
    dropped += items.length - Math.max(room, 0);
    return items.slice(0, Math.max(room, 0));
  }

  /** Whether a text item's range still resolves to the text it captured. */
  function textItemLive(item: TextSelectionItem): boolean {
    if (!item.range.startContainer.isConnected || !item.range.endContainer.isConnected)
      return false;
    const serialized = serializeRange(item.range, options);
    if (!serialized) return false;
    if (!deserializeRange(serialized, options.root ?? document.body)) return false;
    // The range resolves; the text it now covers must still be the captured
    // text (a capped excerpt only needs to be a prefix of it).
    const stored = item.node.text;
    if (!stored) return false;
    return stored.truncated
      ? serialized.excerpt.startsWith(stored.excerpt)
      : serialized.excerpt === stored.excerpt;
  }

  function pruneDetached() {
    const live = ordered.filter((item) =>
      isTextItem(item) ? textItemLive(item) : item.isConnected,
    );
    if (live.length !== ordered.length) commit(live, primaryEl);
  }

  function add(els: Iterable<Element> | Element) {
    const current = new Set(elementsOf(ordered));
    const fresh = [...new Set(toArray(els))].filter((el) => !current.has(el));
    const accepted = limit(fresh, max - ordered.length);
    if (!accepted.length && !dropped) return;
    commit([...ordered, ...accepted], last(accepted) ?? primaryEl);
  }

  function markerFor(el: Element): string | null {
    const index = markerIndex.get(el);
    const series = options.markers ?? 'letters';
    return index === undefined || series === false ? null : formatMarker(index, series);
  }

  function markerForText(item: TextSelectionItem): string | null {
    const index = markerIndex.get(item.key);
    const series = options.markers ?? 'letters';
    return index === undefined || series === false ? null : formatMarker(index, series);
  }

  function remove(els: Iterable<Element> | Element) {
    const gone = new Set(toArray(els));
    const next = ordered.filter((item) => isTextItem(item) || !gone.has(item));
    if (next.length !== ordered.length) commit(next, primaryEl);
  }

  return {
    get: () => elementsOf(ordered),
    textItems: () => textOf(ordered),
    items: () => ordered.slice(),
    set(els) {
      const accepted = limit([...new Set(els)], max);
      // A new selection starts again from the first marker.
      markerIndex.clear();
      nextMarker = 0;
      commit(accepted, last(accepted));
    },
    add,
    remove,
    toggle(el) {
      if (elementsOf(ordered).includes(el)) remove(el);
      else add(el);
    },
    addText(item) {
      if (textOf(ordered).some((t) => t.key === item.key)) return false;
      if (ordered.length >= max) {
        dropped++;
        scheduleFlush();
        return false;
      }
      commit([...ordered, item], primaryEl);
      return true;
    },
    removeText(item) {
      const next = ordered.filter((t) => !isTextItem(t) || t.key !== item.key);
      if (next.length !== ordered.length) commit(next, primaryEl);
    },
    hasText: (item) => textOf(ordered).some((t) => t.key === item.key),
    clear() {
      if (ordered.length) commit([], null);
    },
    has: (el) => elementsOf(ordered).includes(el),
    primary: () => primaryEl,
    marker: markerFor,
    markerForText,
    setPrimary(el) {
      if (el !== primaryEl && elementsOf(ordered).includes(el)) commit(ordered, el);
    },
    subscribe: (fn) => {
      listeners.selectionchange.add(fn);
      return () => listeners.selectionchange.delete(fn);
    },
    on(type, fn) {
      listeners[type].add(fn);
      return () => listeners[type].delete(fn);
    },
    toContext() {
      return ordered.flatMap((item) => {
        if (isTextItem(item)) {
          const m = markerForText(item);
          return [m ? { ...item.node, marker: m } : { ...item.node }];
        }
        const node = toContextNode(item, options);
        const m = markerFor(item);
        return node ? [m ? { ...node, marker: m } : node] : [];
      });
    },
    destroy() {
      destroyed = true;
      observer?.disconnect();
      observer = null;
      listeners.selectionchange.clear();
      listeners.selectionlimit.clear();
    },
  };
}
