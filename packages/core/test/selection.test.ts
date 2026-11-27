import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarkerSeries } from '../src/markers';
import { createSelectionStore, type SelectionChange } from '../src/selection';
import {
  captureTextRange,
  toTextSelectionItem,
  type TextSelectionItem,
} from '../src/text-selection';
import { mountFixture } from './test-utils';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(maxSelection?: number) {
  const f = mountFixture(`
    <ul data-dci="list">
      ${Array.from({ length: 6 }, (_, i) => `<li id="n${i}" data-dci="n${i}">${i}</li>`).join('')}
    </ul>`);
  const store = createSelectionStore({ root: f.root, ...(maxSelection ? { maxSelection } : {}) });
  const events: SelectionChange[] = [];
  store.subscribe((e) => events.push(e));
  const [a, b, c, d] = [0, 1, 2, 3].map((i) => f.get(`#n${i}`)) as [
    HTMLElement,
    HTMLElement,
    HTMLElement,
    HTMLElement,
  ];
  return { f, store, events, a, b, c, d };
}

const ids = (els: Element[]) => els.map((el) => el.id);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSelectionStore', () => {
  it('keeps selection order and deduplicates', () => {
    const { store, a, b, c } = setup();
    store.add([b, a, b]);
    store.add(a);
    store.add([c]);
    expect(ids(store.get())).toEqual(['n1', 'n0', 'n2']);
    expect(store.has(a)).toBe(true);
  });

  it('replaces with set, and removes / clears', () => {
    const { store, a, b, c } = setup();
    store.set([a, b, a]);
    expect(ids(store.get())).toEqual(['n0', 'n1']);
    store.remove(a);
    expect(ids(store.get())).toEqual(['n1']);
    store.set([c]);
    expect(ids(store.get())).toEqual(['n2']);
    store.clear();
    expect(store.get()).toEqual([]);
    expect(store.primary()).toBeNull();
  });

  it('toggles membership', () => {
    const { store, a } = setup();
    store.toggle(a);
    expect(store.has(a)).toBe(true);
    store.toggle(a);
    expect(store.has(a)).toBe(false);
  });

  it('returns copies, not internal state', () => {
    const { store, a } = setup();
    store.add(a);
    store.get().pop();
    expect(store.get()).toHaveLength(1);
  });

  describe('primary', () => {
    it('tracks the last-interacted node', () => {
      const { store, a, b, c } = setup();
      store.set([a, b]);
      expect(store.primary()).toBe(b);
      store.add(c);
      expect(store.primary()).toBe(c);
      store.toggle(a);
      expect(store.primary()).toBe(c);
      store.toggle(a);
      expect(store.primary()).toBe(a);
    });

    it('falls back to the last selected node when the primary is removed', () => {
      const { store, a, b, c } = setup();
      store.set([a, b, c]);
      store.remove(c);
      expect(store.primary()).toBe(b);
      store.remove(a);
      expect(store.primary()).toBe(b);
      store.remove(b);
      expect(store.primary()).toBeNull();
    });
  });

  describe('events', () => {
    it('batches mutations in one tick into a single event', async () => {
      const { store, events, a, b, c } = setup();
      store.add(a);
      store.add(b);
      store.add(c);
      store.remove(a);
      expect(events).toHaveLength(0);
      await tick();
      expect(events).toHaveLength(1);
      expect(ids(events[0]!.elements)).toEqual(['n1', 'n2']);
      expect(ids(events[0]!.added)).toEqual(['n1', 'n2']);
      expect(events[0]!.removed).toEqual([]);
      expect(events[0]!.primary).toBe(c);
    });

    it('reports added and removed since the previous event', async () => {
      const { store, events, a, b, c } = setup();
      store.set([a, b]);
      await tick();
      store.set([b, c]);
      await tick();
      expect(events).toHaveLength(2);
      expect(ids(events[1]!.added)).toEqual(['n2']);
      expect(ids(events[1]!.removed)).toEqual(['n0']);
    });

    it('skips the event when a batch nets out to no change', async () => {
      const { store, events, a } = setup();
      store.add(a);
      store.remove(a);
      store.clear();
      await tick();
      expect(events).toHaveLength(0);
    });

    it('emits when only the primary changes', async () => {
      const { store, events, a, b } = setup();
      store.set([a, b]);
      await tick();
      store.set([b, a]);
      await tick();
      expect(events).toHaveLength(2);
      expect(events[1]!.primary).toBe(a);
    });

    it('supports unsubscribing', async () => {
      const { store, a } = setup();
      const fn = vi.fn();
      const off = store.subscribe(fn);
      off();
      store.add(a);
      await tick();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('maxSelection', () => {
    it('rejects adds beyond the cap and emits selectionlimit', async () => {
      const { store, events, a, b, c, d } = setup(2);
      const limits = vi.fn();
      store.on('selectionlimit', limits);
      store.add([a, b, c]);
      store.add(d);
      expect(ids(store.get())).toEqual(['n0', 'n1']);
      await tick();
      expect(limits).toHaveBeenCalledOnce();
      expect(limits).toHaveBeenCalledWith({ dropped: 2, max: 2 });
      expect(events).toHaveLength(1);
    });

    it('caps set() as well', async () => {
      const { store, a, b, c } = setup(2);
      const limits = vi.fn();
      store.on('selectionlimit', limits);
      store.set([a, b, c]);
      expect(ids(store.get())).toEqual(['n0', 'n1']);
      await tick();
      expect(limits).toHaveBeenCalledWith({ dropped: 1, max: 2 });
    });

    it('defaults to 50', () => {
      const f = mountFixture(
        Array.from({ length: 60 }, (_, i) => `<i data-dci="x${i}"></i>`).join(''),
      );
      const store = createSelectionStore({ root: f.root });
      store.add(f.getAll('[data-dci]'));
      expect(store.get()).toHaveLength(50);
    });
  });

  describe('DOM removal', () => {
    it('drops selected nodes that leave the DOM', async () => {
      const { store, events, a, b, c } = setup();
      store.set([a, b, c]);
      await tick();
      c.remove();
      await tick();
      expect(ids(store.get())).toEqual(['n0', 'n1']);
      expect(store.primary()).toBe(b);
      expect(ids(events[events.length - 1]!.removed)).toEqual(['n2']);
    });

    it('drops nodes removed with an ancestor', async () => {
      const { f, store, a } = setup();
      store.add(a);
      f.get('ul').remove();
      await tick();
      expect(store.get()).toEqual([]);
    });

    it('observes the DOM only while the selection is non-empty', () => {
      const observe = vi.spyOn(MutationObserver.prototype, 'observe');
      const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
      const { store, a, b } = setup();
      expect(observe).not.toHaveBeenCalled();

      store.add(a);
      store.add(b);
      expect(observe).toHaveBeenCalledOnce();

      store.remove([a, b]);
      expect(disconnect).toHaveBeenCalledOnce();

      store.toggle(a);
      expect(observe).toHaveBeenCalledTimes(2);
      store.destroy();
      expect(disconnect).toHaveBeenCalledTimes(2);
    });
  });

  describe('markers', () => {
    const markers = (store: ReturnType<typeof setup>['store'], els: Element[]) =>
      els.map((el) => store.marker(el));

    it('follows selection order, and keeps markers when others are removed', () => {
      const { store, a, b, c, d } = setup();
      store.add(b);
      store.add([a, c]);
      expect(markers(store, [b, a, c])).toEqual(['A', 'B', 'C']);
      store.remove(a);
      expect(markers(store, [b, a, c])).toEqual(['A', null, 'C']);
      // Never reused within a selection: the next one is D.
      store.toggle(d);
      store.toggle(a);
      expect(markers(store, [d, a])).toEqual(['D', 'E']);
    });

    it('starts over when the selection is replaced or cleared', () => {
      const { store, a, b, c } = setup();
      store.add([a, b]);
      store.set([c, a]);
      expect(markers(store, [c, a, b])).toEqual(['A', 'B', null]);
      store.clear();
      store.add(b);
      expect(store.marker(b)).toBe('A');
      store.remove(b);
      store.add(c);
      expect(store.marker(c)).toBe('A');
    });

    it('supports numbers, custom series and off', () => {
      const f = mountFixture('<p id="x" data-dci="x"></p><p id="y" data-dci="y"></p>');
      const [x, y] = [f.get('#x'), f.get('#y')];
      const of = (markers: MarkerSeries | false) => {
        const store = createSelectionStore({ root: f.root, markers });
        store.set([x, y]);
        return [store.marker(x), store.marker(y)];
      };
      expect(of('numbers')).toEqual(['1', '2']);
      expect(of((i) => `R${i + 1}`)).toEqual(['R1', 'R2']);
      expect(of(false)).toEqual([null, null]);
      const store = createSelectionStore({ root: f.root, markers: false });
      store.set([x]);
      expect(store.toContext()[0]).not.toHaveProperty('marker');
    });
  });

  describe('toContext', () => {
    it('serializes the selection and drops private nodes', () => {
      const f = mountFixture(`
        <div id="a" data-dci='{"id":"a","type":"t"}'></div>
        <div id="p" data-dci='{"id":"p","private":true}'></div>`);
      const store = createSelectionStore({ root: f.root, includeAncestors: false });
      store.set([f.get('#a'), f.get('#p')]);
      expect(store.toContext()).toEqual([
        { id: 'a', type: 't', data: {}, source: 'annotated', marker: 'A' },
      ]);
    });
  });

  it('stops notifying after destroy', async () => {
    const { store, a } = setup();
    const fn = vi.fn();
    store.subscribe(fn);
    store.destroy();
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    store.add(a);
    await tick();
    expect(fn).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });
});

describe('createSelectionStore with text items', () => {
  function textSetup(maxSelection?: number) {
    const f = mountFixture(`
      <div id="page" data-dci='{"id":"home","type":"page","label":"Sales Home"}'>
        <p id="p1">Q3 focus: convert Proposal-stage deals before the winter catalog ships.</p>
        <p id="p2">Second paragraph with more words to select from here.</p>
      </div>
      <ul data-dci="list">
        <li id="n0" data-dci="n0">0</li>
        <li id="n1" data-dci="n1">1</li>
        <li id="n2" data-dci="n2">2</li>
      </ul>`);
    const store = createSelectionStore({
      root: f.root,
      ...(maxSelection ? { maxSelection } : {}),
    });
    const events: SelectionChange[] = [];
    store.subscribe((e) => events.push(e));
    const itemFor = (startOff: number, endOff: number, sel = '#p1'): TextSelectionItem => {
      const text = f.get(sel).firstChild as Text;
      const range = document.createRange();
      range.setStart(text, startOff);
      range.setEnd(text, endOff);
      const node = captureTextRange(range, { root: f.root })!;
      return toTextSelectionItem(node, range);
    };
    return { f, store, events, itemFor };
  }

  it('assigns markers across mixed element and text selections, in order', () => {
    const { f, store, itemFor } = textSetup();
    const [a, b] = [f.get('#n0'), f.get('#n1')];
    const t1 = itemFor(0, 8);
    const t2 = itemFor(20, 30);
    store.add(a);
    expect(store.addText(t1)).toBe(true);
    store.add(b);
    expect(store.marker(a)).toBe('A');
    expect(store.markerForText(t1)).toBe('B');
    expect(store.marker(b)).toBe('C');
    expect(store.items()).toEqual([a, t1, b]);
    // Removing B leaves A and C; the next item added gets D.
    store.removeText(t1);
    expect(store.marker(a)).toBe('A');
    expect(store.marker(b)).toBe('C');
    expect(store.markerForText(t1)).toBeNull();
    expect(store.addText(t2)).toBe(true);
    expect(store.markerForText(t2)).toBe('D');
  });

  it('merges both kinds into toContext in selection order', () => {
    const { f, store, itemFor } = textSetup();
    const a = f.get('#n0');
    const t1 = itemFor(0, 8);
    store.add(a);
    store.addText(t1);
    expect(store.toContext()).toEqual([
      expect.objectContaining({ id: 'n0', source: 'annotated', marker: 'A' }),
      expect.objectContaining({ source: 'text', marker: 'B' }),
    ]);
  });

  it('treats capturing the identical range twice as a no-op', async () => {
    const { store, events, itemFor } = textSetup();
    expect(store.addText(itemFor(0, 8))).toBe(true);
    expect(store.addText(itemFor(0, 8))).toBe(false);
    expect(store.textItems()).toHaveLength(1);
    expect(store.hasText(itemFor(0, 8))).toBe(true);
    await tick();
    expect(events).toHaveLength(1);
    expect(events[0]!.addedText).toHaveLength(1);
    expect(events[0]!.textItems).toHaveLength(1);
  });

  it('reports text items in selectionchange events', async () => {
    const { store, events, itemFor } = textSetup();
    const t1 = itemFor(0, 8);
    store.addText(t1);
    await tick();
    expect(events[0]!.addedText).toEqual([t1]);
    expect(events[0]!.removedText).toEqual([]);
    store.removeText(t1);
    await tick();
    expect(events[1]!.removedText).toEqual([t1]);
    expect(events[1]!.textItems).toEqual([]);
    expect(events[1]!.elements).toEqual([]);
  });

  it('set() replaces both kinds and clear() clears both', () => {
    const { f, store, itemFor } = textSetup();
    const a = f.get('#n0');
    const t1 = itemFor(0, 8);
    store.add(a);
    store.addText(t1);
    store.set([f.get('#n1')]);
    expect(store.get()).toHaveLength(1);
    expect(store.textItems()).toEqual([]);
    expect(store.items()).toHaveLength(1);
    // Markers restart after a replace.
    expect(store.marker(f.get('#n1'))).toBe('A');
    store.addText(t1);
    expect(store.markerForText(t1)).toBe('B');
    store.clear();
    expect(store.items()).toEqual([]);
    expect(store.primary()).toBeNull();
    const t2 = itemFor(20, 30);
    store.addText(t2);
    expect(store.markerForText(t2)).toBe('A');
  });

  it('counts text items toward maxSelection and fires selectionlimit', async () => {
    const { f, store, itemFor } = textSetup(2);
    const limits = vi.fn();
    store.on('selectionlimit', limits);
    store.add(f.get('#n0'));
    expect(store.addText(itemFor(0, 8))).toBe(true);
    expect(store.addText(itemFor(20, 30))).toBe(false);
    expect(store.items()).toHaveLength(2);
    await tick();
    expect(limits).toHaveBeenCalledWith({ dropped: 1, max: 2 });
  });

  it('prunes text items whose text changes or whose element leaves the DOM', async () => {
    const { f, store, events, itemFor } = textSetup();
    const t1 = itemFor(0, 8);
    const t2 = itemFor(20, 30, '#p2');
    store.addText(t1);
    store.addText(t2);
    await tick();
    (f.get('#p1').firstChild as Text).data = 'Completely different words now.';
    await tick();
    expect(store.textItems()).toEqual([t2]);
    expect(events[events.length - 1]!.removedText).toEqual([t1]);
    f.get('#p2').remove();
    await tick();
    expect(store.textItems()).toEqual([]);
  });
});
