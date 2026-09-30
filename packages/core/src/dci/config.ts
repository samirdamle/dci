import type { DciEvent, DciRequest } from '@samirdamle/dci-protocol';
import type { BuiltinAction } from '../actions';
import type { BindingsConfig } from '../bindings';
import type { ChatRenderers, ChatMode } from '../chat/ui/chat-ui';
import type { RenderMarkdown } from '../chat/ui/markdown';
import type { AnchorTo } from '../chat/ui/position';
import type { ChatStrings } from '../chat/ui/strings';
import type { ActionsConfig } from '../chat/suggested-actions';
import type { Gesture } from '../interactions';
import type { ModifierKey } from '../keys';
import type { InferAnnotation } from '../parse';
import type { LabelMode, OverlayMode } from '../overlay';
import type { SessionOptions } from '../session';
import type { Transport } from '../transport';
import type { Theme } from '../ui-host';

type MaybePromise<T> = T | Promise<T>;
type HeadersInput = Record<string, string> | Headers;

/** Chat options (`config.chat`). */
export interface DciChatConfig {
  /** Render the built-in chat UI. `false` = headless: drive `dci.chat` from your own UI. Default `true`. */
  ui?: boolean;
  /** `'popover'` (anchored to the selection) or `'panel'` (docked). Default `'popover'`. */
  mode?: ChatMode;
  /** Panel side. Default `'right'`. */
  side?: 'left' | 'right';
  /** Popover anchor: the primary node or the whole selection's box. Default `'primary'`. */
  anchor?: AnchorTo;
  /**
   * `'onSelect'` opens shortly after a selection (keeping focus on the page),
   * `'onAction'` opens when a message is sent, `false` never auto-opens.
   * Default `'onSelect'`.
   */
  autoOpen?: 'onSelect' | 'onAction' | false;
  /** Panel: set `--dci-chat-inset` on `<html>` so your layout can make room. Default `false`. */
  pushContent?: boolean;
  /** Initial panel width in px. Default `380`. */
  panelWidth?: number;
  /** Context chips shown before "+N more". Default `6`. */
  maxChips?: number;
  /** Suggested actions shown before the overflow menu. Default `4`. */
  maxActions?: number;
  /** Override any UI text (i18n). */
  strings?: Partial<ChatStrings>;
  /** Replace sections of the default UI. */
  render?: ChatRenderers;
  /** Replace the built-in markdown renderer. Model output is untrusted: sanitize it. */
  renderMarkdown?: RenderMarkdown;
  /** Syntax-highlighting hook for code blocks. */
  highlightCode?: (code: string, lang: string) => Node;
  /** `'turn'` sends only context added since the last message; `'cumulative'` resends all. Default `'turn'`. */
  contextMode?: 'turn' | 'cumulative';
  /** Sending while a reply streams: `'block'` ignores it, `'queue'` waits. Default `'block'`. */
  concurrency?: 'block' | 'queue';
  /** Ask the user before each send: `true`, or decide per request. Default `false`. */
  confirmBeforeSend?: boolean | ((request: DciRequest) => boolean);
}

/** Overlay options (`config.overlay`). */
export interface DciOverlayConfig {
  /** `'boxes'` (Shadow DOM layer) or the lightweight `'outline'`. Default `'boxes'`. */
  mode?: OverlayMode;
  /** Which boxes get a name tag. Default `'hover'`. */
  labels?: LabelMode;
}

/** Everything `createDci()` accepts. Only `endpoint` (or `transport`) is required. */
export interface DciConfig {
  /** Backend URL that receives `POST` requests and answers with the SSE protocol. */
  endpoint?: string;
  /** Extra request headers, or a (possibly async) function called on every request. */
  headers?: HeadersInput | (() => MaybePromise<HeadersInput>);
  /** Custom `fetch` (auth wrapper, test double). Default: global `fetch`. */
  fetch?: typeof fetch;
  /** Request credentials mode. Default `'same-origin'`. */
  credentials?: RequestCredentials;
  /** Use your own transport instead of `endpoint` (WebSocket, AI SDK adapter, mock). */
  transport?: Transport;

  /** Only nodes inside this element count. Default `document.body`. */
  root?: Element;
  /** Attribute that marks DCI nodes. Default `'data-dci'`. */
  attribute?: string;
  /**
   * Annotate elements that have no DCI attribute, without changing the DOM:
   * return what their `data-dci` value would be (an object or an id), or
   * `null`. Inferred nodes behave like annotated ones (hover, selection,
   * same-type, context); a real attribute always wins. Keep it fast: it runs
   * for many elements during hover and window select (results are cached per
   * gesture). Example: `(el) => el.matches('tr') ? { type: 'row', label: … } : null`.
   */
  infer?: InferAnnotation;
  /** Key that arms DCI. Default `'Alt'` (Option on macOS). */
  modifier?: ModifierKey;
  /** Remap or disable gestures and keys. */
  bindings?: BindingsConfig;
  /** Cap on selected nodes; extra ones fire `selectionlimit`. Default `50`. */
  maxSelection?: number;
  /** Include each node's ancestor chain in payloads. Default `true`. */
  includeAncestors?: boolean;
  /** `'compact'` ancestors (id/type/label) or `'full'` (with data). Default `'compact'`. */
  ancestorData?: 'compact' | 'full';
  /** Allow selecting unannotated elements (described from visible info). Default `true`. */
  fallback?: boolean;
  /** Max fallback text length. Default `500`. */
  maxTextLength?: number;
  /** Drag selects innermost (`'leaf'`) or outermost (`'top'`) nodes. Default `'leaf'`. */
  windowSelectLevel?: 'leaf' | 'top';
  /** Mod+Click on empty space clears the selection. Default `true`. */
  clearOnEmptyClick?: boolean;
  /** Let DCI clicks reach your app's handlers too. Default `false`. */
  passthroughClicks?: boolean;
  /** Gesture modules to attach. Default: all built-ins. */
  gestures?: Gesture[];

  /** Highlight overlay options, or `false` to draw your own from `hover`/`selectionchange`. */
  overlay?: DciOverlayConfig | false;
  /** `'light'`, `'dark'` or `'auto'` (follows the OS). Default `'auto'`. */
  theme?: Theme;
  /** Where the `<dci-root>` UI host is appended. Default `document.body`. */
  container?: Element;

  /** Chat options. */
  chat?: DciChatConfig;
  /** Suggested actions per node `type` (`'*'` for all), or a function of the selection. */
  actions?: ActionsConfig;
  /** Built-in client actions (`highlight`, `select`, `scrollTo`): `true`, `false` or a list. Default `true`. */
  builtinActions?: boolean | BuiltinAction[];
  /** Redact or enrich each request; return `false` to cancel it. */
  beforeSend?: (request: DciRequest) => MaybePromise<DciRequest | false>;
  /** Conversation id handling. Default: a new id per page load. */
  session?: SessionOptions;
  /** Page info sent with each request. Default: `location.href` and `document.title`. */
  page?: () => { url: string; title: string };
  /** Receives custom `x-…` stream events. */
  onCustomEvent?: (event: DciEvent) => void;
}

/**
 * Defaults, in one place. Merge rules (for `createDci` and `update`): plain
 * objects merge deeply; arrays, functions, elements and `false` replace.
 */
export const DEFAULTS = {
  attribute: 'data-dci',
  modifier: 'Alt',
  maxSelection: 50,
  includeAncestors: true,
  ancestorData: 'compact',
  fallback: true,
  maxTextLength: 500,
  windowSelectLevel: 'leaf',
  clearOnEmptyClick: true,
  passthroughClicks: false,
  overlay: { mode: 'boxes', labels: 'hover' },
  theme: 'auto',
  builtinActions: true,
  chat: {
    ui: true,
    mode: 'popover',
    side: 'right',
    anchor: 'primary',
    autoOpen: 'onSelect',
    pushContent: false,
    panelWidth: 380,
    maxChips: 6,
    maxActions: 4,
    contextMode: 'turn',
    concurrency: 'block',
    confirmBeforeSend: false,
  },
} as const satisfies DciConfig;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;

/** Deep-merge `patch` over `base`: plain objects merge, everything else replaces. `undefined` is skipped. */
export function mergeConfig<T extends object>(base: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? mergeConfig(current, value) : value;
  }
  return out as T;
}

/** Structural equality for config values (functions and elements by reference). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameValue(a[k], b[k]));
  }
  return false;
}

const TOP_KEYS: Array<keyof DciConfig> = [
  'endpoint',
  'headers',
  'fetch',
  'credentials',
  'transport',
  'root',
  'attribute',
  'infer',
  'modifier',
  'bindings',
  'maxSelection',
  'includeAncestors',
  'ancestorData',
  'fallback',
  'maxTextLength',
  'windowSelectLevel',
  'clearOnEmptyClick',
  'passthroughClicks',
  'gestures',
  'overlay',
  'theme',
  'container',
  'chat',
  'actions',
  'builtinActions',
  'beforeSend',
  'session',
  'page',
  'onCustomEvent',
];
const CHAT_KEYS: Array<keyof DciChatConfig> = [
  'ui',
  'mode',
  'side',
  'anchor',
  'autoOpen',
  'pushContent',
  'panelWidth',
  'maxChips',
  'maxActions',
  'strings',
  'render',
  'renderMarkdown',
  'highlightCode',
  'contextMode',
  'concurrency',
  'confirmBeforeSend',
];

/** Edit distance, for "did you mean" hints. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

function unknownKeys(obj: object, known: readonly string[], path: string): string[] {
  return Object.keys(obj)
    .filter((k) => !known.includes(k))
    .map((k) => {
      const guess = known.find((c) => distance(k.toLowerCase(), c.toLowerCase()) <= 2);
      return `Unknown option \`${path}${k}\`.${guess ? ` Did you mean \`${path}${guess}\`?` : ''}`;
    });
}

export interface ConfigProblems {
  /** Invalid values: `createDci` throws on these in development. */
  errors: string[];
  /** Likely mistakes (unknown keys): logged in development. */
  warnings: string[];
}

const oneOf = (value: unknown, allowed: readonly unknown[], name: string, errors: string[]) => {
  if (value !== undefined && !allowed.includes(value))
    errors.push(
      `\`${name}\` must be one of ${allowed.map((a) => JSON.stringify(a)).join(', ')} (got ${JSON.stringify(value)}).`,
    );
};

const count = (value: unknown, name: string, errors: string[], min = 0) => {
  if (value !== undefined && (!Number.isInteger(value) || (value as number) < min))
    errors.push(`\`${name}\` must be an integer ≥ ${min} (got ${JSON.stringify(value)}).`);
};

/** Check a config and describe every problem with a fix-it message. */
export function validateConfig(config: DciConfig): ConfigProblems {
  const errors: string[] = [];
  const warnings = unknownKeys(config, TOP_KEYS, '');
  if (config.transport === undefined && !config.endpoint)
    errors.push(
      '`endpoint` or `transport` is required, e.g. `createDci({ endpoint: "/api/dci" })`.',
    );
  if (config.endpoint !== undefined && typeof config.endpoint !== 'string')
    errors.push('`endpoint` must be a URL string.');
  if (config.transport !== undefined && typeof config.transport?.send !== 'function')
    errors.push('`transport` must have a `send(request, { signal })` method.');
  if (config.attribute !== undefined && (typeof config.attribute !== 'string' || !config.attribute))
    errors.push('`attribute` must be a non-empty attribute name, e.g. "data-dci".');
  if (config.infer !== undefined && typeof config.infer !== 'function')
    errors.push('`infer` must be a function `(el) => annotation | null`.');
  oneOf(config.modifier, ['Alt', 'Shift', 'Control', 'Meta'], 'modifier', errors);
  count(config.maxSelection, 'maxSelection', errors, 1);
  count(config.maxTextLength, 'maxTextLength', errors, 1);
  oneOf(config.ancestorData, ['compact', 'full'], 'ancestorData', errors);
  oneOf(config.windowSelectLevel, ['leaf', 'top'], 'windowSelectLevel', errors);
  oneOf(config.theme, ['light', 'dark', 'auto'], 'theme', errors);
  for (const key of ['root', 'container'] as const)
    if (config[key] !== undefined && !(config[key] instanceof Element))
      errors.push(`\`${key}\` must be a DOM element.`);
  if (config.overlay) {
    warnings.push(...unknownKeys(config.overlay, ['mode', 'labels'], 'overlay.'));
    oneOf(config.overlay.mode, ['boxes', 'outline'], 'overlay.mode', errors);
    oneOf(config.overlay.labels, ['hover', 'all', 'none'], 'overlay.labels', errors);
  }
  const chat = config.chat;
  if (chat) {
    warnings.push(...unknownKeys(chat, CHAT_KEYS, 'chat.'));
    oneOf(chat.mode, ['popover', 'panel'], 'chat.mode', errors);
    oneOf(chat.side, ['left', 'right'], 'chat.side', errors);
    oneOf(chat.anchor, ['primary', 'selection'], 'chat.anchor', errors);
    oneOf(chat.autoOpen, ['onSelect', 'onAction', false], 'chat.autoOpen', errors);
    oneOf(chat.contextMode, ['turn', 'cumulative'], 'chat.contextMode', errors);
    oneOf(chat.concurrency, ['block', 'queue'], 'chat.concurrency', errors);
    count(chat.maxChips, 'chat.maxChips', errors);
    count(chat.maxActions, 'chat.maxActions', errors);
    count(chat.panelWidth, 'chat.panelWidth', errors, 1);
  }
  if (config.actions !== undefined && typeof config.actions !== 'function') {
    for (const [type, list] of Object.entries(config.actions))
      if (
        !Array.isArray(list) ||
        list.some((a) => !a || typeof a.id !== 'string' || typeof a.label !== 'string')
      )
        errors.push(`\`actions.${type}\` must be an array of \`{ id, label }\` objects.`);
  }
  return { errors, warnings };
}
