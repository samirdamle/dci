import { resolveBindings, type Bindings, type BindingsConfig } from './bindings';
import { createEmitter, type Emitter } from './emitter';
import { announceGesture } from './announce';
import { createHoverState, type HoverState } from './hover';
import { createInputManager, type InputManager } from './input';
import type { ModifierKey } from './keys';
import { clickGesture, hoverGesture } from './pointer';
import { keyboardGesture } from './keyboard';
import { marqueeGesture } from './marquee';
import type { LabelMode, OverlayMode } from './overlay';
import { overlayGesture } from './overlay-gesture';
import { sameTypeGesture, selectSameType, type SelectSameTypeOptions } from './same-type';
import { wheelGesture } from './wheel';
import { createSelectionStore, type SelectionOptions, type SelectionStore } from './selection';
import { createDciTree, type DciTree } from './tree';
import type { Theme } from './ui-host';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** State emitted for the overlay (M3). Gestures render nothing themselves. */
export interface InteractionEvents {
  /** Modifier pressed (`true`) or released (`false`). */
  arm: boolean;
  /** Hover preview target; `depth` is how many levels Mod+Wheel moved above the leaf. */
  hover: { node: Element | null; depth: number };
  /** Window-select rectangle in viewport coordinates, or `null` when the drag ends. */
  marquee: { rect: Rect; mode: 'contain' | 'touch' } | null;
  /** Nodes currently inside the marquee, before release. */
  marqueePreview: Element[];
  /** Keyboard navigation hit an edge of the tree. */
  navboundary: { direction: 'parent' | 'child' | 'prev' | 'next' };
  /** Text for the polite live region. */
  announce: string;
  /** Pulse an element in the overlay (e.g. hovering a context chip). */
  flash: Element;
}

export interface OverlayConfig {
  /** `'boxes'` (default) or the lightweight `'outline'` mode. */
  mode?: OverlayMode;
  /** Which boxes get a name tag. Default `'hover'` (hover and primary). */
  labels?: LabelMode;
  /** Default `'auto'` (follows `prefers-color-scheme`). */
  theme?: Theme;
  /** Where the `<dci-root>` UI host is appended. Default `document.body`. */
  container?: Element;
}

export interface InteractionOptions extends SelectionOptions {
  /** Built-in highlight overlay; `false` to render your own from the bus events. */
  overlay?: OverlayConfig | false;
  /** Key that arms DCI. Default `'Alt'`. */
  modifier?: ModifierKey;
  bindings?: BindingsConfig;
  /** Mod+Click on empty space clears the selection. Default `true`. */
  clearOnEmptyClick?: boolean;
  /** Let DCI clicks reach the host app too. Default `false` (they are swallowed). */
  passthroughClicks?: boolean;
  /**
   * Called on Esc before the selection is cleared. Return `true` when it
   * handled the key (e.g. closed the chat), so the selection is kept.
   */
  onEscape?: () => boolean;
  /** Window select picks the innermost (`'leaf'`, default) or outermost (`'top'`) matches. */
  windowSelectLevel?: 'leaf' | 'top';
  /** Gesture modules to attach. Defaults to every built-in gesture. */
  gestures?: Gesture[];
}

export interface GestureContext {
  options: InteractionOptions;
  bindings: Bindings;
  input: InputManager;
  tree: DciTree;
  selection: SelectionStore;
  bus: Emitter<InteractionEvents>;
  hover: HoverState;
}

/** A gesture wires itself to the context and returns its cleanup. */
export type Gesture = (ctx: GestureContext) => () => void;

export interface Interactions extends GestureContext {
  /** Select all same-type siblings of `node` (default: the primary node). */
  selectSameType(node?: Element | null, options?: SelectSameTypeOptions): Element[];
  destroy(): void;
}

/** Built-in gestures and the overlay that draws their state. */
export const DEFAULT_GESTURES: Gesture[] = [
  hoverGesture,
  clickGesture,
  wheelGesture,
  marqueeGesture,
  sameTypeGesture,
  keyboardGesture,
  announceGesture,
  overlayGesture,
];

/**
 * Wire the input manager, DCI tree, selection store and gesture modules
 * together. Every piece is exposed so hosts can listen, extend or replace it.
 */
export function createInteractions(options: InteractionOptions = {}): Interactions {
  const bus = createEmitter<InteractionEvents>();
  const input = createInputManager({ modifier: options.modifier ?? 'Alt' });
  const tree = createDciTree(options);
  const ctx: GestureContext = {
    options,
    bindings: resolveBindings(options.bindings),
    input,
    tree,
    selection: createSelectionStore(options),
    bus,
    hover: createHoverState(tree, bus),
  };
  const offArm = input.onArmChange((armed) => bus.emit('arm', armed));
  const cleanups = (options.gestures ?? DEFAULT_GESTURES).map((gesture) => gesture(ctx));

  return {
    ...ctx,
    selectSameType: (node, opts) => selectSameType(ctx, node ?? ctx.selection.primary(), opts),
    destroy() {
      for (const cleanup of cleanups) cleanup();
      offArm();
      input.destroy();
      ctx.selection.destroy();
      bus.clear();
    },
  };
}
