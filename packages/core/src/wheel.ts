import type { Gesture } from './interactions';

/** Scroll distance (px) per level. Trackpads send many small deltas. */
export const WHEEL_STEP = 40;

const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 800;

/** Normalize a wheel delta to pixels. */
export function wheelPixels(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  if (e.deltaMode === 1) return e.deltaY * LINE_HEIGHT;
  if (e.deltaMode === 2) return e.deltaY * PAGE_HEIGHT;
  return e.deltaY;
}

/**
 * Mod+Wheel moves the hover target along its DCI chain: wheel up toward the
 * root, wheel down back toward the leaf under the pointer. Deltas accumulate
 * so one level is one `WHEEL_STEP`, and the page never scrolls while armed.
 */
export const wheelGesture: Gesture = (ctx) => {
  let accumulated = 0;
  let leaf: Element | null = null;

  const offWheel = ctx.input.on('wheel', (e) => {
    if (!ctx.bindings.wheelTraverse) return;
    const current = ctx.hover.leaf();
    if (current !== leaf) {
      leaf = current;
      accumulated = 0;
    }
    if (current) {
      accumulated += wheelPixels(e);
      const steps = Math.trunc(accumulated / WHEEL_STEP);
      if (steps) {
        accumulated -= steps * WHEEL_STEP;
        // Wheel up (negative delta) climbs toward the root.
        ctx.hover.setDepth(ctx.hover.depth() - steps);
      }
    }
    return 'consume';
  });
  const offArm = ctx.input.onArmChange(() => {
    accumulated = 0;
    leaf = null;
  });

  return () => {
    offWheel();
    offArm();
  };
};
