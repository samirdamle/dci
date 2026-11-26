import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, resolveBindings } from '../src/bindings';
import { DEFAULTS, validateConfig } from '../src/dci/config';
import {
  captureTextRange,
  deserializeRange,
  serializeRange,
  textNodeKey,
  toTextSelectionItem,
  validateTextRange,
} from '../src/text-selection';
import { mountFixture, type Fixture } from './test-utils';

const FIXTURE = `
  <div id="page" data-dci='{"id":"home","type":"page","label":"Sales Home"}'>
    <p id="p1">Q3 focus: convert Proposal-stage deals before the winter catalog ships.</p>
    <div id="priv" data-dci='{"id":"secret","private":true}'>
      <p id="pp">Secret words that must never be captured.</p>
    </div>
    <p id="p2">Second paragraph with more words to select from here.</p>
    <p id="p3">Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam.</p>
    <p id="punct">...</p>
  </div>
  <div data-dci-ui><p id="ui-p">Chat input text.</p></div>
  <div id="ed" contenteditable="true"><p id="edp">Editable words here.</p></div>
  <select id="sel"><option id="opt">Option words here.</option></select>`;

function setup() {
  const f = mountFixture(FIXTURE);
  return { f, root: f.root };
}

/** A range over the text node of `startSel`/`endSel` (same node when only one). */
function rangeOf(
  f: Fixture,
  startSel: string,
  startOff: number,
  endSel: string,
  endOff: number,
): Range {
  const start = f.get(startSel).firstChild as Text;
  const end = f.get(endSel).firstChild as Text;
  const range = document.createRange();
  range.setStart(start, startOff);
  range.setEnd(end, endOff);
  return range;
}

describe('captureTextRange', () => {
  it('captures a text node with excerpt, label and ancestors', () => {
    const { f, root } = setup();
    const p1 = f.get('#p1');
    const text = p1.firstChild as Text;
    const node = captureTextRange(rangeOf(f, '#p1', 0, '#p1', text.length), { root });
    expect(node).toEqual({
      label: 'Q3 focus: convert Proposal-stage deals before the winter catalog ships.',
      data: {},
      source: 'text',
      text: {
        excerpt: 'Q3 focus: convert Proposal-stage deals before the winter catalog ships.',
        truncated: false,
        start: { path: '#p1', offset: 0 },
        end: { path: '#p1', offset: 71 },
      },
      ancestors: [{ id: 'home', type: 'page', label: 'Sales Home' }],
    });
  });

  it('caps the label at ~80 characters with an ellipsis', () => {
    const { f, root } = setup();
    const p3 = f.get('#p3');
    const text = p3.firstChild as Text;
    const node = captureTextRange(rangeOf(f, '#p3', 0, '#p3', text.length), { root });
    expect(node?.label).toHaveLength(81);
    expect(node?.label?.endsWith('…')).toBe(true);
    // The excerpt itself is not capped at 80.
    expect(node?.text?.excerpt.length).toBeGreaterThan(80);
  });

  it('caps the excerpt at maxTextSelectionLength and flags truncation', () => {
    const { f, root } = setup();
    const p1 = f.get('#p1');
    const text = p1.firstChild as Text;
    const node = captureTextRange(rangeOf(f, '#p1', 0, '#p1', text.length), {
      root,
      maxTextSelectionLength: 10,
    });
    expect(node?.text).toEqual({
      excerpt: 'Q3 focus: ',
      truncated: true,
      start: { path: '#p1', offset: 0 },
      end: { path: '#p1', offset: 71 },
    });
  });

  it('omits ancestors when includeAncestors is false', () => {
    const { f, root } = setup();
    const node = captureTextRange(rangeOf(f, '#p1', 0, '#p1', 5), {
      root,
      includeAncestors: false,
    });
    expect(node).not.toHaveProperty('ancestors');
  });

  it('returns null for an invalid range', () => {
    const { f, root } = setup();
    const range = document.createRange();
    range.setStart(f.get('#p1').firstChild as Text, 3);
    range.collapse(true);
    expect(captureTextRange(range, { root })).toBeNull();
  });
});

describe('serializeRange / deserializeRange', () => {
  it('round-trips a range within one paragraph', () => {
    const { f, root } = setup();
    const range = rangeOf(f, '#p1', 10, '#p1', 42);
    const serialized = serializeRange(range, { root });
    expect(serialized?.start).toEqual({ path: '#p1', offset: 10 });
    expect(serialized?.end).toEqual({ path: '#p1', offset: 42 });
    expect(serialized?.excerpt).toBe('convert Proposal-stage deals bef');
    const restored = deserializeRange(serialized!, root);
    expect(restored?.toString()).toBe(range.toString());
    expect(restored?.startContainer).toBe(range.startContainer);
    expect(restored?.startOffset).toBe(10);
  });

  it('round-trips a range spanning two paragraphs', () => {
    const { f, root } = setup();
    const range = rangeOf(f, '#p1', 60, '#p2', 6);
    const serialized = serializeRange(range, { root });
    expect(serialized?.start).toEqual({ path: '#p1', offset: 60 });
    expect(serialized?.end).toEqual({ path: '#p2', offset: 6 });
    const restored = deserializeRange(serialized!, root);
    expect(restored?.toString()).toBe(range.toString());
  });

  it('collapses whitespace the same way on both ends', () => {
    const { f, root } = setup();
    // p1 has single spaces only; use p3's text with a double space instead.
    const p3 = f.get('#p3');
    const text = p3.firstChild as Text;
    text.data = 'Words  with   gaps in them.';
    const range = rangeOf(f, '#p3', 0, '#p3', text.length);
    const serialized = serializeRange(range, { root });
    expect(serialized?.excerpt).toBe('Words with gaps in them.');
    expect(deserializeRange(serialized!, root)?.toString()).toBe(text.data);
  });

  it('returns null when the element is gone', () => {
    const { f, root } = setup();
    const serialized = serializeRange(rangeOf(f, '#p1', 0, '#p1', 10), { root });
    f.get('#p1').remove();
    expect(deserializeRange(serialized!, root)).toBeNull();
  });

  it('returns null when the resolved text no longer matches', () => {
    const { f, root } = setup();
    const serialized = serializeRange(rangeOf(f, '#p1', 0, '#p1', 10), { root });
    (f.get('#p1').firstChild as Text).data = 'Completely different words.';
    expect(deserializeRange(serialized!, root)).toBeNull();
  });

  it('accepts a capped excerpt (a DciTextInfo) when truncated', () => {
    const { f, root } = setup();
    const full = serializeRange(rangeOf(f, '#p1', 0, '#p1', 20), { root })!;
    const capped = { ...full, excerpt: full.excerpt.slice(0, 10), truncated: true };
    expect(deserializeRange(capped, root)?.toString()).toBe('Q3 focus: convert Pr');
    // …but not a prefix of different words.
    const wrong = { ...full, excerpt: 'Q3 focus: convert X', truncated: true };
    expect(deserializeRange(wrong, root)).toBeNull();
  });
});

describe('validateTextRange', () => {
  it('returns null for a valid range', () => {
    const { f, root } = setup();
    expect(validateTextRange(rangeOf(f, '#p1', 0, '#p1', 10), { root })).toBeNull();
  });

  it('refuses collapsed and whitespace-only ranges', () => {
    const { f, root } = setup();
    const collapsed = document.createRange();
    collapsed.setStart(f.get('#p1').firstChild as Text, 3);
    collapsed.collapse(true);
    expect(validateTextRange(collapsed, { root })).toBe('Selection is empty.');
    const p1 = f.get('#p1');
    (p1.firstChild as Text).data = '   ';
    const blank = document.createRange();
    blank.setStart(p1.firstChild as Text, 0);
    blank.setEnd(p1.firstChild as Text, 3);
    expect(validateTextRange(blank, { root })).toBe('Selection is empty.');
  });

  it('refuses punctuation-only selections', () => {
    const { f, root } = setup();
    expect(validateTextRange(rangeOf(f, '#punct', 0, '#punct', 3), { root })).toBe(
      'Selection contains no words.',
    );
  });

  it('refuses ranges outside the root', () => {
    const { root } = setup();
    const outside = document.createElement('p');
    outside.textContent = 'Outside the root.';
    document.body.appendChild(outside);
    try {
      const range = document.createRange();
      range.setStart(outside.firstChild as Text, 0);
      range.setEnd(outside.firstChild as Text, 7);
      expect(validateTextRange(range, { root })).toBe('Selection is outside the DCI root.');
    } finally {
      outside.remove();
    }
  });

  it('refuses ranges inside DCI UI, editable fields and selects', () => {
    const { f, root } = setup();
    expect(validateTextRange(rangeOf(f, '#ui-p', 0, '#ui-p', 4), { root })).toBe(
      "Selection is inside DCI's own UI.",
    );
    expect(validateTextRange(rangeOf(f, '#edp', 0, '#edp', 8), { root })).toBe(
      'Selection is inside an editable field.',
    );
    expect(validateTextRange(rangeOf(f, '#opt', 0, '#opt', 6), { root })).toBe(
      'Selection is inside an editable field.',
    );
  });

  it('refuses the whole range when any part intersects a private node', () => {
    const { f, root } = setup();
    const reason = 'Selection includes private content and was not added.';
    expect(validateTextRange(rangeOf(f, '#pp', 0, '#pp', 6), { root })).toBe(reason);
    // Spanning from a public paragraph into the private one.
    expect(validateTextRange(rangeOf(f, '#p1', 60, '#pp', 6), { root })).toBe(reason);
    // Spanning across the private node between two public paragraphs.
    expect(validateTextRange(rangeOf(f, '#p1', 60, '#p2', 6), { root })).toBe(reason);
    expect(captureTextRange(rangeOf(f, '#pp', 0, '#pp', 6), { root })).toBeNull();
  });
});

describe('textNodeKey', () => {
  it('identifies a node by its serialized range', () => {
    const { f, root } = setup();
    const node = captureTextRange(rangeOf(f, '#p1', 3, '#p1', 12), { root })!;
    expect(textNodeKey(node)).toBe('text:#p1@3-#p1@12');
    expect(toTextSelectionItem(node, rangeOf(f, '#p1', 3, '#p1', 12))).toEqual({
      kind: 'text',
      node,
      range: expect.any(Object),
      key: 'text:#p1@3-#p1@12',
    });
  });

  it('has no range identity without a text object', () => {
    expect(textNodeKey({ data: {}, source: 'annotated' })).toBe('text:missing');
  });
});

describe('text selection config', () => {
  it('defaults text selection on with a 2000-character cap', () => {
    expect(DEFAULTS.textSelection).toBe(true);
    expect(DEFAULTS.maxTextSelectionLength).toBe(2000);
    expect(DEFAULTS.textSelectionAction).toBe('Ask about this');
    expect(DEFAULT_BINDINGS.textSelect).toBe('Alt+Enter');
    expect(resolveBindings().textSelect).toBe('Alt+Enter');
    expect(resolveBindings({ textSelect: false }).textSelect).toBe(false);
  });

  it('rejects a non-integer maxTextSelectionLength', () => {
    const { errors } = validateConfig({ endpoint: '/x', maxTextSelectionLength: 0 });
    expect(errors).toEqual(['`maxTextSelectionLength` must be an integer ≥ 1 (got 0).']);
    expect(validateConfig({ endpoint: '/x', maxTextSelectionLength: 2000 }).errors).toEqual([]);
    expect(validateConfig({ endpoint: '/x', textSelection: 'yes' as never }).errors).toEqual([
      '`textSelection` must be a boolean.',
    ]);
  });
});
