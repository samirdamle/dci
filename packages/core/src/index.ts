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
export {
  createSelectionStore,
  type SelectionChange,
  type SelectionEvents,
  type SelectionLimit,
  type SelectionOptions,
  type SelectionStore,
} from './selection';
export { createEmitter, type Emitter } from './emitter';
export {
  DCI_UI_ATTRIBUTE,
  hasModifier,
  isEditable,
  isFromDciUi,
  matchesCombo,
  type ModifierKey,
} from './keys';
export {
  DEFAULT_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  resolveBindings,
  type Bindings,
  type BindingsConfig,
  type KeyboardBindings,
} from './bindings';
export {
  createInputManager,
  type ArmedEventMap,
  type ArmedEventType,
  type GestureResult,
  type InputManager,
  type InputOptions,
} from './input';
export {
  createInteractions,
  DEFAULT_GESTURES,
  type Gesture,
  type GestureContext,
  type InteractionEvents,
  type InteractionOptions,
  type Interactions,
  type Rect,
} from './interactions';
export { createHoverState, type HoverState } from './hover';
export { clickGesture, eventTarget, hoverGesture, resolveTarget } from './pointer';
export { WHEEL_STEP, wheelGesture, wheelPixels } from './wheel';
export {
  contains,
  hitTest,
  intersects,
  marqueeMode,
  offsetRect,
  rectFromPoints,
  type Candidate,
  type MarqueeMode,
} from './geometry';
export {
  AUTOSCROLL_EDGE,
  AUTOSCROLL_SPEED,
  collectCandidates,
  DRAG_THRESHOLD,
  marqueeGesture,
} from './marquee';
export {
  sameTypeGesture,
  sameTypeNodes,
  selectSameType,
  type SelectSameTypeOptions,
} from './same-type';
export { announceGesture, createAnnouncer, describeNode, nodeName } from './announce';
export { keyboardGesture } from './keyboard';
