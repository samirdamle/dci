import { describeNode } from './announce';
import type { KeyboardBindings } from './bindings';
import type { Gesture, GestureContext, InteractionEvents } from './interactions';
import { hasModifier, isEditable, matchesCombo } from './keys';

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

/** Focus is inside a host-app dialog, whose own keys (Esc, arrows) must keep working. */
const inDialog = (el: Element | null) =>
  !!el?.closest('[role="dialog"], [role="alertdialog"], dialog[open]');

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
    const attribute = ctx.options.attribute;
    const say = (el: Element, prefix: string) =>
      bus.emit('announce', `${prefix} ${describeNode(el, tree, attribute)}`);

    if (kb.selectFocused && matchesCombo(e, kb.selectFocused)) {
      const focused = deepActiveElement();
      const node = focused && tree.nearestNode(focused);
      if (!node) return;
      selection.set([node]);
      say(node, 'Selected');
      return 'consume';
    }

    const primary = selection.primary();
    if (!primary || isEditable(deepActiveElement())) return;

    if (kb.clear && matchesCombo(e, kb.clear)) {
      // e.g. the chat closes on the first Esc; the next one clears.
      if (ctx.options.onEscape?.()) return 'consume';
      selection.clear();
      bus.emit('announce', 'Selection cleared');
      return 'consume';
    }

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
