import { describeNode } from './announce';
import type { KeyboardBindings } from './bindings';
import type { Gesture, GestureContext, InteractionEvents } from './interactions';
import { DCI_UI_ATTRIBUTE, hasModifier, isEditable, matchesCombo } from './keys';

type Direction = InteractionEvents['navboundary']['direction'];

const MOVES: Array<[keyof KeyboardBindings, Direction]> = [
  ['parent', 'parent'],
  ['child', 'child'],
  ['prevSibling', 'prev'],
  ['nextSibling', 'next'],
];

function step(ctx: GestureContext, from: Element, direction: Direction): Element | null {
  switch (direction) {
    case 'parent':
      return ctx.tree.parentNode(from);
    case 'child':
      return ctx.tree.firstChildNode(from);
    case 'prev':
      return ctx.tree.prevSibling(from);
    case 'next':
      return ctx.tree.nextSibling(from);
  }
}

/** The focused element, looking through open shadow roots. */
function deepActiveElement(): Element | null {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/**
 * Focus is inside a host-app dialog, whose own keys (Esc, arrows) must keep
 * working. DCI's own chat root is a `role="dialog"` too, but it is not a
 * host dialog: focus lingering in its (hidden) textarea after the chat
 * closes must not swallow the Esc that clears the selection.
 */
const inDialog = (el: Element | null) =>
  !!el && !inDciUi(el) && !!el.closest('[role="dialog"], [role="alertdialog"], dialog[open]');

/**
 * Whether `el` lives inside DCI's own UI (its shadow root). WebKit can leave
 * focus in the chat's (hidden) textarea after the chat closes, so the clear
 * key must not treat DCI's own input as a host-app text field.
 */
function inDciUi(el: Element | null): boolean {
  const root = el?.getRootNode();
  return (
    typeof ShadowRoot !== 'undefined' &&
    root instanceof ShadowRoot &&
    root.host instanceof Element &&
    root.host.hasAttribute(DCI_UI_ATTRIBUTE)
  );
}

/** Whether focus is in a host-app editable field (DCI's own chat input doesn't count). */
function inHostEditableField(): boolean {
  const el = deepActiveElement();
  return !!el && isEditable(el) && !inDciUi(el);
}

function reveal(el: Element) {
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
}

/**
 * Keyboard navigation while a selection exists (and focus is not in an
 * editable field): arrows move the primary node through the DCI tree,
 * Shift+arrow extends, Esc clears. `Alt+Enter` selects the focused
 * element's node without a pointer. Keys are only consumed when handled,
 * and never while focus is inside a dialog (the host app's Esc must work).
 */
export const keyboardGesture: Gesture = (ctx) =>
  ctx.input.onKeyDown((e) => {
    const kb = ctx.bindings.keyboard;
    if (!kb) return;
    if (inDialog(deepActiveElement())) return;
    const { selection, tree, bus } = ctx;
    const { attribute, infer } = ctx.options;
    const source = { ...(attribute ? { attribute } : {}), ...(infer ? { infer } : {}) };
    const say = (el: Element, prefix: string) =>
      bus.emit('announce', `${prefix} ${describeNode(el, tree, source)}`);

    // Text first: when a live text range exists, Alt+Enter captures it
    // (spec §3.3). The binding is `bindings.textSelect` (default
    // `'Alt+Enter'`); `false` disables the keyboard path only — the pill
    // still works.
    const textSelect = ctx.bindings.textSelect;
    if (textSelect !== false && matchesCombo(e, textSelect) && ctx.textSelection?.enabled) {
      const item = ctx.textSelection.captureLive();
      if (item) {
        const marker = item.node.marker;
        bus.emit(
          'announce',
          marker ? `Selected text added to chat, marker ${marker}` : 'Selected text added to chat',
        );
        return 'consume';
      }
      // No live range: fall through to the existing focused-node path.
    }

    if (kb.selectFocused && matchesCombo(e, kb.selectFocused)) {
      const focused = deepActiveElement();
      const node = focused && tree.nearestNode(focused);
      if (!node) return;
      selection.set([node]);
      say(node, 'Selected');
      return 'consume';
    }

    const primary = selection.primary();
    if (!primary) {
      // A text-only selection has no element primary, but Esc must still
      // clear it (spec §4.4): the chat closes first via `onEscape`, then
      // the selection clears. Arrow navigation still needs a primary, so
      // only the clear key is handled here — and only when something is
      // selected, so a stray Esc is never swallowed.
      if (
        selection.items().length &&
        kb.clear &&
        matchesCombo(e, kb.clear) &&
        !inHostEditableField()
      ) {
        if (ctx.options.onEscape?.()) return 'consume';
        selection.clear();
        bus.emit('announce', 'Selection cleared');
        return 'consume';
      }
      return;
    }
    // Esc clears even when focus is in DCI's own chat input (WebKit can
    // leave focus in its hidden textarea after the chat closes); only a
    // host-app editable field blocks it. The arrow guard below stays
    // strict: arrows must never move the selection while typing.
    if (kb.clear && matchesCombo(e, kb.clear) && !inHostEditableField()) {
      // e.g. the chat closes on the first Esc; the next one clears.
      if (ctx.options.onEscape?.()) return 'consume';
      selection.clear();
      bus.emit('announce', 'Selection cleared');
      return 'consume';
    }
    if (isEditable(deepActiveElement())) return;

    // Alt/Ctrl/Meta + arrows belong to the browser (Alt+← is Back).
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const move = MOVES.find(([binding]) => {
      const key = kb[binding];
      return typeof key === 'string' && e.key === key;
    });
    if (!move) return;
    const direction = move[1];
    const target = step(ctx, primary, direction);
    if (!target) {
      bus.emit('navboundary', { direction });
      return 'consume';
    }
    if (kb.extendModifier && hasModifier(e, kb.extendModifier)) {
      if (selection.has(target)) selection.setPrimary(target);
      else selection.add(target);
      say(target, selection.has(target) ? 'Added' : 'Limit reached, not added');
    } else {
      selection.set([target]);
      say(target, 'Selected');
    }
    reveal(target);
    return 'consume';
  });
