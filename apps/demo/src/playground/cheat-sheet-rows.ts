import type { Bindings, ModifierKey } from '@samirdamle/dci-core';

const KEY_LABEL: Record<string, string> = {
  Alt: 'Alt (⌥)',
  Control: 'Ctrl',
  Meta: 'Cmd (⌘)',
  Shift: 'Shift',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
};

export const keyLabel = (key: string) =>
  key
    .split('+')
    .map((k) => KEY_LABEL[k] ?? k)
    .join('+');

/**
 * Every gesture and key, from the active bindings: remap the modifier or a
 * key and the cheat sheet follows. Disabled bindings are left out.
 */
export function cheatSheetRows(b: Bindings, modifier: ModifierKey): Array<[string, string]> {
  const mod = keyLabel(modifier);
  const rows: Array<[string, string]> = [
    [`Hold ${mod}`, 'Highlight the element under the pointer'],
  ];
  if (b.select) rows.push([`${mod}+Click`, 'Select it (replaces the selection)']);
  if (b.toggle) rows.push([`${mod}+${keyLabel(b.toggle)}+Click`, 'Add or remove it']);
  if (b.wheelTraverse) rows.push([`${mod}+Wheel`, 'Move the highlight up or down the tree']);
  if (b.windowSelect) {
    rows.push([`${mod}+Drag →`, 'Select everything fully inside the box']);
    rows.push([`${mod}+Drag ←`, 'Select everything the box touches']);
  }
  if (b.selectSameType) rows.push([`${mod}+Double-click`, 'Select all siblings of the same type']);
  const k = b.keyboard;
  if (k) {
    const pair = (a: string | false, c: string | false) =>
      [a, c]
        .filter((x): x is string => !!x)
        .map(keyLabel)
        .join(' / ');
    if (k.parent || k.child)
      rows.push([pair(k.parent, k.child), 'Move to the parent / first child']);
    if (k.prevSibling || k.nextSibling)
      rows.push([pair(k.prevSibling, k.nextSibling), 'Move to the previous / next sibling']);
    if (k.extendModifier)
      rows.push([`${keyLabel(k.extendModifier)} + arrow`, 'Extend the selection']);
    if (k.clear) rows.push([keyLabel(k.clear), 'Close the chat, then clear the selection']);
    if (k.selectFocused) rows.push([keyLabel(k.selectFocused), 'Select the focused element']);
  }
  return rows;
}
