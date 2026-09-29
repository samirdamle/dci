/** Wire-protocol major version. Requests carry it as `v`. */
declare const PROTOCOL_VERSION = 1;
/** Compact reference to an ancestor, root first. */
interface DciAncestor {
    id?: string;
    type?: string;
    label?: string;
    data?: Record<string, unknown>;
    /** Set (alone) when the ancestor is private: nothing else about it is sent. */
    private?: true;
}
/** What DCI captures about an element that has no `data-dci`. */
interface DciFallbackInfo {
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
interface DciContextNode {
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
interface DciRequest {
    /** Protocol version (`PROTOCOL_VERSION`). */
    v: number;
    sessionId: string;
    prompt: string;
    /** Suggested-action id, when the user clicked one. */
    action?: string;
    context: DciContextNode[];
    page: {
        url: string;
        title: string;
    };
}
interface TextDeltaEvent {
    type: 'text-delta';
    text: string;
}
interface ToolStartEvent {
    type: 'tool-start';
    id: string;
    name: string;
    label?: string;
}
interface ToolEndEvent {
    type: 'tool-end';
    id: string;
    ok: boolean;
    label?: string;
}
/** The agent asks the page to do something (write-back). */
interface ClientActionEvent {
    type: 'client-action';
    name: string;
    args: Record<string, unknown>;
}
interface ErrorEvent {
    type: 'error';
    message: string;
    code?: string;
}
interface DoneEvent {
    type: 'done';
}
/** App-specific events (`x-…`), passed through to listeners untouched. */
interface CustomEvent {
    type: `x-${string}`;
    [key: string]: unknown;
}
/** Everything a DCI endpoint can stream back. */
type DciEvent = TextDeltaEvent | ToolStartEvent | ToolEndEvent | ClientActionEvent | ErrorEvent | DoneEvent | CustomEvent;
type DciEventType = DciEvent['type'];
/** Standard error codes. Others may be used by backends. */
declare const ERROR_CODES: {
    readonly unsupportedVersion: "unsupported_version";
    readonly badRequest: "bad_request";
    readonly network: "network";
    readonly handler: "handler_error";
};

type ValidationResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    issues: string[];
};
/**
 * Check a parsed request body. Unknown extra fields are allowed (additive
 * changes within a version); the version itself is checked by the caller.
 */
declare function validateRequest(x: unknown): ValidationResult<DciRequest>;
declare const isDciRequest: (x: unknown) => x is DciRequest;
/** Whether a request's major version is one this code understands. */
declare const isSupportedVersion: (v: number) => boolean;
/**
 * Build a typed event from a type and a payload, or `null` when the type is
 * unknown or the payload doesn't match (forward compatibility: skip it).
 */
declare function toEvent(type: string, data: unknown): DciEvent | null;

/** Serialize one event as an SSE message: `event: <type>\ndata: <json>\n\n`. */
declare function encodeEvent(event: DciEvent): string;
/** An SSE comment line, used as a keep-alive ping. */
declare const encodeComment: (text?: string) => string;
interface SSEDecoder {
    /** Feed bytes or text; returns the events completed by this chunk. */
    push(chunk: Uint8Array | string): DciEvent[];
    /** Finish the stream; returns any event completed by the end of input. */
    end(): DciEvent[];
}
/**
 * Incremental SSE decoder. Chunks may split anywhere, including inside a
 * multi-byte UTF-8 character or between `\r` and `\n`. Handles CR, LF and
 * CRLF line endings, comment lines, multi-line `data:` and keep-alive pings.
 * Unknown or malformed events are skipped.
 */
declare function createSSEDecoder(): SSEDecoder;
/** Decode a byte stream (e.g. `response.body`) into DCI events. */
declare function decodeSSEStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<DciEvent, void, undefined>;

/**
 * The DCI wire protocol: request and event types, validation, and the SSE encoder and
 * streaming decoder. No dependencies.
 *
 * @packageDocumentation
 * @module @dci/protocol
 */
/** Package version. */
declare const VERSION = "0.0.0";

export { type ClientActionEvent, type CustomEvent, type DciAncestor, type DciContextNode, type DciEvent, type DciEventType, type DciFallbackInfo, type DciRequest, type DoneEvent, ERROR_CODES, type ErrorEvent, PROTOCOL_VERSION, type SSEDecoder, type TextDeltaEvent, type ToolEndEvent, type ToolStartEvent, VERSION, type ValidationResult, createSSEDecoder, decodeSSEStream, encodeComment, encodeEvent, isDciRequest, isSupportedVersion, toEvent, validateRequest };
