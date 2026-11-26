import { hasModifier } from './keys';
import type { Gesture, GestureContext } from './interactions';
import { rangeContainsPoint, type TextSelectionItem } from './text-pill';

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

/** Whether `el` sits inside the instance's root (through shadow roots). */
export const inRoot = (ctx: Pick<GestureContext, 'options'>, el: Element | null): boolean =>
  !!el && withinRoot(el, ctx.options.root ?? document.body);

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
 * Alt+Click on a live text range (spec §3.2, §4.3). Capture-on-pointerdown:
 * the Phase 0 spike proved the native range is intact at pointerdown in
 * Chromium, Firefox and WebKit, and that the marquee gesture's pointerdown
 * `preventDefault()` is what keeps it alive past the click — so the range
 * is read here, at pointerdown, never on a delay, and the snapshot is held
 * until the click that follows. The click handler runs before
 * `clickGesture` (this gesture is registered before it in
 * `DEFAULT_GESTURES`): when a pending snapshot exists it adds the text
 * item instead of selecting the node, and consumes the click so the node
 * is never selected. An Alt+Click outside the live range leaves `pending`
 * empty and behaves exactly as today.
 */
export const textPointerGesture: Gesture = (ctx) => {
  let pending: TextSelectionItem | null = null;

  const offDown = ctx.input.on('pointerdown', (e) => {
    pending = null;
    const plumbing = ctx.textSelection;
    if (!plumbing?.enabled || e.button !== 0) return;
    const item = plumbing.getLiveItem();
    if (!item) return;
    if (!rangeContainsPoint(item.range, e.clientX, e.clientY, e.target)) return;
    // Snapshot now: by click time the range may have collapsed in some
    // browsers, and the marquee handler's preventDefault() (which runs
    // after this handler) is what preserves it in the meantime.
    pending = item;
    return 'handled';
  });

  const offClick = ctx.input.on('click', (e) => {
    if (!pending || e.button !== 0) return;
    const item = pending;
    pending = null;
    const plumbing = ctx.textSelection;
    if (!plumbing?.enabled) return;
    if (plumbing.addItem(item)) {
      const marker = item.node.marker;
      ctx.bus.emit(
        'announce',
        marker ? `Selected text added to chat, marker ${marker}` : 'Selected text added to chat',
      );
    }
    return 'consume';
  });

  // A marquee drag produces no click (the input manager swallows it), so
  // a snapshot can linger after a drag — but every pointerdown resets it
  // before any click can run, so a stale snapshot can never be captured.
  // (Do NOT clear it on pointerup: click fires after pointerup.)
  return () => {
    offDown();
    offClick();
    pending = null;
  };
};

/**
 * Mod+Click selects (replacing the selection); Mod+<toggle>+Click toggles.
 * In Select mode every click (tap) toggles, so taps build up a selection.
 * When Mod+Wheel moved the hover target up, the click uses that target.
 */
export const clickGesture: Gesture = (ctx) =>
  ctx.input.on('click', (e) => {
    if (e.button !== 0) return;
    const { bindings, selection, hover, options } = ctx;
    const leaf = resolveTarget(ctx, eventTarget(e));
    const node = leaf && leaf === hover.leaf() ? hover.node() : leaf;
    const selectMode = ctx.input.isLocked();
    const toggle = selectMode || (bindings.toggle !== false && hasModifier(e, bindings.toggle));
    const result = options.passthroughClicks ? 'handled' : 'consume';

    if (toggle && node) {
      selection.toggle(node);
      return result;
    }
    if (toggle && !selectMode) return;
    if (!bindings.select && !selectMode) return;
    if (node) selection.set([node]);
    // Only empty space inside our root clears: outside it belongs to the page
    // (or to another DCI instance with its own root).
    else if ((options.clearOnEmptyClick ?? true) && inRoot(ctx, eventTarget(e))) selection.clear();
    else return;
    return result;
  });
