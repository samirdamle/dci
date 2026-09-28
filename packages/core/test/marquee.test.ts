import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contains,
  hitTest,
  intersects,
  marqueeMode,
  rectFromPoints,
  type Candidate,
} from '../src/geometry';
import {
  createInteractions,
  type InteractionOptions,
  type Interactions,
} from '../src/interactions';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

const r = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

describe('geometry', () => {
  it('builds a rect from points in any direction', () => {
    expect(rectFromPoints(10, 20, 0, 5)).toEqual(r(0, 5, 10, 20));
  });

  it('picks contain for left→right and touch for right→left', () => {
    expect(marqueeMode(10, 50)).toBe('contain');
    expect(marqueeMode(50, 10)).toBe('touch');
  });

  it('tests containment and intersection', () => {
    expect(contains(r(0, 0, 100, 100), r(10, 10, 20, 20))).toBe(true);
    expect(contains(r(0, 0, 100, 100), r(90, 90, 110, 110))).toBe(false);
    expect(intersects(r(0, 0, 100, 100), r(90, 90, 110, 110))).toBe(true);
    expect(intersects(r(0, 0, 100, 100), r(100, 0, 110, 10))).toBe(false);
  });

  describe('hitTest', () => {
    // table (0) › row1 (1) › cells 2,3 ; row2 (4) › cell 5
    const el = (id: string) => Object.assign(document.createElement('div'), { id });
    const candidates: Candidate[] = [
      { el: el('table'), rect: r(0, 0, 200, 100), parent: -1 },
      { el: el('row1'), rect: r(0, 0, 200, 50), parent: 0 },
      { el: el('c11'), rect: r(0, 0, 100, 50), parent: 1 },
      { el: el('c12'), rect: r(100, 0, 200, 50), parent: 1 },
      { el: el('row2'), rect: r(0, 50, 200, 100), parent: 0 },
      { el: el('c21'), rect: r(0, 50, 100, 100), parent: 4 },
    ];
    const ids = (els: Element[]) => els.map((e) => e.id);

    it('contain selects the innermost nodes fully inside the box', () => {
      expect(ids(hitTest(candidates, r(-5, -5, 150, 105), 'contain'))).toEqual(['c11', 'c21']);
    });

    it('touch selects the innermost nodes the box intersects', () => {
      expect(ids(hitTest(candidates, r(90, 40, 110, 60), 'touch'))).toEqual(['c11', 'c12', 'c21']);
    });

    it("'top' keeps the outermost matches", () => {
      expect(ids(hitTest(candidates, r(-5, -5, 205, 55), 'contain', 'top'))).toEqual(['row1']);
      expect(ids(hitTest(candidates, r(-5, -5, 205, 105), 'contain', 'top'))).toEqual(['table']);
    });

    it('handles 1,000 candidates well within a frame', () => {
      const many: Candidate[] = Array.from({ length: 1000 }, (_, i) => ({
        el: candidates[0]!.el,
        rect: r(
          (i % 40) * 20,
          Math.floor(i / 40) * 20,
          (i % 40) * 20 + 18,
          Math.floor(i / 40) * 20 + 18,
        ),
        parent: -1,
      }));
      let best = Infinity;
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        hitTest(many, r(100, 100, 600, 400), i % 2 ? 'touch' : 'contain');
        best = Math.min(best, performance.now() - start);
      }
      expect(best).toBeLessThan(4);
    });
  });
});

describe('Mod+Drag window select', () => {
  // Layout (viewport px): two rows of two cells.
  const RECTS: Record<string, [number, number, number, number]> = {
    t: [100, 100, 300, 200],
    r1: [100, 100, 300, 150],
    a: [100, 100, 200, 150],
    b: [200, 100, 300, 150],
    r2: [100, 150, 300, 200],
    c: [100, 150, 200, 200],
    d: [200, 150, 300, 200],
  };

  let dci: Interactions | undefined;
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const [left, top, right, bottom] = RECTS[this.id] ?? [0, 0, 0, 0];
      return {
        left,
        top,
        right,
        bottom,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      } as DOMRect;
    });
  });
  afterEach(() => {
    dci?.destroy();
    dci = undefined;
    vi.restoreAllMocks();
  });

  const frame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));

  function setup(options: InteractionOptions = {}) {
    const f = mountFixture(`
      <table id="t" data-dci="t"><tbody>
        <tr id="r1" data-dci="r1"><td id="a" data-dci="a"></td><td id="b" data-dci="b"></td></tr>
        <tr id="r2" data-dci="r2"><td id="c" data-dci="c"></td><td id="d" data-dci="d"></td></tr>
      </tbody></table>`);
    dci = createInteractions({ root: f.root, ...options });
    const marquees: Array<string | null> = [];
    const previews: string[][] = [];
    dci.bus.on('marquee', (m) =>
      marquees.push(m && `${m.mode}:${m.rect.left},${m.rect.top},${m.rect.right},${m.rect.bottom}`),
    );
    dci.bus.on('marqueePreview', (els) => previews.push(els.map((e) => e.id)));
    fakeKey('Alt', { altKey: true });
    const target = f.get('#a');
    const mods = { altKey: true };
    const down = (x: number, y: number, extra = {}) =>
      fakePointer(target, { type: 'pointerdown', clientX: x, clientY: y, ...mods, ...extra });
    const move = async (x: number, y: number, extra = {}) => {
      fakePointer(target, { type: 'pointermove', clientX: x, clientY: y, ...mods, ...extra });
      await frame();
    };
    const up = (x: number, y: number, extra = {}) =>
      fakePointer(target, { type: 'pointerup', clientX: x, clientY: y, ...mods, ...extra });
    const click = () => fakePointer(target, { clientX: 0, clientY: 0, ...mods });
    return { f, dci, marquees, previews, down, move, up, click };
  }
  const ids = (els: Element[]) => els.map((e) => e.id);

  it('left→right selects contained leaf nodes', async () => {
    const { dci, down, move, up, marquees, previews } = setup();
    down(90, 90);
    await move(250, 210);
    expect(marquees).toEqual(['contain:90,90,250,210']);
    expect(previews).toEqual([['a', 'c']]);
    up(250, 210);
    expect(ids(dci.selection.get())).toEqual(['a', 'c']);
    expect(marquees[marquees.length - 1]).toBeNull();
    expect(previews[previews.length - 1]).toEqual([]);
  });

  it('right→left selects touched leaf nodes', async () => {
    const { dci, down, move, up } = setup();
    down(260, 140);
    await move(190, 160);
    up(190, 160);
    expect(ids(dci.selection.get())).toEqual(['a', 'b', 'c', 'd']);
  });

  it("selects outermost matches with windowSelectLevel 'top'", async () => {
    const { dci, down, move, up } = setup({ windowSelectLevel: 'top' });
    down(90, 90);
    await move(310, 160);
    up(310, 160);
    expect(ids(dci.selection.get())).toEqual(['r1']);
  });

  it('Shift adds and Ctrl/Cmd subtracts', async () => {
    const { dci, down, move, up, f } = setup();
    dci.selection.set([f.get('#d')]);
    down(90, 90);
    await move(210, 160, { shiftKey: true });
    up(210, 160, { shiftKey: true });
    expect(ids(dci.selection.get())).toEqual(['d', 'a']);

    down(90, 90);
    await move(210, 160, { ctrlKey: true });
    up(210, 160, { ctrlKey: true });
    expect(ids(dci.selection.get())).toEqual(['d']);

    down(190, 140);
    await move(310, 210, { metaKey: true });
    up(310, 210, { metaKey: true });
    expect(dci.selection.get()).toEqual([]);
  });

  it('treats a press without movement as a click', async () => {
    const { dci, down, move, up, click, marquees } = setup();
    down(150, 120);
    await move(152, 121);
    up(152, 121);
    click();
    expect(marquees).toEqual([]);
    expect(ids(dci.selection.get())).toEqual(['a']);
  });

  it('swallows the click that follows a drag', async () => {
    const { dci, down, move, up, click, f } = setup();
    const host = vi.fn();
    f.get('#a').addEventListener('click', host);
    down(90, 90);
    await move(250, 210);
    up(250, 210);
    const e = click();
    expect(e.defaultPrevented).toBe(true);
    expect(host).not.toHaveBeenCalled();
    expect(ids(dci.selection.get())).toEqual(['a', 'c']);
  });

  it('Esc cancels the drag without changing the selection', async () => {
    const { dci, down, move, up, marquees, f } = setup();
    dci.selection.set([f.get('#d')]);
    down(90, 90);
    await move(250, 210);
    const esc = fakeKey('Escape', { altKey: true });
    expect(esc.defaultPrevented).toBe(true);
    expect(marquees[marquees.length - 1]).toBeNull();
    up(250, 210);
    expect(ids(dci.selection.get())).toEqual(['d']);
  });

  it('respects maxSelection with a limit event', async () => {
    const { dci, down, move, up } = setup({ maxSelection: 2 });
    const limits = vi.fn();
    dci.selection.on('selectionlimit', limits);
    down(310, 210);
    await move(90, 90);
    up(90, 90);
    expect(dci.selection.get()).toHaveLength(2);
    await new Promise((res) => setTimeout(res, 0));
    expect(limits).toHaveBeenCalledWith({ dropped: 2, max: 2 });
  });

  it('auto-scrolls near the viewport edge', async () => {
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const { down, move, up } = setup();
    down(150, 120);
    await move(150, window.innerHeight - 2);
    expect(scroll).toHaveBeenCalled();
    const [, dy] = scroll.mock.calls[0] as unknown as [number, number];
    expect(dy).toBeGreaterThan(0);
    up(150, window.innerHeight - 2);
  });

  it('only listens for drag events between pointerdown and pointerup', async () => {
    const { down, move, up } = setup();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    down(90, 90);
    expect(add.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel', 'keydown', 'scroll']),
    );
    await move(250, 210);
    up(250, 210);
    expect(remove.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel', 'keydown', 'scroll']),
    );
  });

  it('does nothing when disabled', async () => {
    const { dci, down, move, up, marquees } = setup({ bindings: { windowSelect: false } });
    down(90, 90);
    await move(250, 210);
    up(250, 210);
    expect(marquees).toEqual([]);
    expect(dci.selection.get()).toEqual([]);
  });
});
