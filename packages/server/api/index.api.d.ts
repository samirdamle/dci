import { DciRequest, DciContextNode } from '@samirdamle/dci-protocol';
export { DciContextNode, DciEvent, DciRequest } from '@samirdamle/dci-protocol';
export { D as DciHandlerFn, a as DciHandlerOptions, b as DciStream, c as DciStreamOptions, S as SSE_HEADERS, W as WebHandler, d as createDciStream, e as dciHandler } from './handler-5_jcYwh9.js';

/** A request DCI can't handle; `status` is the HTTP status to answer with. */
declare class DciRequestError extends Error {
    readonly status: number;
    readonly code: string;
    readonly issues: string[];
    constructor(message: string, status: number, code: string, issues?: string[]);
}

/**
 * Read and validate a DCI request. Throws `DciRequestError`: 405 for a
 * non-POST, 415 for a non-JSON body, 400 for invalid JSON or fields, and
 * 400 with code `unsupported_version` for an unknown protocol version.
 */
declare function parseDciRequest(request: Request): Promise<DciRequest>;

type ContextStyle = 'xml' | 'json' | 'markdown';
interface FormatOptions {
    /** Default `'xml'`: tagged sections, which work well with Claude. */
    style?: ContextStyle;
}
/**
 * Turn selected context into a block for an LLM prompt, using labels, types,
 * ancestor paths and data. Put it next to the user's question.
 */
declare function formatContextForPrompt(context: DciContextNode[], { style }?: FormatOptions): string;

/**
 * Helpers for DCI endpoints: request parsing, event streaming and prompt formatting.
 * Web-standard, so they run on Node, Bun, Deno and edge runtimes.
 *
 * @packageDocumentation
 * @module @samirdamle/dci-server
 */
/** Package version. */
declare const VERSION = "0.0.0";

export { type ContextStyle, DciRequestError, type FormatOptions, VERSION, formatContextForPrompt, parseDciRequest };
