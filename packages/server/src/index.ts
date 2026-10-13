/**
 * Helpers for DCI endpoints: request parsing, event streaming and prompt formatting.
 * Web-standard, so they run on Node, Bun, Deno and edge runtimes.
 *
 * @packageDocumentation
 * @module @samirdamle/dci-server
 */

/** Package version. */
export const VERSION: string = '1.1.0';

export { DciRequestError } from './errors';
export { parseDciRequest } from './parse';
export { createDciStream, SSE_HEADERS, type DciStream, type DciStreamOptions } from './stream';
export { dciHandler, type DciHandlerFn, type DciHandlerOptions, type WebHandler } from './handler';
export { formatContextForPrompt, type ContextStyle, type FormatOptions } from './format';
export type { DciContextNode, DciEvent, DciRequest } from '@samirdamle/dci-protocol';
