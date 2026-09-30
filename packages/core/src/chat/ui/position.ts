import {
  autoUpdate,
  computePosition,
  flip,
  hide,
  offset,
  shift,
  size,
  type VirtualElement,
} from '@floating-ui/dom';

export type AnchorTo = 'primary' | 'selection';

/** Union of the elements' viewport rects. */
export function unionRect(els: Element[]): DOMRect {
  const rects = els.map((el) => el.getBoundingClientRect());
  if (!rects.length) return new DOMRect();
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

export interface Anchoring {
  /** Re-anchor to new targets (an empty list parks the popover in the corner). */
  setTargets(els: Element[]): void;
  /** Offset by a user drag; it survives re-anchoring until `resetNudge`. */
  nudge(dx: number, dy: number): void;
  resetNudge(): void;
  destroy(): void;
}

/**
 * Keeps `floating` next to its targets with floating-ui: it flips, shrinks
 * (`--dci-available-height`) and shifts at viewport edges, follows scroll and
 * resize, and is hidden (via `data-anchor-hidden`) while the targets are
 * scrolled out of view.
 */
export function anchorFloating(floating: HTMLElement): Anchoring {
  let targets: Element[] = [];
  let stop: (() => void) | null = null;
  let dx = 0;
  let dy = 0;

  const reference = (): VirtualElement => ({
    getBoundingClientRect: () => unionRect(targets),
    ...(targets[0] ? { contextElement: targets[0] } : {}),
  });

  async function update() {
    if (!targets.length) return;
    const ref = reference();
    const { x, y, middlewareData } = await computePosition(ref, floating, {
      strategy: 'fixed',
      placement: 'bottom-start',
      middleware: [
        offset(8),
        flip({ padding: 8 }),
        // When neither side has room for the full height, shrink to the side
        // flip chose instead of shifting over the targets.
        size({
          padding: 8,
          apply: ({ availableHeight }) =>
            floating.style.setProperty(
              '--dci-available-height',
              `${Math.floor(availableHeight)}px`,
            ),
        }),
        shift({ padding: 8 }),
        hide(),
      ],
    });
    floating.style.left = `${x}px`;
    floating.style.top = `${y}px`;
    floating.toggleAttribute('data-anchor-hidden', !!middlewareData.hide?.referenceHidden);
  }

  function start() {
    stop?.();
    stop = null;
    floating.toggleAttribute('data-parked', !targets.length);
    if (!targets.length) {
      floating.removeAttribute('data-anchor-hidden');
      floating.style.removeProperty('--dci-available-height');
      floating.style.left = '';
      floating.style.top = '';
      return;
    }
    stop = autoUpdate(reference(), floating, () => void update());
  }

  return {
    setTargets(els) {
      targets = els.filter((el) => el.isConnected);
      start();
    },
    nudge(x, y) {
      dx += x;
      dy += y;
      floating.style.translate = `${dx}px ${dy}px`;
    },
    resetNudge() {
      dx = 0;
      dy = 0;
      floating.style.translate = '';
    },
    destroy() {
      stop?.();
      stop = null;
    },
  };
}
