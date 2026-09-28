import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSelectionStore, type SelectionChange } from '../src/selection';
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

  describe('toContext', () => {
    it('serializes the selection and drops private nodes', () => {
      const f = mountFixture(`
        <div id="a" data-dci='{"id":"a","type":"t"}'></div>
        <div id="p" data-dci='{"id":"p","private":true}'></div>`);
      const store = createSelectionStore({ root: f.root, includeAncestors: false });
      store.set([f.get('#a'), f.get('#p')]);
      expect(store.toContext()).toEqual([{ id: 'a', type: 't', data: {}, source: 'annotated' }]);
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
