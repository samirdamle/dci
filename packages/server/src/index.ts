/** Placeholder package version; replaced by real exports in later milestones. */
export const VERSION = '0.0.0';

export { DciRequestError } from './errors';
export { parseDciRequest } from './parse';
export { createDciStream, SSE_HEADERS, type DciStream, type DciStreamOptions } from './stream';
export { dciHandler, type DciHandlerFn, type DciHandlerOptions, type WebHandler } from './handler';
export { formatContextForPrompt, type ContextStyle, type FormatOptions } from './format';
export type { DciContextNode, DciEvent, DciRequest } from '@dci/protocol';
