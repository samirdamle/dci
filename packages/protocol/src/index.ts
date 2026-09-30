/**
 * The DCI wire protocol: request and event types, validation, and the SSE encoder and
 * streaming decoder. No dependencies.
 *
 * @packageDocumentation
 * @module @samirdamle/dci-protocol
 */

/** Package version. */
export const VERSION = '1.0.0';

export {
  ERROR_CODES,
  PROTOCOL_VERSION,
  type ClientActionEvent,
  type CustomEvent,
  type DciAncestor,
  type DciContextNode,
  type DciEvent,
  type DciEventType,
  type DciFallbackInfo,
  type DciRequest,
  type DoneEvent,
  type ErrorEvent,
  type TextDeltaEvent,
  type ToolEndEvent,
  type ToolStartEvent,
} from './types';
export {
  isDciRequest,
  isSupportedVersion,
  toEvent,
  validateRequest,
  type ValidationResult,
} from './validate';
export {
  createSSEDecoder,
  decodeSSEStream,
  encodeComment,
  encodeEvent,
  type SSEDecoder,
} from './sse';
