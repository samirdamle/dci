/** Keys that can act as the DCI modifier. `Alt` is Option on macOS. */
export type ModifierKey = 'Alt' | 'Shift' | 'Control' | 'Meta';

const MODIFIER_PROPS = {
  Alt: 'altKey',
  Shift: 'shiftKey',
  Control: 'ctrlKey',
  Meta: 'metaKey',
} as const satisfies Record<ModifierKey, keyof MouseEvent & keyof KeyboardEvent>;

type ModifierEvent = Pick<KeyboardEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>;

/**
 * Whether `mod` is held. Reads the event flag (`altKey`, …) rather than
 * `event.key`, because Option on macOS changes printable characters.
 */
export const hasModifier = (e: ModifierEvent, mod: ModifierKey): boolean => e[MODIFIER_PROPS[mod]];

/** Whether a `keydown`/`keyup` is for the modifier key itself. */
export const isModifierKey = (e: KeyboardEvent, mod: ModifierKey): boolean => e.key === mod;

/**
 * Match a key combo such as `'Enter'`, `'Alt+Enter'` or `'Shift+ArrowUp'`.
 * Listed modifiers must be held; other modifiers are ignored unless `exact`.
 */
export function matchesCombo(e: KeyboardEvent, combo: string, exact = false): boolean {
  const parts = combo.split('+');
  const key = parts.pop();
  if (!key || e.key.toLowerCase() !== key.toLowerCase()) return false;
  const required = new Set(parts as ModifierKey[]);
  for (const mod of Object.keys(MODIFIER_PROPS) as ModifierKey[]) {
    const held = hasModifier(e, mod);
    if (required.has(mod) && !held) return false;
    if (exact && !required.has(mod) && held) return false;
  }
  return true;
}

/** Whether `el` accepts text input (`input`, `textarea`, `select`, contenteditable). */
export function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset', 'file'].includes(
      el.type,
    );
  }
  return el.getAttribute('contenteditable') === 'true';
}

/** Attribute marking DCI's own UI (the shadow host); its events are ignored. */
export const DCI_UI_ATTRIBUTE = 'data-dci-ui';

/** Whether `e` originated inside DCI's own UI. */
export const isFromDciUi = (e: Event): boolean =>
  e.composedPath().some((node) => node instanceof Element && node.hasAttribute(DCI_UI_ATTRIBUTE));
