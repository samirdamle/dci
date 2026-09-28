import { hasModifier } from './keys';
import type { Gesture, GestureContext } from './interactions';

/** The element an event really hit, looking through open shadow roots. */
export function eventTarget(e: Event): Element | null {
  const first = e.composedPath()[0] ?? e.target;
  if (first instanceof Element) return first;
  return first instanceof Node ? first.parentElement : null;
}

function withinRoot(el: Element, root: Element): boolean {
  for (let cur: Node | null = el; cur;) {
    if (cur === root) return true;
    cur = cur instanceof ShadowRoot ? cur.host : cur.parentNode;
  }
  return false;
}

/**
 * The DCI node for a pointer target: the nearest annotated node, or with
 * `fallback` on, the raw element itself (when inside the root).
 */
export function resolveTarget(ctx: GestureContext, target: Element | null): Element | null {
  if (!target) return null;
  const node = ctx.tree.nearestNode(target);
  if (node) return node;
  const root = ctx.options.root ?? document.body;
  const fallback = ctx.options.fallback ?? true;
  return fallback && target !== root && withinRoot(target, root) ? target : null;
}

/** Hover preview: while armed, track the node under the pointer once per frame. */
export const hoverGesture: Gesture = (ctx) => {
  let pending: PointerEvent | null = null;
  let frame = 0;

  const flush = () => {
    frame = 0;
    if (pending) ctx.hover.setLeaf(resolveTarget(ctx, eventTarget(pending)));
    pending = null;
  };

  const offMove = ctx.input.on('pointermove', (e) => {
    pending = e;
    if (!frame) frame = requestAnimationFrame(flush);
  });
  const offArm = ctx.input.onArmChange((armed) => {
    if (armed) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
    ctx.hover.setLeaf(null);
  });

  return () => {
    offMove();
    offArm();
    if (frame) cancelAnimationFrame(frame);
  };
};

/**
 * Mod+Click selects (replacing the selection); Mod+<toggle>+Click toggles.
 * When Mod+Wheel moved the hover target up, the click uses that target.
 */
export const clickGesture: Gesture = (ctx) =>
  ctx.input.on('click', (e) => {
    if (e.button !== 0) return;
    const { bindings, selection, hover, options } = ctx;
    const leaf = resolveTarget(ctx, eventTarget(e));
    const node = leaf && leaf === hover.leaf() ? hover.node() : leaf;
    const toggle = bindings.toggle !== false && hasModifier(e, bindings.toggle);
    const result = options.passthroughClicks ? 'handled' : 'consume';

    if (toggle) {
      if (!node) return;
      selection.toggle(node);
      return result;
    }
    if (!bindings.select) return;
    if (node) selection.set([node]);
    else if (options.clearOnEmptyClick ?? true) selection.clear();
    else return;
    return result;
  });
