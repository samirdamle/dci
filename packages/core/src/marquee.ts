import {
  hitTest,
  marqueeMode,
  offsetRect,
  rectFromPoints,
  type Candidate,
  type MarqueeMode,
} from './geometry';
import type { Gesture } from './interactions';
import type { DciTree } from './tree';

/** Pointer travel (px) before a press becomes a drag instead of a click. */
export const DRAG_THRESHOLD = 4;
/** Distance (px) from a viewport edge that starts auto-scrolling. */
export const AUTOSCROLL_EDGE = 24;
/** Maximum auto-scroll speed (px per frame). */
export const AUTOSCROLL_SPEED = 20;

/** Every navigable DCI node under the root, with parent links. */
export function collectCandidates(tree: DciTree, root: Element): Candidate[] {
  const out: Candidate[] = [];
  const visit = (nodes: Element[], parent: number) => {
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      out.push({
        el,
        parent,
        rect: offsetRect(r, window.scrollX, window.scrollY),
      });
      visit(tree.childNodes(el), out.length - 1);
    }
  };
  const top = tree.nearestNode(root) === root ? [root] : tree.childNodes(root);
  visit(top, -1);
  return out;
}

function autoScrollDelta(pos: number, size: number): number {
  if (pos < AUTOSCROLL_EDGE) return -AUTOSCROLL_SPEED * (1 - pos / AUTOSCROLL_EDGE);
  if (pos > size - AUTOSCROLL_EDGE) {
    return AUTOSCROLL_SPEED * (1 - (size - pos) / AUTOSCROLL_EDGE);
  }
  return 0;
}

interface Drag {
  pointerId: number;
  target: Element;
  /** Start point in page coordinates. */
  startX: number;
  startY: number;
  /** Latest pointer position in viewport coordinates. */
  clientX: number;
  clientY: number;
  shift: boolean;
  subtract: boolean;
  started: boolean;
  candidates: Candidate[];
  preview: Element[];
  frame: number;
  dirty: boolean;
}

/**
 * Mod+Drag window select. Left→right selects nodes fully inside the box;
 * right→left selects nodes it touches. Shift adds, Ctrl/Cmd subtracts
 * (whichever isn't the DCI modifier), Esc cancels. Rects are measured once at
 * drag start (and after scrolling), so each frame is a plain rectangle test.
 */
export const marqueeGesture: Gesture = (ctx) => {
  let drag: Drag | null = null;
  // The DCI modifier itself is held throughout, so it can't also mean add or subtract.
  const mod = ctx.input.modifier;
  const adds = (e: PointerEvent) => e.shiftKey && mod !== 'Shift';
  const subtracts = (e: PointerEvent) =>
    (e.ctrlKey && mod !== 'Control') || (e.metaKey && mod !== 'Meta');

  function end(apply: boolean) {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.frame);
    detach();
    try {
      d.target.releasePointerCapture(d.pointerId);
    } catch {
      // Capture may already be gone.
    }
    if (!d.started) return;
    ctx.input.suppressNextClick();
    ctx.bus.emit('marquee', null);
    ctx.bus.emit('marqueePreview', []);
    if (!apply) return;
    if (d.subtract) ctx.selection.remove(d.preview);
    else if (d.shift) ctx.selection.add(d.preview);
    else ctx.selection.set(d.preview);
  }

  function update() {
    if (!drag) return;
    const d = drag;
    d.frame = 0;
    const dx = autoScrollDelta(d.clientX, window.innerWidth);
    const dy = autoScrollDelta(d.clientY, window.innerHeight);
    if (dx || dy) {
      window.scrollBy(dx, dy);
      d.dirty = true;
    }
    if (d.dirty) {
      d.candidates = collectCandidates(ctx.tree, ctx.options.root ?? document.body);
      d.dirty = false;
    }
    const x = d.clientX + window.scrollX;
    const y = d.clientY + window.scrollY;
    const box = rectFromPoints(d.startX, d.startY, x, y);
    const mode: MarqueeMode = marqueeMode(d.startX, x);
    const level = ctx.options.windowSelectLevel ?? 'leaf';
    const preview = hitTest(d.candidates, box, mode, level);
    const viewportBox = offsetRect(box, -window.scrollX, -window.scrollY);
    ctx.bus.emit('marquee', { rect: viewportBox, mode });
    if (preview.length !== d.preview.length || preview.some((el, i) => el !== d.preview[i])) {
      d.preview = preview;
      ctx.bus.emit('marqueePreview', preview);
    }
    // Keep auto-scrolling while the pointer rests near an edge.
    if (dx || dy) schedule();
  }

  function schedule() {
    if (drag && !drag.frame) drag.frame = requestAnimationFrame(update);
  }

  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.clientX = e.clientX;
    drag.clientY = e.clientY;
    drag.shift = adds(e);
    drag.subtract = subtracts(e);
    if (!drag.started) {
      const moved = Math.hypot(
        e.clientX + window.scrollX - drag.startX,
        e.clientY + window.scrollY - drag.startY,
      );
      if (moved <= DRAG_THRESHOLD) return;
      drag.started = true;
      try {
        drag.target.setPointerCapture(drag.pointerId);
      } catch {
        // Not every target supports capture (e.g. detached nodes).
      }
      drag.candidates = collectCandidates(ctx.tree, ctx.options.root ?? document.body);
    }
    schedule();
  };
  const onUp = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) end(true);
  };
  const onCancel = () => end(false);
  const onScroll = () => {
    if (!drag?.started) return;
    drag.dirty = true;
    schedule();
  };

  // Drag listeners exist only between pointerdown and pointerup.
  const listeners = [
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onCancel],
    ['scroll', onScroll],
  ] as const;
  const attach = () => {
    for (const [type, fn] of listeners) window.addEventListener(type, fn as EventListener, true);
  };
  const detach = () => {
    for (const [type, fn] of listeners) window.removeEventListener(type, fn as EventListener, true);
  };

  // After Esc the button is still down: swallow the click its release makes.
  const onReleaseAfterCancel = () => {
    window.removeEventListener('pointerup', onReleaseAfterCancel, true);
    ctx.input.suppressNextClick();
  };

  // Registered before the keyboard gesture, so Esc cancels a drag first.
  const offKey = ctx.input.onKeyDown((e) => {
    if (e.key !== 'Escape' || !drag?.started) return;
    end(false);
    window.addEventListener('pointerup', onReleaseAfterCancel, true);
    return 'consume';
  });

  const offDown = ctx.input.on('pointerdown', (e) => {
    if (!ctx.bindings.windowSelect || e.button !== 0 || drag) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    drag = {
      pointerId: e.pointerId,
      target,
      startX: e.clientX + window.scrollX,
      startY: e.clientY + window.scrollY,
      clientX: e.clientX,
      clientY: e.clientY,
      shift: adds(e),
      subtract: subtracts(e),
      started: false,
      candidates: [],
      preview: [],
      frame: 0,
      dirty: false,
    };
    attach();
    // Stop the browser from starting a text selection; a plain click still follows.
    e.preventDefault();
    return 'handled';
  });

  return () => {
    offDown();
    offKey();
    end(false);
    window.removeEventListener('pointerup', onReleaseAfterCancel, true);
  };
};
