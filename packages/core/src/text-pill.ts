import { isFromDciUi } from './keys';
import type { Gesture } from './interactions';
import type { TextSelectionItem } from './text-selection';
import { acquireUiHost } from './ui-host';

export type { TextSelectionItem } from './text-selection';

/**
 * The text-selection plumbing `createDci()` builds from agent A's
 * `captureTextRange` / selection store / highlight module and hands to the
 * gestures through `GestureContext.textSelection`. Every method reads the
 * live native selection at call time — never on a delay (spec §4.3).
 */
export interface TextSelectionPlumbing {
  /** `false` when `textSelection: false` — every gesture becomes a no-op. */
  enabled: boolean;
  /** `maxTextSelectionLength` (default 2000). */
  maxLength: number;
  /** Pill label when the chat is closed (config `textSelectionAction`). */
  actionLabel: string;
  /** The live native selection as a text item, or `null` when invalid. */
  getLiveItem(): TextSelectionItem | null;
  /** Whether a live valid text range exists right now. */
  hasLiveRange(): boolean;
  /** Capture the live range now; `null` when there is none / it is invalid. */
  captureLive(): TextSelectionItem | null;
  /** Add an already-captured item (the Alt+Click pointerdown snapshot). */
  addItem(item: TextSelectionItem): boolean;
  /** Whether the chat popover/panel is currently open. */
  isChatOpen(): boolean;
  /** Open the chat (focus moves to its input, as `controller.open()` does). */
  openChat(): void;
}

export interface TextPillOptions {
  /** The plumbing built by `createDci()`; `undefined` disables the pill. */
  plumbing?: TextSelectionPlumbing;
  /** Emit a polite announcement (the interaction bus). */
  announce?: (text: string) => void;
  /** Where the `<dci-root>` host lives. Default `document.body`. */
  container?: Element;
}

export interface TextPill {
  /** Whether the pill is currently shown. */
  readonly visible: boolean;
  /** Re-check the live selection and show/hide the pill accordingly. */
  refresh(): void;
  /** Hide the pill now. Returns whether it was visible. */
  hide(): boolean;
  destroy(): void;
}

export const TEXT_PILL_CSS = `
.text-pill {
  position: fixed; z-index: 1; display: none;
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--dci-border);
  background: var(--dci-accent); color: var(--dci-on-accent);
  box-shadow: var(--dci-shadow);
  font: 600 13px/1.4 var(--dci-font, system-ui, sans-serif);
  cursor: pointer; white-space: nowrap;
}
.text-pill[data-visible='true'] { display: block; }
.text-pill:hover { filter: brightness(1.08); }
`;

const PILL_GAP_PX = 8;
const PILL_EDGE_PX = 8;
/** Fallback pill width (px) when layout gives none (e.g. happy-dom). */
const PILL_WIDTH_FALLBACK = 160;
/** Fallback pill height (px) when layout gives none. */
const PILL_HEIGHT_FALLBACK = 32;

function excerptOf(item: TextSelectionItem): string {
  const excerpt = item.node.text?.excerpt ?? item.node.label ?? item.range.toString();
  return excerpt.replace(/\s+/g, ' ').trim();
}

function charCountOf(item: TextSelectionItem): number {
  return (item.node.text?.excerpt ?? item.range.toString()).length;
}

/** Whether `node` sits inside an editable field or DCI's own UI. */
export function isTextSelectionTarget(node: Node | null): boolean {
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof Element) {
      if (cur.hasAttribute('data-dci-ui')) return false;
      if (cur instanceof HTMLInputElement && cur.type !== 'button') return false;
      if (cur instanceof HTMLTextAreaElement || cur instanceof HTMLSelectElement) return false;
      if (cur instanceof HTMLElement && cur.isContentEditable) return false;
      if (cur.getAttribute('contenteditable') === 'true') return false;
    }
    cur = cur.parentNode ?? (cur instanceof ShadowRoot ? cur.host : null);
  }
  return true;
}

/**
 * Whether an event target counts as inside `range` when there is no layout
 * to test against: the target is the range's container element, or inside
 * it. (An ancestor of the container, such as `<body>`, does not count —
 * every click on the page would otherwise be "inside the selection".)
 */
export function rangeContainsTarget(range: Range, target: Node): boolean {
  const ancestor = range.commonAncestorContainer;
  if (ancestor instanceof Element) return ancestor === target || ancestor.contains(target);
  const container = ancestor.parentElement;
  return !!container && (container === target || container.contains(target));
}

/**
 * Whether a point (viewport coordinates) lies inside `range`. Uses the
 * range's client rects when layout exists; without layout (happy-dom) falls
 * back to whether the event target sits inside the range's common ancestor.
 */
export function rangeContainsPoint(
  range: Range,
  x: number,
  y: number,
  target?: EventTarget | null,
): boolean {
  try {
    const rects = range.getClientRects();
    for (const rect of rects) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
    }
    if (rects.length) return false;
  } catch {
    // No layout: fall through to the target check.
  }
  if (target instanceof Node) return rangeContainsTarget(range, target);
  return false;
}

/**
 * The floating pill: a real `<button>` in the Shadow DOM chat layer, shown
 * on selection settle next to a valid text range. Tapping it captures the
 * range; if no chat is open the chat opens with focus on the input, if one
 * is open the item is added silently. It never auto-sends.
 */
export function createTextPill(options: TextPillOptions): TextPill {
  const plumbing = options.plumbing;
  const { host, release } = acquireUiHost({
    ...(options.container ? { container: options.container } : {}),
  });
  const removeStyles = host.addStyles(TEXT_PILL_CSS);
  const layer = host.layer('chat');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-pill';
  button.setAttribute('data-visible', 'false');
  layer.appendChild(button);

  let visible = false;
  let shownItem: TextSelectionItem | null = null;
  let destroyed = false;
  let settleFrame = 0;
  /** A mouse/touch press is in progress: the selection has not settled yet. */
  let pressing = false;

  function label(open: boolean): string {
    return open ? '+ Add to chat' : (plumbing?.actionLabel ?? 'Ask about this');
  }

  function accessibleName(open: boolean): string {
    return open ? 'Add selection to chat' : 'Ask about this selection';
  }

  function position(item: TextSelectionItem) {
    let rect: DOMRect;
    try {
      rect = item.range.getBoundingClientRect();
    } catch {
      return false;
    }
    // No layout yet (or a zero-size range): keep the pill hidden rather
    // than guessing a position.
    if (!rect || (rect.width === 0 && rect.height === 0)) return false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) return false;
    const width = button.offsetWidth || PILL_WIDTH_FALLBACK;
    const height = button.offsetHeight || PILL_HEIGHT_FALLBACK;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, PILL_EDGE_PX),
      Math.max(vw - width - PILL_EDGE_PX, PILL_EDGE_PX),
    );
    const above = rect.top - height - PILL_GAP_PX;
    const top = above >= 0 ? above : rect.bottom + PILL_GAP_PX;
    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
    return true;
  }

  function show(item: TextSelectionItem) {
    const open = plumbing?.isChatOpen() ?? false;
    const excerpt = excerptOf(item);
    const count = charCountOf(item);
    button.textContent = label(open);
    button.setAttribute('aria-label', accessibleName(open));
    button.title = excerpt ? `“${excerpt}” (${count} characters)` : `${count} characters`;
    if (!position(item)) {
      hide();
      return;
    }
    shownItem = item;
    visible = true;
    button.setAttribute('data-visible', 'true');
  }

  function hide(): boolean {
    if (!visible) return false;
    visible = false;
    shownItem = null;
    button.setAttribute('data-visible', 'false');
    return true;
  }

  /** Show the pill for the live range, or hide it when there is none. */
  function refresh() {
    if (destroyed || !plumbing?.enabled || pressing) {
      if (pressing) hide();
      return;
    }
    const item = plumbing.getLiveItem();
    if (!item) {
      hide();
      return;
    }
    // Never for selections inside DCI's own UI or editable fields.
    const anchor = item.range.startContainer;
    if (!isTextSelectionTarget(anchor)) {
      hide();
      return;
    }
    show(item);
  }

  /** Settle after mouseup / `selectionchange`: wait a frame, then refresh. */
  function scheduleRefresh() {
    if (settleFrame) return;
    const run = () => {
      settleFrame = 0;
      refresh();
    };
    settleFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : 0;
    if (!settleFrame) setTimeout(run, 0);
  }

  function onSelectionChange() {
    if (!visible) {
      scheduleRefresh();
      return;
    }
    // The live selection collapsed or moved: hide, or re-position if it is
    // still the same range.
    const item = plumbing?.getLiveItem() ?? null;
    if (!item || item.key !== shownItem?.key) {
      hide();
      scheduleRefresh();
      return;
    }
    position(item);
  }

  function onPointerDown(e: PointerEvent) {
    if (!visible) return;
    // `e.target` is retargeted to the `<dci-root>` host for presses inside
    // the Shadow DOM, so `button.contains(e.target)` is never true for a
    // press on the pill itself — the pill would hide on pointerdown, the
    // mouseup would land on the page, and the button would never receive
    // the click. Read the real target from the composed path instead.
    const target = (e.composedPath()[0] as Node | null) ?? (e.target as Node | null);
    if (target && button.contains(target)) return;
    // A press inside the selection itself keeps the pill.
    if (shownItem && target instanceof Node && rangeContainsTarget(shownItem.range, target)) return;
    hide();
  }

  function onScrollResize() {
    if (!visible || !shownItem) return;
    if (!position(shownItem)) hide();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !visible) return;
    // Window capture: runs before the chat root's own Esc handler, so the
    // first Esc dismisses the pill before the chat closes (spec §4.4).
    hide();
    e.preventDefault();
    e.stopPropagation();
  }

  async function onTap() {
    if (!plumbing?.enabled || !shownItem) return;
    const item = plumbing.captureLive();
    hide();
    if (!item) return;
    const marker = item.node.marker;
    if (!plumbing.isChatOpen()) plumbing.openChat();
    options.announce?.(
      marker ? `Selected text added to chat, marker ${marker}` : 'Selected text added to chat',
    );
  }

  function onPressStart() {
    pressing = true;
  }

  function onPressEnd() {
    pressing = false;
    scheduleRefresh();
  }

  button.addEventListener('click', () => void onTap());
  document.addEventListener('selectionchange', onSelectionChange);
  window.addEventListener('pointerdown', onPressStart, true);
  window.addEventListener('mouseup', onPressEnd, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('scroll', onScrollResize, true);
  window.addEventListener('resize', onScrollResize);
  window.addEventListener('keydown', onKeyDown, true);

  return {
    get visible() {
      return visible;
    },
    refresh,
    hide,
    destroy() {
      destroyed = true;
      if (settleFrame && typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(settleFrame);
      settleFrame = 0;
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('pointerdown', onPressStart, true);
      window.removeEventListener('mouseup', onPressEnd, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('keydown', onKeyDown, true);
      button.remove();
      removeStyles();
      release();
    },
  };
}

/**
 * Gesture wiring for the pill. It never appears during an Alt-armed drag
 * (Alt+Drag window select) or in Select mode, and it never appears for
 * selections inside DCI's own UI or editable fields. Esc is coordinated
 * through the existing `onEscape` chain: the pill wraps it, so the first
 * Esc dismisses a visible pill before the chat closes or the selection
 * clears (spec §4.4).
 */
export const textPillGesture: Gesture = (ctx) => {
  const plumbing = ctx.textSelection;
  if (!plumbing) return () => {};
  const pill = createTextPill({
    plumbing,
    announce: (text) => ctx.bus.emit('announce', text),
  });

  // Belt and braces for the Esc path that runs through the keyboard
  // gesture (`onEscape` → chat close → selection clear): the pill goes
  // first. `createDci` builds fresh options per rebuild, so this wrap
  // cannot stack across rebuilds.
  const originalOnEscape = ctx.options.onEscape;
  ctx.options.onEscape = () => {
    if (pill.visible) {
      pill.hide();
      return true;
    }
    return originalOnEscape?.() ?? false;
  };

  // While Alt is held a drag is a window select, never a text selection;
  // in Select mode a drag draws the marquee box. Hide the pill in both.
  const offArm = ctx.input.onArmChange((armed) => {
    if (armed) pill.hide();
  });
  const offLock = ctx.input.onLockChange((locked) => {
    if (locked) pill.hide();
  });

  return () => {
    offArm();
    offLock();
    pill.destroy();
    if (originalOnEscape) ctx.options.onEscape = originalOnEscape;
    else delete ctx.options.onEscape;
  };
};

/** Whether an event originated inside DCI's own UI (for gesture guards). */
export const isFromDciUiEvent = (e: Event): boolean => isFromDciUi(e);
