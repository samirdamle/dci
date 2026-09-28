import { resolveBindings, type Bindings, type BindingsConfig } from './bindings';
import { createEmitter, type Emitter } from './emitter';
import { createInputManager, type InputManager } from './input';
import type { ModifierKey } from './keys';
import { createSelectionStore, type SelectionOptions, type SelectionStore } from './selection';
import { createDciTree, type DciTree } from './tree';

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
}

export interface InteractionOptions extends SelectionOptions {
  /** Key that arms DCI. Default `'Alt'`. */
  modifier?: ModifierKey;
  bindings?: BindingsConfig;
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
}

/** A gesture wires itself to the context and returns its cleanup. */
export type Gesture = (ctx: GestureContext) => () => void;

export interface Interactions extends GestureContext {
  destroy(): void;
}

/** Built-in gestures, filled in as each M2 task lands. */
export const DEFAULT_GESTURES: Gesture[] = [];

/**
 * Wire the input manager, DCI tree, selection store and gesture modules
 * together. Every piece is exposed so hosts can listen, extend or replace it.
 */
export function createInteractions(options: InteractionOptions = {}): Interactions {
  const bus = createEmitter<InteractionEvents>();
  const input = createInputManager({ modifier: options.modifier ?? 'Alt' });
  const ctx: GestureContext = {
    options,
    bindings: resolveBindings(options.bindings),
    input,
    tree: createDciTree(options),
    selection: createSelectionStore(options),
    bus,
  };
  const offArm = input.onArmChange((armed) => bus.emit('arm', armed));
  const cleanups = (options.gestures ?? DEFAULT_GESTURES).map((gesture) => gesture(ctx));

  return {
    ...ctx,
    destroy() {
      for (const cleanup of cleanups) cleanup();
      offArm();
      input.destroy();
      ctx.selection.destroy();
      bus.clear();
    },
  };
}
