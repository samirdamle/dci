import type { Gesture, GestureContext } from './interactions';
import { isEditable, isFromDciUi } from './keys';
import { eventTarget, resolveTarget } from './pointer';
import { selectSameType } from './same-type';

/** How long (ms) a touch must rest on a node to become a long press. */
export const LONG_PRESS_MS = 500;
/** Finger travel (px) that turns a press into a scroll instead of a long press. */
export const LONG_PRESS_SLOP = 10;
/** How long (ms) after a long press its stray click is still swallowed. */
const LONG_PRESS_CLICK_MS = 300;
/** Two taps within this time (ms) and distance (px) are a double tap. */
export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_SLOP = 30;

/** Class on the root while Select mode is on. */
export const SELECT_MODE_CLASS = 'dci-select-mode';

// In Select mode a drag draws the window-select box instead of scrolling,
// and a long press never starts a text selection or the iOS callout.
// Pinch zoom stays available.
const SELECT_MODE_CSS = `
.${SELECT_MODE_CLASS}, .${SELECT_MODE_CLASS} * {
  touch-action: pinch-zoom !important;
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none !important;
}`;

type StyleScope = Document | ShadowRoot;
const sheets = new WeakMap<StyleScope, { sheet: CSSStyleSheet; users: number }>();

/** Where the root's styles apply: its shadow root, or the document. */
const scopeOf = (root: Element): StyleScope => {
  const node = root.getRootNode();
  return node instanceof ShadowRoot ? node : document;
};

// A constructable stylesheet, so it works under a strict CSP (no inline styles).
function acquireStyle(scope: StyleScope) {
  let entry = sheets.get(scope);
  if (!entry) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(SELECT_MODE_CSS);
    scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sheet];
    sheets.set(scope, (entry = { sheet, users: 0 }));
  }
  entry.users++;
}

function releaseStyle(scope: StyleScope) {
  const entry = sheets.get(scope);
  if (!entry || --entry.users > 0) return;
  scope.adoptedStyleSheets = scope.adoptedStyleSheets.filter((s) => s !== entry.sheet);
  sheets.delete(scope);
}

const isTouchLike = (type: string | undefined) => type === 'touch' || type === 'pen';

/**
 * Select mode: while `input.setLocked(true)` holds DCI armed, the root gets
 * touch-friendly CSS (drag selects instead of scrolling), the change is
 * announced, and a double tap selects every node of the same type.
 */
export const selectModeGesture: Gesture = (ctx) => {
  const root = () => ctx.options.root ?? document.body;
  let lastPointerType = '';
  let lastTap: { time: number; x: number; y: number; node: Element } | null = null;
  /** The scope whose stylesheet this instance holds while Select mode is on. */
  let styled: StyleScope | null = null;
  const style = (on: boolean) => {
    if (styled) releaseStyle(styled);
    styled = on ? scopeOf(root()) : null;
    if (styled) acquireStyle(styled);
    root().classList.toggle(SELECT_MODE_CLASS, on);
  };

  const onPointerDown = (e: PointerEvent) => {
    lastPointerType = e.pointerType;
  };
  window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });

  const offLock = ctx.input.onLockChange((locked) => {
    style(locked);
    lastTap = null;
    ctx.bus.emit('selectmode', locked);
    ctx.bus.emit('announce', locked ? 'Select mode on. Tap to select.' : 'Select mode off');
  });

  // Mobile browsers don't reliably fire `dblclick` for taps, so spot double
  // taps here. The first tap falls through to the click gesture.
  const offClick = ctx.input.on('click', (e) => {
    const type = (e as PointerEvent).pointerType || lastPointerType;
    if (!ctx.bindings.selectSameType || !isTouchLike(type)) return;
    const node = resolveTarget(ctx, eventTarget(e));
    const prev = lastTap;
    lastTap = node ? { time: e.timeStamp, x: e.clientX, y: e.clientY, node } : null;
    if (
      !node ||
      !prev ||
      prev.node !== node ||
      e.timeStamp - prev.time > DOUBLE_TAP_MS ||
      Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > DOUBLE_TAP_SLOP
    )
      return;
    lastTap = null;
    return selectSameType(ctx, node).length ? 'consume' : undefined;
  });

  return () => {
    offLock();
    offClick();
    window.removeEventListener('pointerdown', onPointerDown, true);
    style(false);
  };
};

interface Press {
  pointerId: number;
  x: number;
  y: number;
  node: Element;
  timer: ReturnType<typeof setTimeout>;
  fired: boolean;
}

/** The annotated node a touch landed on, if a long press may select it. */
function pressTarget(ctx: GestureContext, e: PointerEvent): Element | null {
  const target = eventTarget(e);
  if (!target || isEditable(target) || isFromDciUi(e)) return null;
  const node = ctx.tree.nearestNode(target);
  const root = ctx.options.root ?? document.body;
  return node && root.contains(node) ? node : null;
}

/**
 * Long-pressing an annotated node on a touch screen turns Select mode on and
 * selects that node. Only annotated nodes take part, so the host app keeps
 * its own long press (text selection, context menu) everywhere else.
 */
export const longPressGesture: Gesture = (ctx) => {
  let press: Press | null = null;

  function cancel() {
    if (press) clearTimeout(press.timer);
    press = null;
  }

  function fire() {
    if (!press || press.fired) return;
    press.fired = true;
    clearTimeout(press.timer);
    window.getSelection()?.removeAllRanges();
    ctx.input.setLocked(true);
    ctx.selection.set([press.node]);
  }

  const onDown = (e: PointerEvent) => {
    cancel();
    if (!ctx.bindings.longPress || e.pointerType !== 'touch' || ctx.input.isLocked()) return;
    const node = pressTarget(ctx, e);
    if (!node) return;
    press = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      node,
      timer: setTimeout(fire, LONG_PRESS_MS),
      fired: false,
    };
  };
  const onMove = (e: PointerEvent) => {
    if (!press || press.fired || e.pointerId !== press.pointerId) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP) cancel();
  };
  const onUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pointerId) return;
    // A browser may still send a click for the press: it isn't a tap.
    if (press.fired) ctx.input.suppressNextClick(LONG_PRESS_CLICK_MS);
    cancel();
  };
  // Android opens the context menu on a long press: the press is ours instead.
  const onContextMenu = (e: Event) => {
    if (!press) return;
    fire();
    e.preventDefault();
  };

  const listeners = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', cancel],
    ['scroll', cancel],
    ['contextmenu', onContextMenu],
  ] as const;
  for (const [type, fn] of listeners) {
    window.addEventListener(type, fn as EventListener, {
      capture: true,
      passive: type !== 'contextmenu',
    });
  }

  return () => {
    cancel();
    for (const [type, fn] of listeners) window.removeEventListener(type, fn as EventListener, true);
  };
};
