import type { InteractionEvents } from './interactions';
import type { Emitter } from './emitter';
import type { DciTree } from './tree';

/**
 * The hover target shared by gestures: the leaf under the pointer, plus an
 * optional depth offset (Mod+Wheel) that moves the target up its DCI chain.
 */
export interface HoverState {
  /** Node resolved directly under the pointer. */
  leaf(): Element | null;
  /** Current target: `leaf` moved up `depth` levels. */
  node(): Element | null;
  depth(): number;
  /** Targets from the leaf (index 0) up to the top-level node. */
  chain(): Element[];
  /** Point at a new leaf; resets the depth when the leaf changes. */
  setLeaf(leaf: Element | null): void;
  /** Move up (`> 0`) the chain, clamped to its ends. */
  setDepth(depth: number): void;
}

export function createHoverState(tree: DciTree, bus: Emitter<InteractionEvents>): HoverState {
  let chain: Element[] = [];
  let depth = 0;

  const node = () => chain[depth] ?? null;
  const emit = () => bus.emit('hover', { node: node(), depth });

  function buildChain(leaf: Element): Element[] {
    const out = [leaf];
    for (let p = tree.parentNode(leaf); p; p = tree.parentNode(p)) out.push(p);
    return out;
  }

  return {
    leaf: () => chain[0] ?? null,
    node,
    depth: () => depth,
    chain: () => chain.slice(),
    setLeaf(leaf) {
      if (leaf === (chain[0] ?? null)) return;
      chain = leaf ? buildChain(leaf) : [];
      depth = 0;
      emit();
    },
    setDepth(next) {
      const clamped = Math.max(0, Math.min(next, chain.length - 1));
      if (clamped === depth || !chain.length) return;
      depth = clamped;
      emit();
    },
  };
}
