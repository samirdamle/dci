import { afterEach, describe, expect, it } from 'vitest';
import {
  createInteractions,
  type InteractionOptions,
  type Interactions,
} from '../src/interactions';
import type { TextSelectionPlumbing } from '../src/text-pill';
import { createTextSelectionStore, makeTextItem, type FakeTextItem } from './text-test-utils';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

const FIXTURE = `
  <p id="para" data-dci='{"id":"para","type":"paragraph","label":"Deal note"}'>Q3 focus: convert Proposal-stage deals before winter.</p>
  <p id="other" data-dci='{"id":"other","type":"paragraph","label":"Other note"}'>Something else entirely.</p>`;

const tick = () => new Promise((r) => setTimeout(r, 0));

let dci: Interactions | undefined;
afterEach(() => {
  dci?.destroy();
  dci = undefined;
});

/** Plumbing whose live item is `item` (or none), backed by the test store. */
function plumbing(
  store: ReturnType<typeof createTextSelectionStore>,
  item: FakeTextItem | null,
): TextSelectionPlumbing {
  // Mirror `createDci`'s addTextItem: the store assigns the marker, and the
  // item's node is updated with it so announcements carry the marker.
  const add = (candidate: FakeTextItem) => {
    if (!store.addText(candidate)) return false;
    const marker = store.markerForText(candidate);
    if (marker) candidate.node = { ...candidate.node, marker };
    return true;
  };
  return {
    enabled: true,
    maxLength: 2000,
    actionLabel: 'Ask about this',
    getLiveItem: () => item,
    hasLiveRange: () => item !== null,
    captureLive: () => {
      if (!item) return null;
      return add(item) ? item : null;
    },
    addItem: add,
    isChatOpen: () => false,
    openChat: () => {},
  };
}

function setup(item: FakeTextItem | null, options: InteractionOptions = {}) {
  const f = mountFixture(FIXTURE);
  const store = createTextSelectionStore({ root: f.root });
  const said: string[] = [];
  dci = createInteractions({
    root: f.root,
    selection: store,
    textSelection: plumbing(store, item),
    ...options,
  });
  dci.bus.on('announce', (t) => said.push(t));
  fakeKey('Alt', { altKey: true });
  return { f, dci, store, said };
}

/** Build the live item from the same fixture the interactions run on. */
function setupWithRange(text: string) {
  const f = mountFixture(FIXTURE);
  const item = makeTextItem(f.get('#para'), text);
  const store = createTextSelectionStore({ root: f.root });
  const said: string[] = [];
  dci = createInteractions({
    root: f.root,
    selection: store,
    textSelection: plumbing(store, item),
  });
  dci.bus.on('announce', (t) => said.push(t));
  fakeKey('Alt', { altKey: true });
  return { f, dci, store, said, item };
}

describe('Alt+Click on a live text range', () => {
  it('captures the range instead of selecting the node', async () => {
    const { f, dci, store, said } = setupWithRange('convert Proposal-stage');
    const target = f.get('#para');
    fakePointer(target, { type: 'pointerdown', clientX: 10, clientY: 10, altKey: true });
    const click = fakePointer(target, { clientX: 10, clientY: 10, altKey: true });
    await tick();
    expect(store.textItems()).toHaveLength(1);
    expect(store.textItems()[0]!.node).toMatchObject({ source: 'text' });
    expect(
      (store.textItems()[0]!.node as unknown as { text: { excerpt: string } }).text.excerpt,
    ).toBe('convert Proposal-stage');
    expect(dci.selection.get()).toEqual([]);
    expect(click.defaultPrevented).toBe(true);
    expect(said[0]).toContain('Selected text added to chat');
    expect(said[0]).toContain('marker A');
  });

  it('Alt+Click outside the live range selects the node as today', async () => {
    const { f, dci, store } = setupWithRange('convert Proposal-stage');
    fakePointer(f.get('#other'), { type: 'pointerdown', clientX: 10, clientY: 10, altKey: true });
    fakePointer(f.get('#other'), { clientX: 10, clientY: 10, altKey: true });
    await tick();
    expect(store.textItems()).toEqual([]);
    expect(dci.selection.get().map((el) => el.id)).toEqual(['other']);
  });

  it('Alt+Click with no live range selects the node as today', async () => {
    const { f, dci, store } = setup(null);
    fakePointer(f.get('#para'), { type: 'pointerdown', clientX: 10, clientY: 10, altKey: true });
    fakePointer(f.get('#para'), { clientX: 10, clientY: 10, altKey: true });
    await tick();
    expect(store.textItems()).toEqual([]);
    expect(dci.selection.get().map((el) => el.id)).toEqual(['para']);
  });

  it('does nothing when text selection is disabled', async () => {
    const { f, dci, store } = setupWithRange('convert Proposal-stage');
    // Disable via the plumbing flag: the pointer gesture becomes a no-op.
    dci.textSelection!.enabled = false;
    fakePointer(f.get('#para'), { type: 'pointerdown', clientX: 10, clientY: 10, altKey: true });
    fakePointer(f.get('#para'), { clientX: 10, clientY: 10, altKey: true });
    await tick();
    expect(store.textItems()).toEqual([]);
    expect(dci.selection.get().map((el) => el.id)).toEqual(['para']);
  });

  it('a marquee drag after the pointerdown does not capture the snapshot', async () => {
    const { f, store, said } = setupWithRange('convert Proposal-stage');
    const target = f.get('#para');
    fakePointer(target, { type: 'pointerdown', clientX: 0, clientY: 0, altKey: true });
    fakePointer(target, { type: 'pointermove', clientX: 60, clientY: 60, altKey: true });
    fakePointer(target, { type: 'pointerup', clientX: 60, clientY: 60, altKey: true });
    await tick();
    // The drag window-selected nodes (or nothing); it never captured text.
    expect(store.textItems()).toEqual([]);
    expect(said).toEqual([]);
  });
});
