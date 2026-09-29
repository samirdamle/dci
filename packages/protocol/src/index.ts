/** Placeholder package version; replaced by real exports in later milestones. */
export const VERSION = '0.0.0';

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
