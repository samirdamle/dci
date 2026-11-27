import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextHighlight, TEXT_HIGHLIGHT_CSS, TEXT_HIGHLIGHT_NAME } from '../src/highlight';
import { makeTextItem } from './text-test-utils';
import { mountFixture } from './test-utils';

/** A fake `Highlight` + registry that records what was registered. */
function fakeRegistry() {
  const entries = new Map<string, Set<Range>>();
  class FakeHighlight {
    ranges = new Set<Range>();
    constructor(...ranges: Range[]) {
      for (const r of ranges) this.ranges.add(r);
    }
    add(range: Range) {
      this.ranges.add(range);
    }
  }
  const registry = {
    set: vi.fn((name: string, highlight: FakeHighlight) => {
      entries.set(name, new Set(highlight.ranges));
    }),
    delete: vi.fn((name: string) => {
      entries.delete(name);
    }),
    has: (name: string) => entries.has(name),
  };
  return { registry, entries, HighlightCtor: FakeHighlight as never };
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('text highlight', () => {
  afterEach(() => {
    document.adoptedStyleSheets = [];
    document.head.querySelectorAll('style[data-dci-text-highlight]').forEach((el) => el.remove());
  });

  it('registers a range under dci-text and removes it on remove/clear', () => {
    const f = mountFixture('<p id="p">Q3 focus: convert Proposal-stage deals.</p>');
    const { registry, entries } = fakeRegistry();
    const hl = createTextHighlight({ registry, HighlightCtor: fakeRegistry().HighlightCtor });
    const item = makeTextItem(f.get('#p'), 'convert Proposal-stage');
    hl.register(item);
    expect(hl.size).toBe(1);
    expect(entries.get(TEXT_HIGHLIGHT_NAME)?.has(item.range)).toBe(true);
    hl.remove(item);
    expect(hl.size).toBe(0);
    expect(entries.has(TEXT_HIGHLIGHT_NAME)).toBe(false);
    hl.register(item);
    hl.clear();
    expect(entries.has(TEXT_HIGHLIGHT_NAME)).toBe(false);
    hl.destroy();
  });

  it('removes by node, and installs the document-level ::highlight stylesheet', () => {
    const f = mountFixture('<p id="p">hello world, this is text.</p>');
    const { registry } = fakeRegistry();
    const hl = createTextHighlight({ registry, HighlightCtor: fakeRegistry().HighlightCtor });
    const item = makeTextItem(f.get('#p'), 'hello world');
    hl.register(item);
    // Deviation from spec §7: the rule lives at document level, not in the
    // shadow root, because ::highlight only applies inside its own tree.
    // happy-dom parses no rules from the sheet, so assert on adoption
    // (length), not on rule text.
    const adopted = document.adoptedStyleSheets.length > 0;
    const injected = !!document.head.querySelector('style[data-dci-text-highlight]');
    expect(adopted || injected).toBe(true);
    expect(TEXT_HIGHLIGHT_CSS).toContain(`::highlight(${TEXT_HIGHLIGHT_NAME})`);
    hl.removeForNode(item.node);
    expect(hl.size).toBe(0);
    hl.destroy();
  });

  it('flash scrolls the range into view and intensifies, then restores', async () => {
    vi.useFakeTimers();
    try {
      const f = mountFixture('<p id="p">hello world, this is text.</p>');
      const { registry, entries } = fakeRegistry();
      const hl = createTextHighlight({ registry, HighlightCtor: fakeRegistry().HighlightCtor });
      const item = makeTextItem(f.get('#p'), 'hello world');
      const scroll = vi.fn();
      (f.get('#p') as HTMLElement).scrollIntoView = scroll;
      hl.register(item);
      hl.flash(item);
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
      expect(entries.has('dci-text-flash')).toBe(true);
      await vi.advanceTimersByTimeAsync(1500);
      expect(entries.has('dci-text-flash')).toBe(false);
      // The base highlight survives the flash.
      expect(entries.get(TEXT_HIGHLIGHT_NAME)?.has(item.range)).toBe(true);
      hl.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refresh re-resolves ranges after DOM changes', async () => {
    const f = mountFixture('<p id="p">hello world, this is text.</p>');
    const { registry, entries } = fakeRegistry();
    const resolve = vi.fn((_node: unknown) => {
      // Simulate the range surviving a re-render: a fresh range over the same text.
      const p = f.get('#p');
      const range = document.createRange();
      range.setStart(p.firstChild!, 0);
      range.setEnd(p.firstChild!, 5);
      return range;
    });
    const hl = createTextHighlight({
      registry,
      HighlightCtor: fakeRegistry().HighlightCtor,
      resolve: resolve as never,
    });
    const item = makeTextItem(f.get('#p'), 'hello');
    hl.register(item);
    hl.refresh();
    expect(resolve).toHaveBeenCalledWith(item.node);
    expect(
      [...(entries.get(TEXT_HIGHLIGHT_NAME) ?? [])].some((r) => r.toString() === 'hello'),
    ).toBe(true);
    hl.destroy();
    await frame();
    await tick();
  });

  it('never throws when the Highlight API is absent', () => {
    const f = mountFixture('<p id="p">hello world, this is text.</p>');
    const hl = createTextHighlight({ registry: null });
    expect(hl.supported).toBe(false);
    const item = makeTextItem(f.get('#p'), 'hello world');
    expect(() => {
      hl.register(item);
      hl.flash(item);
      hl.refresh();
      hl.remove(item);
      hl.clear();
      hl.destroy();
    }).not.toThrow();
    expect(hl.size).toBe(0);
  });
});
