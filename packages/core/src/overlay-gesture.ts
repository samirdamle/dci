import type { Gesture } from './interactions';
import { createOverlay } from './overlay';
import { acquireUiHost } from './ui-host';

/** Draws M2 state (hover, selection, marquee, boundaries) with the overlay. */
export const overlayGesture: Gesture = (ctx) => {
  const config = ctx.options.overlay;
  if (config === false) return () => {};
  const { host, release } = acquireUiHost(config ?? {});
  const attribute = ctx.options.attribute;
  const root = ctx.options.root;
  const overlay = createOverlay(host, {
    ...config,
    ...(attribute ? { attribute } : {}),
    ...(root ? { root } : {}),
  });
  overlay.setSelected(ctx.selection.get(), ctx.selection.primary());

  const offs = [
    ctx.bus.on('hover', ({ node, depth }) => overlay.setHover(node, { depth })),
    ctx.bus.on('marquee', (m) => overlay.setMarquee(m)),
    ctx.bus.on('marqueePreview', (els) => overlay.setPreview(els)),
    ctx.bus.on('navboundary', () => overlay.boundary()),
    ctx.bus.on('flash', (el) => overlay.flash(el)),
    ctx.selection.subscribe(({ elements, primary }) => overlay.setSelected(elements, primary)),
  ];
  return () => {
    offs.forEach((off) => off());
    overlay.destroy();
    release();
  };
};
