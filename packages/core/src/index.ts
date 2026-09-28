/** Placeholder package version; replaced by real exports in later milestones. */
export const VERSION = '0.0.0';

export {
  DEFAULT_ATTRIBUTE,
  isDciElement,
  parseDciAttribute,
  readDci,
  type ParseOptions,
  type ParsedDci,
} from './parse';
export type { Warn } from './env';
export { createDciTree, type DciTree, type TreeOptions } from './tree';
export {
  cssPath,
  toContextNode,
  truncateText,
  type ContextOptions,
  type DciAncestor,
  type DciContextNode,
  type DciFallbackInfo,
} from './context';
