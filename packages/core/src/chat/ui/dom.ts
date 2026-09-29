type Attrs = Record<string, string | number | boolean | undefined | null>;
type Child = Node | string | null | undefined | false;

/**
 * Tiny element factory. Attributes starting with `on` are not supported on
 * purpose: listeners are attached explicitly, and text is always set as
 * text, so nothing here can turn a string into markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'class') el.className = String(value);
    else el.setAttribute(name, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/** Replace all children of `parent`. */
export function replace(parent: Node, ...children: Child[]) {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  append(parent, children);
}

let uid = 0;
/** Unique id for ARIA references inside the shadow root. */
export const nextId = (prefix: string) => `dci-${prefix}-${++uid}`;
