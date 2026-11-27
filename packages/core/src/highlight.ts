import type { DciContextNode } from '@samirdamle/dci-protocol';
import type { TextSelectionItem } from './text-selection';

/** The named highlight registered in `CSS.highlights` for captured text. */
export const TEXT_HIGHLIGHT_NAME = 'dci-text';
/** A second, stronger highlight used briefly by `flash()`. */
export const TEXT_FLASH_HIGHLIGHT_NAME = 'dci-text-flash';

/**
 * Deviation from spec §7 (recorded here and in the implementation report):
 * `::highlight()` rules only apply to text inside the tree that owns the
 * stylesheet, so the rule cannot live in the Shadow DOM stylesheet the spec
 * names — a shadow stylesheet can only highlight text inside that shadow
 * root, never the host page's text. The rule therefore lives in a
 * document-level adopted stylesheet (with an injected `<style>` fallback,
 * mirroring `ui-host.ts`'s `adopt()`), in the theme accent colour.
 */
export const TEXT_HIGHLIGHT_CSS = `
::highlight(${TEXT_HIGHLIGHT_NAME}) {
  background-color: rgb(37 99 235 / 0.35);
  color: inherit;
}
::highlight(${TEXT_FLASH_HIGHLIGHT_NAME}) {
  background-color: rgb(37 99 235 / 0.65);
  color: inherit;
}
@media (prefers-color-scheme: dark) {
  ::highlight(${TEXT_HIGHLIGHT_NAME}) { background-color: rgb(96 165 250 / 0.45); }
  ::highlight(${TEXT_FLASH_HIGHLIGHT_NAME}) { background-color: rgb(96 165 250 / 0.75); }
}
`;

/** How long `flash()` keeps the intensified highlight (ms). */
export const TEXT_FLASH_MS = 1400;

export interface TextHighlightOptions {
  /**
   * Re-resolve a node's range after the DOM changes (A's `deserializeRange`).
   * Without it, `refresh()` re-registers the stored ranges as they are.
   */
  resolve?: (node: DciContextNode) => Range | null;
  /**
   * The highlight registry to use. Defaults to the global `CSS.highlights`;
   * injectable so tests can run where the Highlight API is absent.
   */
  registry?: {
    set(name: string, highlight: { add(range: Range): void }): void;
    delete(name: string): void;
    has(name: string): boolean;
  } | null;
  /** Highlight constructor. Defaults to the global `Highlight`. */
  HighlightCtor?: new (...ranges: Range[]) => { add(range: Range): void };
  /** Document the stylesheet is installed in. Default `document`. */
  doc?: Document;
}

export interface TextHighlight {
  /** Whether the CSS Custom Highlight API is available (or was injected). */
  readonly supported: boolean;
  /** Register (or re-register) one item's highlight. */
  register(item: TextSelectionItem): void;
  /** Remove one item's highlight, by item, node or key. */
  remove(item: TextSelectionItem | DciContextNode | string): void;
  /** Remove the highlight for a context node (chip removal path). */
  removeForNode(node: DciContextNode): void;
  /** Remove every highlight. */
  clear(): void;
  /** Re-register every stored item (after DOM changes), resolving ranges first. */
  refresh(): void;
  /**
   * Scroll a range into view (nearest) and briefly intensify its highlight,
   * mirroring the overlay's `flash` for elements.
   */
  flash(item: TextSelectionItem): void;
  /** Number of items currently tracked. */
  readonly size: number;
  destroy(): void;
}

type RegistryLike = NonNullable<TextHighlightOptions['registry']>;

/** Whether the CSS Custom Highlight API exists in this environment. */
export function highlightSupported(): boolean {
  try {
    return (
      typeof CSS !== 'undefined' &&
      'highlights' in CSS &&
      typeof Highlight !== 'undefined' &&
      typeof (CSS as unknown as { highlights?: unknown }).highlights !== 'undefined'
    );
  } catch {
    return false;
  }
}

// The document-level stylesheet is shared: install once per document and
// remove it when the last highlight instance for that document is destroyed.
const installed = new WeakMap<
  Document,
  { sheet: CSSStyleSheet | null; style: HTMLStyleElement | null; users: number }
>();

function installStyles(doc: Document): () => void {
  const entry = installed.get(doc);
  if (entry) {
    entry.users++;
    return () => releaseStyles(doc);
  }
  let sheet: CSSStyleSheet | null = null;
  let style: HTMLStyleElement | null = null;
  try {
    const fresh = new CSSStyleSheet();
    fresh.replaceSync(TEXT_HIGHLIGHT_CSS);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, fresh];
    sheet = fresh;
  } catch {
    // Constructable stylesheets are unavailable (or the rule was rejected):
    // fall through to an injected <style> below.
  }
  if (!sheet) {
    try {
      style = doc.createElement('style');
      style.setAttribute('data-dci-text-highlight', '');
      style.textContent = TEXT_HIGHLIGHT_CSS;
      (doc.head ?? doc.documentElement).appendChild(style);
    } catch {
      style = null;
    }
  }
  installed.set(doc, { sheet, style, users: 1 });
  return () => releaseStyles(doc);
}

function releaseStyles(doc: Document): void {
  const entry = installed.get(doc);
  if (!entry) return;
  if (--entry.users > 0) return;
  installed.delete(doc);
  try {
    if (entry.sheet)
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== entry.sheet);
  } catch {
    // The document may already be gone.
  }
  entry.style?.remove();
}

function keyOf(item: TextSelectionItem | DciContextNode | string): string {
  if (typeof item === 'string') return item;
  if ('kind' in item && 'range' in item) return (item as TextSelectionItem).key;
  const node = item as DciContextNode;
  return node.text ? textKeyOf(node) : `text:${JSON.stringify(node)}`;
}

/** Serialized-range identity for a text node (spec §6; agent A's `textNodeKey`). */
function textKeyOf(node: DciContextNode): string {
  const text = node.text;
  return text
    ? `text:${text.start.path}@${text.start.offset}-${text.end.path}@${text.end.offset}`
    : 'text:missing';
}

function scrollRangeIntoView(range: Range): void {
  try {
    const container = range.startContainer;
    const el =
      container instanceof Element
        ? container
        : (container.parentElement ?? container.parentNode instanceof Element)
          ? (container.parentNode as Element)
          : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  } catch {
    // Scrolling is best-effort; a detached range must never throw.
  }
}

/**
 * CSS Custom Highlight management for captured text items: one named
 * highlight per item in `CSS.highlights`, removed on chip removal / clear,
 * re-registered after DOM changes where the range still resolves. Every
 * method is a no-op (never throws) when the Highlight API is absent — the
 * chip and its context item remain valid regardless (spec §7 fallback).
 */
export function createTextHighlight(options: TextHighlightOptions = {}): TextHighlight {
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : null);
  const registry: RegistryLike | null =
    options.registry !== undefined
      ? options.registry
      : highlightSupported()
        ? (CSS.highlights as unknown as RegistryLike)
        : null;
  const HighlightCtor =
    options.HighlightCtor ?? (typeof Highlight !== 'undefined' ? Highlight : null);
  const supported = registry !== null && HighlightCtor !== null;
  const items = new Map<string, TextSelectionItem>();
  let removeStyles: (() => void) | null = null;
  let observer: MutationObserver | null = null;
  let refreshFrame = 0;
  let destroyed = false;
  const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

  if (doc && supported) removeStyles = installStyles(doc);

  function scheduleRefresh() {
    if (!items.size || destroyed) return;
    if (refreshFrame) return;
    const run = () => {
      refreshFrame = 0;
      refresh();
    };
    refreshFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : 0;
    if (!refreshFrame) setTimeout(run, 0);
  }

  function syncObserver() {
    if (items.size && !observer && doc && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => scheduleRefresh());
      observer.observe(doc.body ?? doc.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } else if (!items.size && observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function applyRegistry() {
    if (!supported || !registry || !HighlightCtor) return;
    // One named highlight per item would need a distinct name per item; the
    // spec names a single `dci-text` highlight, so all ranges share it.
    try {
      const highlight = new HighlightCtor(...[...items.values()].map((i) => i.range));
      if (items.size) registry.set(TEXT_HIGHLIGHT_NAME, highlight);
      else registry.delete(TEXT_HIGHLIGHT_NAME);
    } catch {
      // Never throw from highlight bookkeeping.
    }
  }

  function refresh() {
    if (destroyed) return;
    let changed = false;
    for (const [key, item] of [...items]) {
      if (!options.resolve) continue;
      let resolved: Range | null;
      try {
        resolved = options.resolve(item.node);
      } catch {
        resolved = null;
      }
      if (resolved && resolved !== item.range) {
        items.set(key, { ...item, range: resolved });
        changed = true;
      }
    }
    if (changed || options.resolve) applyRegistry();
    syncObserver();
  }

  return {
    get supported() {
      return supported;
    },
    get size() {
      return items.size;
    },
    register(item) {
      if (destroyed) return;
      items.set(item.key, item);
      applyRegistry();
      syncObserver();
    },
    remove(item) {
      const key = keyOf(item);
      if (!items.delete(key)) return;
      const flashTimer = flashTimers.get(key);
      if (flashTimer) clearTimeout(flashTimer);
      flashTimers.delete(key);
      applyRegistry();
      syncObserver();
    },
    removeForNode(node) {
      this.remove(node);
    },
    clear() {
      if (!items.size) return;
      items.clear();
      for (const timer of flashTimers.values()) clearTimeout(timer);
      flashTimers.clear();
      try {
        registry?.delete(TEXT_HIGHLIGHT_NAME);
        registry?.delete(TEXT_FLASH_HIGHLIGHT_NAME);
      } catch {
        // Never throw.
      }
      syncObserver();
    },
    refresh,
    flash(item) {
      if (destroyed) return;
      const stored = items.get(item.key) ?? item;
      scrollRangeIntoView(stored.range);
      if (!supported || !registry || !HighlightCtor) return;
      try {
        const flash = new HighlightCtor(stored.range);
        registry.set(TEXT_FLASH_HIGHLIGHT_NAME, flash);
      } catch {
        return;
      }
      const existing = flashTimers.get(item.key);
      if (existing) clearTimeout(existing);
      flashTimers.set(
        item.key,
        setTimeout(() => {
          flashTimers.delete(item.key);
          try {
            registry.delete(TEXT_FLASH_HIGHLIGHT_NAME);
          } catch {
            // Never throw.
          }
        }, TEXT_FLASH_MS),
      );
    },
    destroy() {
      destroyed = true;
      if (refreshFrame && typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(refreshFrame);
      refreshFrame = 0;
      observer?.disconnect();
      observer = null;
      for (const timer of flashTimers.values()) clearTimeout(timer);
      flashTimers.clear();
      items.clear();
      try {
        registry?.delete(TEXT_HIGHLIGHT_NAME);
        registry?.delete(TEXT_FLASH_HIGHLIGHT_NAME);
      } catch {
        // Never throw.
      }
      removeStyles?.();
      removeStyles = null;
    },
  };
}
