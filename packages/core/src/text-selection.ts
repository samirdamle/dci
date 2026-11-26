import type {
  DciAncestor,
  DciContextNode,
  DciTextEndpoint,
  DciTextInfo,
} from '@samirdamle/dci-protocol';
import { cssPath, truncateText, type ContextOptions } from './context';
import { DCI_UI_ATTRIBUTE, isEditable } from './keys';
import { DEFAULT_ATTRIBUTE, readDci, type AnnotationSource } from './parse';
import { createDciTree } from './tree';

// The wire types live in @samirdamle/dci-protocol; re-exported for convenience.
export type { DciTextInfo };

/** Options for capturing and (de)serializing text ranges. */
export interface TextSelectionOptions extends ContextOptions {
  /** Characters of selected text sent per item. Default `2000`. */
  maxTextSelectionLength?: number;
}

/** A text range reduced to its endpoints plus the text it covered. */
export interface SerializedTextRange {
  /** Serialized start endpoint. */
  start: DciTextEndpoint;
  /** Serialized end endpoint. */
  end: DciTextEndpoint;
  /**
   * The selected text, whitespace-collapsed, at full length (not capped at
   * `maxTextSelectionLength`): deserialization compares the resolved text
   * against this, so a capped excerpt could never match.
   */
  excerpt: string;
  /**
   * When `true`, `excerpt` is a capped prefix of the selected text (as
   * stored on a `DciContextNode`'s `text` object), and deserialization
   * matches when the resolved text merely starts with it. `serializeRange`
   * always sets this to `false`.
   */
  truncated?: boolean;
}

/** One captured text selection, as held by the selection store. */
export interface TextSelectionItem {
  kind: 'text';
  /** The node as sent to the backend (marker assigned by the store). */
  node: DciContextNode;
  /** The live range (the highlight covers its full extent). */
  range: Range;
  /** Stable identity: `textNodeKey(node)`. */
  key: string;
}

/** Collapse every whitespace run to a single space and trim the ends. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The element containing a range boundary: a text node's parent, or the element itself. */
function endpointElement(node: Node): Element | null {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).parentElement;
  return node instanceof Element ? node : null;
}

/** The element containing a node (itself when it is one, else its parent). */
function elementFor(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

/** The annotation source for `readDci`, from text-selection options. */
function annotationSource(options: TextSelectionOptions): AnnotationSource {
  return {
    attribute: options.attribute ?? DEFAULT_ATTRIBUTE,
    ...(options.infer ? { infer: options.infer } : {}),
  };
}

/** Every descendant text node of `el`, in document order. */
function textNodesOf(el: Element): Text[] {
  const doc = el.ownerDocument ?? document;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    out.push(current as Text);
    current = walker.nextNode();
  }
  return out;
}

/**
 * For a raw (uncollapsed) character index, the collapsed-whitespace index of
 * the boundary before it. Index `raw.length` maps to the collapsed length,
 * so the map has one more entry than the string. Boundaries inside a
 * whitespace run map to just after the run's single collapsed space.
 */
function rawToCollapsedMap(raw: string): number[] {
  const map: number[] = [];
  let collapsed = 0;
  let inWhitespace = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (/\s/.test(ch)) {
      map.push(collapsed);
      if (!inWhitespace) {
        collapsed++;
        inWhitespace = true;
      }
    } else {
      map.push(collapsed);
      collapsed++;
      inWhitespace = false;
    }
  }
  map.push(collapsed);
  return map;
}

interface TextLayout {
  nodes: Text[];
  /** Raw offset where each text node starts within the concatenated text. */
  starts: number[];
  raw: string;
  map: number[];
  collapsed: string;
}

/** The concatenated text of `el` with its raw→collapsed index map. */
function layoutOf(el: Element): TextLayout {
  const nodes = textNodesOf(el);
  const starts: number[] = [];
  let raw = '';
  for (const node of nodes) {
    starts.push(raw.length);
    raw += node.data;
  }
  return { nodes, starts, raw, map: rawToCollapsedMap(raw), collapsed: raw.replace(/\s+/g, ' ') };
}

/** The first raw boundary whose collapsed index reaches `target`. */
function collapsedToRaw(map: number[], target: number): number {
  for (let i = 0; i < map.length; i++) if (map[i]! >= target) return i;
  return map.length - 1;
}

/**
 * Serialize one range endpoint: the CSS path of the endpoint's container
 * element plus the character offset within that container's
 * collapsed-whitespace text. Returns `null` when the endpoint has no
 * container element (e.g. a detached range).
 */
function serializeEndpoint(
  range: Range,
  start: boolean,
  root: Element | undefined,
): DciTextEndpoint | null {
  const node = start ? range.startContainer : range.endContainer;
  const offset = start ? range.startOffset : range.endOffset;
  const el = endpointElement(node);
  if (!el) return null;
  const probe = (el.ownerDocument ?? document).createRange();
  probe.selectNodeContents(el);
  probe.setEnd(node, offset);
  const rawOffset = probe.toString().length;
  const layout = layoutOf(el);
  return { path: cssPath(el, root), offset: layout.map[rawOffset] ?? layout.collapsed.length };
}

/**
 * Serialize a range to its endpoints plus the full collapsed text it covers.
 * Returns `null` when either endpoint cannot be serialized.
 */
export function serializeRange(
  range: Range,
  options: TextSelectionOptions = {},
): SerializedTextRange | null {
  const root = options.root;
  const start = serializeEndpoint(range, true, root);
  const end = serializeEndpoint(range, false, root);
  if (!start || !end) return null;
  return { start, end, excerpt: collapse(range.toString()), truncated: false };
}

/**
 * Resolve a short CSS path (as produced by `cssPath`) to an element within
 * `root`. An empty path is the root itself. Returns `null` when nothing
 * under `root` matches.
 */
export function resolveCssPath(path: string, root: Element = document.body): Element | null {
  if (!path) return root;
  const found = root.querySelector(path) ?? root.ownerDocument.querySelector(path);
  if (!found || (found !== root && !root.contains(found))) return null;
  return found;
}

/** Resolve one serialized endpoint to a `{ node, offset }` range boundary. */
function deserializeEndpoint(
  endpoint: DciTextEndpoint,
  root: Element,
): { node: Node; offset: number } | null {
  const el = resolveCssPath(endpoint.path, root);
  if (!el) return null;
  const layout = layoutOf(el);
  if (endpoint.offset < 0 || endpoint.offset > layout.collapsed.length) return null;
  if (!layout.nodes.length) {
    return endpoint.offset === 0 ? { node: el, offset: 0 } : null;
  }
  const rawOffset = collapsedToRaw(layout.map, endpoint.offset);
  let index = layout.nodes.length - 1;
  for (let i = 0; i < layout.nodes.length; i++) {
    if (layout.starts[i]! <= rawOffset) index = i;
    else break;
  }
  const node = layout.nodes[index]!;
  return { node, offset: Math.min(rawOffset - layout.starts[index]!, node.data.length) };
}

/**
 * Rebuild a range from `serializeRange` output. Returns `null` when either
 * endpoint cannot be resolved, or when the resolved text does not match the
 * stored excerpt (after collapsing whitespace) — a range that resolves to a
 * nearby but different span must never be sent as if it were exact. A
 * `DciTextInfo` (whose excerpt is capped at `maxTextSelectionLength`) is
 * accepted as the serialized form: when its `truncated` flag is set, the
 * resolved text only needs to start with the excerpt, since the full text
 * was never stored.
 */
export function deserializeRange(
  serialized: SerializedTextRange,
  root: Element = document.body,
): Range | null {
  const start = deserializeEndpoint(serialized.start, root);
  const end = deserializeEndpoint(serialized.end, root);
  if (!start || !end) return null;
  const range = (root.ownerDocument ?? document).createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const resolved = collapse(range.toString());
  const matches = serialized.truncated
    ? resolved.startsWith(serialized.excerpt)
    : resolved === serialized.excerpt;
  return matches ? range : null;
}

/** Whether `el` or any of its ancestors is a `private` DCI node. */
function hasPrivateAncestor(el: Element | null, options: TextSelectionOptions): boolean {
  const source = annotationSource(options);
  for (let cur = el; cur; cur = cur.parentElement) {
    if (readDci(cur, source)?.private) return true;
  }
  return false;
}

/** Whether the range touches a `private` node (or its subtree) anywhere inside it. */
function intersectsPrivate(
  range: Range,
  container: Element | null,
  options: TextSelectionOptions,
): boolean {
  if (!container) return false;
  if (hasPrivateAncestor(container, options)) return true;
  const source = annotationSource(options);
  const doc = container.ownerDocument ?? document;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    const el = current as Element;
    if (range.intersectsNode(el) && readDci(el, source)?.private) return true;
    current = walker.nextNode();
  }
  return false;
}

/** Whether `node` sits inside DCI's own UI, an editable field, or a password field. */
function containerReason(node: Node): string | null {
  const el = elementFor(node);
  for (let cur = el; cur; cur = cur.parentElement) {
    if (cur.hasAttribute(DCI_UI_ATTRIBUTE)) return "Selection is inside DCI's own UI.";
    if (cur instanceof HTMLInputElement && cur.type === 'password')
      return 'Selection is inside a password field.';
    if (isEditable(cur)) return 'Selection is inside an editable field.';
  }
  return null;
}

/**
 * Check whether a range may be captured (spec §4.1, §10.1). Returns `null`
 * when the range is valid, otherwise the reason it was refused — the private
 * reason is worded for showing to the user.
 */
export function validateTextRange(range: Range, options: TextSelectionOptions = {}): string | null {
  const text = collapse(range.toString());
  if (range.collapsed || !text) return 'Selection is empty.';
  if (!/[\p{L}\p{N}]/u.test(text)) return 'Selection contains no words.';
  const root = options.root ?? document.body;
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer))
    return 'Selection is outside the DCI root.';
  const container = elementFor(range.commonAncestorContainer);
  for (const node of [range.startContainer, range.endContainer, range.commonAncestorContainer]) {
    const reason = containerReason(node);
    if (reason) return reason;
  }
  if (intersectsPrivate(range, container, options))
    return 'Selection includes private content and was not added.';
  return null;
}

function toAncestor(parsed: ReturnType<typeof readDci>, mode: 'compact' | 'full'): DciAncestor {
  if (!parsed || parsed.private) return { private: true };
  const ancestor: DciAncestor = {};
  if (parsed.id !== undefined) ancestor.id = parsed.id;
  if (parsed.type !== undefined) ancestor.type = parsed.type;
  if (parsed.label !== undefined) ancestor.label = parsed.label;
  if (mode === 'full') ancestor.data = { ...parsed.data };
  return ancestor;
}

/**
 * Capture a range as a text context node (`source: 'text'`), or `null` when
 * the range is not valid (see `validateTextRange`). The excerpt is capped at
 * `maxTextSelectionLength` (default `2000`); the stored range itself is the
 * full range, so the highlight covers all of it. Ancestors are the annotated
 * ancestors of the range's common ancestor container, root first.
 */
export function captureTextRange(
  range: Range,
  options: TextSelectionOptions = {},
): DciContextNode | null {
  if (validateTextRange(range, options) !== null) return null;
  const serialized = serializeRange(range, options);
  if (!serialized) return null;
  const max = options.maxTextSelectionLength ?? 2000;
  const full = serialized.excerpt;
  const truncated = full.length > max;
  const excerpt = truncated ? full.slice(0, max) : full;
  const node: DciContextNode = {
    label: truncateText(full, 80),
    data: {},
    source: 'text',
    text: { excerpt, truncated, start: serialized.start, end: serialized.end },
  };
  const includeAncestors = options.includeAncestors ?? true;
  if (includeAncestors) {
    const container = elementFor(range.commonAncestorContainer);
    const source = annotationSource(options);
    const tree = createDciTree(options);
    node.ancestors = (container ? tree.pathTo(container) : []).map((a) =>
      toAncestor(readDci(a, source), options.ancestorData ?? 'compact'),
    );
  }
  return node;
}

/**
 * Node identity for de-duplication: `text:<start.path>@<start.offset>-<end.path>@<end.offset>`.
 * A node with no `text` object has no range identity.
 */
export function textNodeKey(node: DciContextNode): string {
  const text = node.text;
  if (!text) return 'text:missing';
  return `text:${text.start.path}@${text.start.offset}-${text.end.path}@${text.end.offset}`;
}

/** Wrap a captured node and its live range as a selection-store item. */
export function toTextSelectionItem(node: DciContextNode, range: Range): TextSelectionItem {
  return { kind: 'text', node, range, key: textNodeKey(node) };
}
