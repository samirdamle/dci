import { DCI_UI_ATTRIBUTE } from './keys';

export type Theme = 'light' | 'dark' | 'auto';
export type LayerName = 'overlay' | 'chat' | 'live-region';

export interface UiHostOptions {
  /** Where the host element is appended. Default `document.body`. */
  container?: Element;
  /** Default `'auto'` (follows `prefers-color-scheme`). */
  theme?: Theme;
}

export interface UiHost {
  readonly element: HTMLElement;
  readonly shadow: ShadowRoot;
  layer(name: LayerName): HTMLElement;
  /** Add a stylesheet (CSS text) to the shadow root. Returns a remover. */
  addStyles(css: string): () => void;
  setTheme(theme: Theme): void;
}

export const HOST_TAG = 'dci-root';

/**
 * Theme tokens. Custom properties inherit through the shadow boundary, so a
 * host page can override any of them, e.g. `dci-root { --dci-accent: hotpink }`.
 */
export const BASE_CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: var(--dci-z, 2147483000);
  box-sizing: border-box;
  color-scheme: light dark;
  font: 13px/1.4 var(--dci-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);
  color: var(--dci-fg);
  --dci-accent: #2563eb;
  --dci-hover: #2563eb;
  --dci-selected: #2563eb;
  --dci-preview: #7c3aed;
  --dci-bg: #ffffff;
  --dci-fg: #0f172a;
  --dci-muted: #64748b;
  --dci-border: #e2e8f0;
  --dci-radius: 6px;
  --dci-shadow: 0 4px 16px rgb(15 23 42 / 0.12);
  --dci-on-accent: #ffffff;
  --dci-surface: #f1f5f9;
  --dci-danger: #b91c1c;
  --dci-success: #15803d;
}
:host([data-theme='dark']) {
  --dci-accent: #60a5fa;
  --dci-hover: #60a5fa;
  --dci-selected: #60a5fa;
  --dci-preview: #a78bfa;
  --dci-bg: #0f172a;
  --dci-fg: #f1f5f9;
  --dci-muted: #94a3b8;
  --dci-border: #334155;
  --dci-shadow: 0 4px 16px rgb(0 0 0 / 0.5);
  --dci-on-accent: #0f172a;
  --dci-surface: #1e293b;
  --dci-danger: #fca5a5;
  --dci-success: #86efac;
}
@media (prefers-color-scheme: dark) {
  :host([data-theme='auto']) {
    --dci-accent: #60a5fa;
    --dci-hover: #60a5fa;
    --dci-selected: #60a5fa;
    --dci-preview: #a78bfa;
    --dci-bg: #0f172a;
    --dci-fg: #f1f5f9;
    --dci-muted: #94a3b8;
    --dci-border: #334155;
    --dci-shadow: 0 4px 16px rgb(0 0 0 / 0.5);
  --dci-on-accent: #0f172a;
  --dci-surface: #1e293b;
  --dci-danger: #fca5a5;
  --dci-success: #86efac;
  }
}
*, *::before, *::after { box-sizing: border-box; }
[data-layer] { position: fixed; inset: 0; pointer-events: none; }
[data-layer='chat'] > * { pointer-events: auto; }
[data-layer='live-region'] {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; inset: auto;
}
`;

const LAYERS: LayerName[] = ['overlay', 'chat', 'live-region'];

function defineElement() {
  if (typeof customElements === 'undefined' || customElements.get(HOST_TAG)) return;
  customElements.define(HOST_TAG, class extends HTMLElement {});
}

/** Adopt CSS via a constructable stylesheet, falling back to `<style>`. */
function adopt(shadow: ShadowRoot, css: string): () => void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
    return () => {
      shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter((s) => s !== sheet);
    };
  } catch {
    const style = document.createElement('style');
    style.textContent = css;
    shadow.prepend(style);
    return () => style.remove();
  }
}

function createHost(options: UiHostOptions): UiHost {
  defineElement();
  const element = document.createElement(HOST_TAG);
  element.setAttribute(DCI_UI_ATTRIBUTE, '');
  element.setAttribute('data-theme', options.theme ?? 'auto');
  const shadow = element.attachShadow({ mode: 'open' });
  adopt(shadow, BASE_CSS);
  const layers = {} as Record<LayerName, HTMLElement>;
  for (const name of LAYERS) {
    const layer = document.createElement('div');
    layer.setAttribute('data-layer', name);
    shadow.appendChild(layer);
    layers[name] = layer;
  }
  (options.container ?? document.body).appendChild(element);
  return {
    element,
    shadow,
    layer: (name) => layers[name],
    addStyles: (css) => adopt(shadow, css),
    setTheme: (theme) => element.setAttribute('data-theme', theme),
  };
}

const shared = new Map<Element, { host: UiHost; refs: number }>();

/**
 * Get the shared UI host for a container, creating it on first use. Every
 * DCI instance shares one host per container; each `acquire` must be paired
 * with a `release`, and the last release removes the host and everything in it.
 */
export function acquireUiHost(options: UiHostOptions = {}): { host: UiHost; release: () => void } {
  const container = options.container ?? document.body;
  let entry = shared.get(container);
  if (!entry || !entry.host.element.isConnected) {
    entry = { host: createHost(options), refs: 0 };
    shared.set(container, entry);
  } else if (options.theme) {
    entry.host.setTheme(options.theme);
  }
  entry.refs++;
  const current = entry;
  let released = false;
  return {
    host: current.host,
    release() {
      if (released) return;
      released = true;
      if (--current.refs > 0) return;
      current.host.element.remove();
      if (shared.get(container) === current) shared.delete(container);
    },
  };
}
