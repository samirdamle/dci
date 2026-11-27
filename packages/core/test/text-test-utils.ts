/**
 * Test helpers for agent B's text-selection tests, built on agent A's real
 * unified store (`selection.ts`) and capture (`text-selection.ts`).
 */
import type { DciContextNode } from '@samirdamle/dci-protocol';
import { createSelectionStore, type SelectionStore } from '../src/selection';
import {
  captureTextRange,
  toTextSelectionItem,
  type TextSelectionItem,
} from '../src/text-selection';

export type { TextSelectionItem };
export type FakeTextItem = TextSelectionItem;

/** The real unified store, typed for tests. */
export type TextCapableSelectionStore = SelectionStore;

/** Re-export the real store under the name the tests use. */
export const createTextSelectionStore = createSelectionStore;

/**
 * Capture `text` inside `paragraph` with A's real `captureTextRange` and
 * wrap it as a store item. Throws when the range is not capturable.
 */
export function makeTextItem(
  paragraph: HTMLElement,
  text: string,
  root: Element = paragraph.ownerDocument.body,
): TextSelectionItem {
  const full = paragraph.textContent ?? '';
  const start = full.indexOf(text);
  if (start < 0) throw new Error(`makeTextItem: "${text}" not found in "${full}"`);
  const textNode = paragraph.firstChild as Text;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, start + text.length);
  const node: DciContextNode | null = captureTextRange(range, {
    root,
    attribute: 'data-dci',
  });
  if (!node) throw new Error(`makeTextItem: range "${text}" was refused by captureTextRange`);
  return toTextSelectionItem(node, range);
}
