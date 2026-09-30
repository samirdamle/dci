import { devWarn, type Warn } from './env';

/** Default attribute that marks an element as DCI context. */
export const DEFAULT_ATTRIBUTE = 'data-dci';

/** Normalized `data-dci` payload. */
export interface ParsedDci {
  id?: string;
  type?: string;
  label?: string;
  /** `true` when the node must never be selected or sent. */
  private: boolean;
  /** Every non-reserved key, passed through to the backend as-is. */
  data: Record<string, unknown>;
}

/**
 * Annotates an element that has no DCI attribute, without touching the DOM:
 * return what its `data-dci` value would be (an object, or an id string), or
 * `null` when it isn't a DCI node. Called often (hover, window select), so
 * return `null` fast for elements that don't qualify.
 */
export type InferAnnotation = (el: Element) => Record<string, unknown> | string | null | undefined;

/** Where annotations come from: the attribute, then the optional `infer`. */
export interface AnnotationSource {
  /** Attribute name to read. Defaults to `data-dci`. */
  attribute?: string;
  /** Annotations for elements without the attribute. Real attributes always win. */
  infer?: InferAnnotation;
}

export interface ParseOptions extends AnnotationSource {
  /** Receives parse warnings. Defaults to a dev-mode `console.warn`. */
  warn?: Warn;
}

/** An `AnnotationSource` from an attribute name (the older signature) or a source. */
export const toSource = (source?: string | AnnotationSource): AnnotationSource =>
  typeof source === 'string' ? { attribute: source } : (source ?? {});

const RESERVED = new Set(['id', 'type', 'label', 'private']);

const toOptionalString = (value: unknown): string | undefined =>
  value === undefined || value === null ? undefined : String(value);

function fromObject(obj: Record<string, unknown>): ParsedDci {
  const parsed: ParsedDci = { private: obj.private === true, data: {} };
  const id = toOptionalString(obj.id);
  const type = toOptionalString(obj.type);
  const label = toOptionalString(obj.label);
  if (id !== undefined) parsed.id = id;
  if (type !== undefined) parsed.type = type;
  if (label !== undefined) parsed.label = label;
  for (const [key, value] of Object.entries(obj)) {
    if (!RESERVED.has(key)) parsed.data[key] = value;
  }
  return parsed;
}

const shortForm = (value: string): ParsedDci =>
  value ? { id: value, private: false, data: {} } : { private: false, data: {} };

/**
 * Parse a raw `data-dci` value.
 *
 * - `null` (attribute absent) → `null`
 * - `""` → an anonymous node
 * - A JSON object (`{...}`) → reserved keys split out, the rest in `data`
 * - Anything else → short form, the string is the `id`
 *
 * Values that look like JSON (`{` or `[`) but aren't a valid object fall back
 * to the short form and report through `warn`.
 */
export function parseDciAttribute(value: string | null, warn: Warn = devWarn): ParsedDci | null {
  if (value === null) return null;
  const raw = value.trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      warn(`Invalid JSON in data-dci, using it as an id: ${raw}`);
      return shortForm(raw);
    }
    if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
      return fromObject(json as Record<string, unknown>);
    }
    warn(`data-dci must be a JSON object or a plain id, got: ${raw}`);
  }
  return shortForm(raw);
}

interface CacheEntry {
  attribute: string;
  raw: string;
  parsed: ParsedDci | null;
}

const cache = new WeakMap<Element, CacheEntry>();
const warned = new WeakSet<Element>();

/**
 * Read and parse an element's DCI attribute. Results are cached per element
 * and reused until the raw attribute value (or attribute name) changes.
 * Parse warnings are reported at most once per element.
 */
export function readDci(el: Element, options: ParseOptions = {}): ParsedDci | null {
  const { attribute = DEFAULT_ATTRIBUTE, warn = devWarn, infer } = options;
  const raw = el.getAttribute(attribute);
  if (raw === null) return infer ? readInferred(el, infer) : null;

  const hit = cache.get(el);
  if (hit && hit.attribute === attribute && hit.raw === raw) return hit.parsed;

  const parsed = parseDciAttribute(raw, (message) => {
    if (warned.has(el)) return;
    warned.add(el);
    warn(message);
  });
  cache.set(el, { attribute, raw, parsed });
  return parsed;
}

interface InferredEntry {
  infer: InferAnnotation;
  generation: number;
  parsed: ParsedDci | null;
}

const inferred = new WeakMap<Element, InferredEntry>();
let generation = 0;

/**
 * Forget cached inferred annotations, so the next read runs `infer` again.
 * Called at the start of each gesture and before each send: inferred data
 * (e.g. a row's cell text) stays fresh without re-inferring on every frame.
 */
export function refreshInferred(): void {
  generation++;
}

function readInferred(el: Element, infer: InferAnnotation): ParsedDci | null {
  const hit = inferred.get(el);
  if (hit && hit.infer === infer && hit.generation === generation) return hit.parsed;
  const value = infer(el);
  const parsed =
    value === null || value === undefined
      ? null
      : typeof value === 'string'
        ? shortForm(value)
        : fromObject(value);
  inferred.set(el, { infer, generation, parsed });
  return parsed;
}

/** Whether `el` carries the DCI attribute. */
export const isDciElement = (el: Element, attribute: string = DEFAULT_ATTRIBUTE): boolean =>
  el.hasAttribute(attribute);
