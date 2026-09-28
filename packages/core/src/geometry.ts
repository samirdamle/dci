import type { Rect } from './interactions';

export type MarqueeMode = 'contain' | 'touch';

/** Rectangle spanning two points, in any drag direction. */
export function rectFromPoints(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

/** Left→right drags select contained nodes; right→left drags select touched nodes. */
export const marqueeMode = (startX: number, currentX: number): MarqueeMode =>
  currentX >= startX ? 'contain' : 'touch';

export const contains = (outer: Rect, inner: Rect): boolean =>
  inner.left >= outer.left &&
  inner.right <= outer.right &&
  inner.top >= outer.top &&
  inner.bottom <= outer.bottom;

export const intersects = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export const offsetRect = (r: Rect, dx: number, dy: number): Rect => ({
  left: r.left + dx,
  top: r.top + dy,
  right: r.right + dx,
  bottom: r.bottom + dy,
});

export interface Candidate {
  el: Element;
  /** Rect in page coordinates (viewport rect + scroll at measure time). */
  rect: Rect;
  /** Index of the nearest candidate ancestor, or -1. */
  parent: number;
}

/**
 * Candidates hit by `box` in `mode`, reduced to the innermost (`'leaf'`) or
 * outermost (`'top'`) matches. O(n × depth); rects are measured up front.
 */
export function hitTest(
  candidates: Candidate[],
  box: Rect,
  mode: MarqueeMode,
  level: 'leaf' | 'top' = 'leaf',
): Element[] {
  const test = mode === 'contain' ? contains : intersects;
  const hit = candidates.map((c) => (mode === 'contain' ? test(box, c.rect) : test(c.rect, box)));
  const drop = new Array<boolean>(candidates.length).fill(false);
  candidates.forEach((c, i) => {
    if (!hit[i]) return;
    if (level === 'leaf') {
      // A matched node hides every matched ancestor.
      for (let p = c.parent; p >= 0 && !drop[p]; p = candidates[p]!.parent) drop[p] = true;
    } else {
      for (let p = c.parent; p >= 0; p = candidates[p]!.parent) {
        if (hit[p]) {
          drop[i] = true;
          break;
        }
      }
    }
  });
  return candidates.filter((_, i) => hit[i] && !drop[i]).map((c) => c.el);
}
