import type { DciAncestor, DciContextNode, DciFallbackInfo } from '@dci/protocol';
import { DEFAULT_ATTRIBUTE, readDci } from './parse';
import { createDciTree, type TreeOptions } from './tree';

// The wire types live in @dci/protocol; re-exported for convenience.
export type { DciAncestor, DciContextNode, DciFallbackInfo };

export interface ContextOptions extends TreeOptions {
  /** Include the ancestor chain. Default `true`. */
  includeAncestors?: boolean;
  /** `'compact'` sends id/type/label only; `'full'` adds `data`. Default `'compact'`. */
  ancestorData?: 'compact' | 'full';
  /** Capture unannotated elements. Default `true`. */
  fallback?: boolean;
  /** Max fallback text length before truncation. Default `500`. */
  maxTextLength?: number;
}

const ELLIPSIS = '…';
const MAX_PATH_DEPTH = 5;
const SAFE_CLASS = /^-?[A-Za-z_][\w-]*$/;

/** Collapse whitespace and cap at `max` characters, marking truncation with `…`. */
export function truncateText(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? collapsed.slice(0, max) + ELLIPSIS : collapsed;
}

/** Short, human-readable CSS path from `el` up to `root` (exclusive), an `#id`, or 5 levels. */
export function cssPath(el: Element, root?: Element): string {
  const segments: string[] = [];
  for (let cur: Element | null = el; cur && cur !== root; cur = cur.parentElement) {
    if (cur.id && SAFE_CLASS.test(cur.id)) {
      segments.unshift(`#${cur.id}`);
      break;
    }
    let segment = cur.tagName.toLowerCase();
    const classes = Array.from(cur.classList).filter((c) => SAFE_CLASS.test(c));
    if (classes.length) segment += '.' + classes.slice(0, 2).join('.');
    const parent = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      if (siblings.filter((s) => s.tagName === cur!.tagName).length > 1) {
        segment += `:nth-child(${siblings.indexOf(cur) + 1})`;
      }
    }
    segments.unshift(segment);
    if (segments.length >= MAX_PATH_DEPTH) break;
  }
  return segments.join(' > ');
}

function fieldValue(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) return el.type === 'password' ? undefined : el.value;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;
  return undefined;
}

function fallbackInfo(el: Element, root: Element | undefined, maxTextLength: number) {
  const info: DciFallbackInfo = { tagName: el.tagName.toLowerCase(), path: cssPath(el, root) };
  const raw = el instanceof HTMLElement ? (el.innerText ?? el.textContent) : el.textContent;
  const text = truncateText(raw ?? '', maxTextLength);
  if (text) info.text = text;
  const attrs = { ariaLabel: 'aria-label', alt: 'alt', title: 'title' } as const;
  for (const [key, name] of Object.entries(attrs)) {
    const value = el.getAttribute(name);
    if (value) info[key as keyof typeof attrs] = value;
  }
  if (el.tagName === 'A') {
    const href = el.getAttribute('href');
    if (href) info.href = href;
  }
  const value = fieldValue(el);
  if (value !== undefined) info.value = truncateText(value, maxTextLength);
  return info;
}

/**
 * Build the payload for one element: annotated nodes use their `data-dci`,
 * unannotated ones get a fallback description (when enabled). Returns `null`
 * for private nodes, for unannotated elements inside a private node, and
 * for unannotated elements when `fallback` is off.
 * Output is deterministic for a given DOM.
 */
export function toContextNode(el: Element, options: ContextOptions = {}): DciContextNode | null {
  const {
    attribute = DEFAULT_ATTRIBUTE,
    includeAncestors = true,
    ancestorData = 'compact',
    fallback = true,
    maxTextLength = 500,
  } = options;
  const parsed = readDci(el, { attribute });
  if (parsed?.private) return null;
  if (!parsed && !fallback) return null;

  const tree = createDciTree(options);
  const ancestors = tree.pathTo(el).filter((a) => a !== el);
  // Never describe an unannotated element that sits inside a private node.
  const owner = ancestors[ancestors.length - 1];
  if (!parsed && owner && readDci(owner, { attribute })?.private) return null;

  const node: DciContextNode = parsed
    ? { ...pick(parsed), data: { ...parsed.data }, source: 'annotated' }
    : { data: {}, source: 'fallback', fallback: fallbackInfo(el, options.root, maxTextLength) };

  if (includeAncestors) {
    node.ancestors = ancestors.map((a) => toAncestor(readDci(a, { attribute }), ancestorData));
  }
  return node;
}

function pick(src: { id?: string; type?: string; label?: string }) {
  const out: { id?: string; type?: string; label?: string } = {};
  if (src.id !== undefined) out.id = src.id;
  if (src.type !== undefined) out.type = src.type;
  if (src.label !== undefined) out.label = src.label;
  return out;
}

function toAncestor(parsed: ReturnType<typeof readDci>, mode: 'compact' | 'full'): DciAncestor {
  if (!parsed || parsed.private) return { private: true };
  const ancestor: DciAncestor = pick(parsed);
  if (mode === 'full') ancestor.data = { ...parsed.data };
  return ancestor;
}
