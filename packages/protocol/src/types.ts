/** Wire-protocol major version. Requests carry it as `v`. */
export const PROTOCOL_VERSION = 1;

/** Compact reference to an ancestor, root first. */
export interface DciAncestor {
  id?: string;
  type?: string;
  label?: string;
  data?: Record<string, unknown>;
  /** Set (alone) when the ancestor is private: nothing else about it is sent. */
  private?: true;
}

/** What DCI captures about an element that has no `data-dci`. */
export interface DciFallbackInfo {
  tagName: string;
  /** Whitespace-collapsed, truncated `innerText`. */
  text?: string;
  ariaLabel?: string;
  alt?: string;
  title?: string;
  href?: string;
  /** Form field value. Never read from password inputs. */
  value?: string;
  /** Short CSS path, e.g. `main > table.invoices > tbody > tr:nth-child(3)`. */
  path: string;
}

/** One end of a serialized text range: the CSS path of the endpoint's container element plus the character offset within that container's collapsed-whitespace text. */
export interface DciTextEndpoint {
  path: string;
  offset: number;
}

/** The selected text carried by a `source: 'text'` context node. */
export interface DciTextInfo {
  /** The selected text, whitespace-collapsed, capped at `maxTextSelectionLength`. */
  excerpt: string;
  /** `true` when the selection was longer than the cap. */
  truncated: boolean;
  /** Serialized range endpoints (transport detail for the client's highlight). */
  start: DciTextEndpoint;
  end: DciTextEndpoint;
}

/** A selected node as sent to the backend. */
export interface DciContextNode {
  id?: string;
  type?: string;
  label?: string;
  /**
   * The node's short name in the current selection (`"A"`, `"B"`… or `"1"`,
   * `"2"`…), shown on its badge and chip. The user can refer to it in the prompt:
   * "Compare A and B". Absent when markers are off.
   */
  marker?: string;
  /** Parsed `data-dci` payload with reserved keys removed (empty for fallback nodes). */
  data: Record<string, unknown>;
  ancestors?: DciAncestor[];
  source: 'annotated' | 'fallback' | 'text';
  /** Present only when `source` is `'fallback'`. */
  fallback?: DciFallbackInfo;
  /** Present only when `source` is `'text'`. */
  text?: DciTextInfo;
}

/** Body of `POST {endpoint}`. */
export interface DciRequest {
  /** Protocol version (`PROTOCOL_VERSION`). */
  v: number;
  sessionId: string;
  prompt: string;
  /** Suggested-action id, when the user clicked one. */
  action?: string;
  context: DciContextNode[];
  page: { url: string; title: string };
}

export interface TextDeltaEvent {
  type: 'text-delta';
  text: string;
}
export interface ToolStartEvent {
  type: 'tool-start';
  id: string;
  name: string;
  label?: string;
}
export interface ToolEndEvent {
  type: 'tool-end';
  id: string;
  ok: boolean;
  label?: string;
}
/** The agent asks the page to do something (write-back). */
export interface ClientActionEvent {
  type: 'client-action';
  name: string;
  args: Record<string, unknown>;
}
export interface ErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}
export interface DoneEvent {
  type: 'done';
}
/** App-specific events (`x-…`), passed through to listeners untouched. */
export interface CustomEvent {
  type: `x-${string}`;
  [key: string]: unknown;
}

/** Everything a DCI endpoint can stream back. */
export type DciEvent =
  | TextDeltaEvent
  | ToolStartEvent
  | ToolEndEvent
  | ClientActionEvent
  | ErrorEvent
  | DoneEvent
  | CustomEvent;

export type DciEventType = DciEvent['type'];

/** Standard error codes. Others may be used by backends. */
export const ERROR_CODES = {
  unsupportedVersion: 'unsupported_version',
  badRequest: 'bad_request',
  network: 'network',
  handler: 'handler_error',
} as const;
