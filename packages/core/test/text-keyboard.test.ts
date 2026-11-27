import { afterEach, describe, expect, it } from 'vitest';
import {
  createInteractions,
  type InteractionOptions,
  type Interactions,
} from '../src/interactions';
import type { TextSelectionPlumbing } from '../src/text-pill';
import { createTextSelectionStore, makeTextItem, type FakeTextItem } from './text-test-utils';
import { fakeKey, mountFixture } from './test-utils';

const FIXTURE = `
  <p id="para" data-dci='{"id":"para","type":"paragraph","label":"Deal note"}'>Q3 focus: convert Proposal-stage deals before winter.</p>
  <button id="focusable" data-dci='{"id":"btn","label":"Save"}'>Save</button>`;

const tick = () => new Promise((r) => setTimeout(r, 0));

let dci: Interactions | undefined;
afterEach(() => {
  dci?.destroy();
  dci = undefined;
  (document.activeElement as HTMLElement | null)?.blur?.();
});

function setup(item: FakeTextItem | null, options: InteractionOptions = {}) {
  const f = mountFixture(FIXTURE);
  const store = createTextSelectionStore({ root: f.root });
  const said: string[] = [];
  const add = (candidate: FakeTextItem) => {
    if (!store.addText(candidate)) return false;
    const marker = store.markerForText(candidate);
    if (marker) candidate.node = { ...candidate.node, marker };
    return true;
  };
  const plumbing: TextSelectionPlumbing = {
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
  dci = createInteractions({ root: f.root, selection: store, textSelection: plumbing, ...options });
  dci.bus.on('announce', (t) => said.push(t));
  return { f, dci, store, said };
}

describe('Alt+Enter with a text range', () => {
  it('captures a live range instead of selecting the focused node', async () => {
    const f = mountFixture(FIXTURE);
    const item = makeTextItem(f.get('#para'), 'convert Proposal-stage');
    const store = createTextSelectionStore({ root: f.root });
    const said: string[] = [];
    const add = (candidate: FakeTextItem) => {
      if (!store.addText(candidate)) return false;
      const marker = store.markerForText(candidate);
      if (marker) candidate.node = { ...candidate.node, marker };
      return true;
    };
    const plumbing: TextSelectionPlumbing = {
      enabled: true,
      maxLength: 2000,
      actionLabel: 'Ask about this',
      getLiveItem: () => item,
      hasLiveRange: () => true,
      captureLive: () => (add(item) ? item : null),
      addItem: add,
      isChatOpen: () => false,
      openChat: () => {},
    };
    dci = createInteractions({ root: f.root, selection: store, textSelection: plumbing });
    dci.bus.on('announce', (t) => said.push(t));
    const btn = f.get<HTMLButtonElement>('#focusable');
    btn.focus();
    const e = fakeKey('Enter', { altKey: true, target: btn });
    await tick();
    expect(e.defaultPrevented).toBe(true);
    expect(store.textItems()).toHaveLength(1);
    expect(dci.selection.get()).toEqual([]);
    expect(said[0]).toContain('marker A');
  });

  it('without a live range, Alt+Enter selects the focused node as today', async () => {
    const { f, dci, store } = setup(null);
    const btn = f.get<HTMLButtonElement>('#focusable');
    btn.focus();
    const e = fakeKey('Enter', { altKey: true, target: btn });
    await tick();
    expect(e.defaultPrevented).toBe(true);
    expect(dci.selection.get().map((el) => el.id)).toEqual(['focusable']);
    expect(store.textItems()).toEqual([]);
  });

  it('textSelect: false disables the text path only', async () => {
    const f = mountFixture(FIXTURE);
    const item = makeTextItem(f.get('#para'), 'convert Proposal-stage');
    const store = createTextSelectionStore({ root: f.root });
    const add = (candidate: FakeTextItem) => {
      if (!store.addText(candidate)) return false;
      const marker = store.markerForText(candidate);
      if (marker) candidate.node = { ...candidate.node, marker };
      return true;
    };
    const plumbing: TextSelectionPlumbing = {
      enabled: true,
      maxLength: 2000,
      actionLabel: 'Ask about this',
      getLiveItem: () => item,
      hasLiveRange: () => true,
      captureLive: () => (add(item) ? item : null),
      addItem: add,
      isChatOpen: () => false,
      openChat: () => {},
    };
    dci = createInteractions({
      root: f.root,
      selection: store,
      textSelection: plumbing,
      bindings: { textSelect: false },
    });
    const btn = f.get<HTMLButtonElement>('#focusable');
    btn.focus();
    fakeKey('Enter', { altKey: true, target: btn });
    await tick();
    expect(store.textItems()).toEqual([]);
    expect(dci.selection.get().map((el) => el.id)).toEqual(['focusable']);
  });
});

describe('Esc with a visible pill', () => {
  it('the pill is dismissed by the first Esc before the selection clears', async () => {
    // The pill gesture wraps `onEscape` (see textPillGesture): a visible
    // pill makes it return true, so the keyboard gesture keeps the
    // selection. The closure below stands in for the pill's visibility
    // check; the ordering it exercises is the real one.
    const f = mountFixture(FIXTURE);
    const item = makeTextItem(f.get('#para'), 'convert Proposal-stage');
    const store = createTextSelectionStore({ root: f.root });
    let pillVisible = true;
    const plumbing: TextSelectionPlumbing = {
      enabled: true,
      maxLength: 2000,
      actionLabel: 'Ask about this',
      getLiveItem: () => item,
      hasLiveRange: () => true,
      captureLive: () => (store.addText(item) ? item : null),
      addItem: (candidate) => store.addText(candidate),
      isChatOpen: () => false,
      openChat: () => {},
    };
    dci = createInteractions({
      root: f.root,
      selection: store,
      textSelection: plumbing,
      onEscape: () => {
        if (!pillVisible) return false;
        pillVisible = false;
        return true;
      },
    });
    dci.selection.set([f.get('#para')]);
    const first = fakeKey('Escape');
    expect(first.defaultPrevented).toBe(true);
    expect(dci.selection.get().map((el) => el.id)).toEqual(['para']);
    const second = fakeKey('Escape');
    expect(second.defaultPrevented).toBe(true);
    expect(dci.selection.get()).toEqual([]);
  });
});
