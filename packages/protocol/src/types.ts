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

/** A selected node as sent to the backend. */
export interface DciContextNode {
  id?: string;
  type?: string;
  label?: string;
  /** Parsed `data-dci` payload with reserved keys removed (empty for fallback nodes). */
  data: Record<string, unknown>;
  ancestors?: DciAncestor[];
  source: 'annotated' | 'fallback';
  /** Present only when `source` is `'fallback'`. */
  fallback?: DciFallbackInfo;
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
