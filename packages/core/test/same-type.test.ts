import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInteractions,
  type InteractionOptions,
  type Interactions,
} from '../src/interactions';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

const FIXTURE = `
  <ul id="list" data-dci="list">
    <li id="i1" data-dci='{"id":"i1","type":"invoice"}'><b id="i1-text">1</b></li>
    <li id="q1" data-dci='{"id":"q1","type":"quote"}'></li>
    <li id="i2" data-dci='{"id":"i2","type":"invoice"}'></li>
    <li id="i3" data-dci='{"id":"i3","type":"invoice"}'></li>
    <li id="u1" data-dci="u1"></li>
    <li id="u2" data-dci="u2"></li>
    <div id="u3" data-dci="u3"></div>
  </ul>
  <div id="loose">
    <p id="p1">a</p><p id="p2">b</p><span id="s1">c</span><p id="p3">d</p>
  </div>`;

let dci: Interactions | undefined;
afterEach(() => {
  dci?.destroy();
  dci = undefined;
});

function setup(options: InteractionOptions = {}) {
  const f = mountFixture(FIXTURE);
  dci = createInteractions({ root: f.root, ...options });
  fakeKey('Alt', { altKey: true });
  return { f, dci };
}
const ids = (els: Element[]) => els.map((el) => el.id);
const dbl = (el: Element, extra = {}) =>
  fakePointer(el, { type: 'dblclick', altKey: true, ...extra });

describe('Mod+Double-click', () => {
  it('selects typed siblings only, excluding other types', () => {
    const { f, dci } = setup();
    const e = dbl(f.get('#i1-text'));
    expect(ids(dci.selection.get())).toEqual(['i1', 'i2', 'i3']);
    expect(e.defaultPrevented).toBe(true);
  });

  it('adds with Shift', () => {
    const { f, dci } = setup();
    dci.selection.set([f.get('#q1')]);
    dbl(f.get('#i2'), { shiftKey: true });
    expect(ids(dci.selection.get())).toEqual(['q1', 'i1', 'i2', 'i3']);
  });

  it('expands a single click selection (click, then dblclick)', () => {
    const { f, dci } = setup();
    fakePointer(f.get('#i2'), { altKey: true });
    expect(ids(dci.selection.get())).toEqual(['i2']);
    dbl(f.get('#i2'));
    expect(ids(dci.selection.get())).toEqual(['i1', 'i2', 'i3']);
  });

  it('falls back to same-tag siblings for untyped nodes when fallback is on', () => {
    const { f, dci } = setup();
    dbl(f.get('#u1'));
    expect(ids(dci.selection.get())).toEqual(['i1', 'q1', 'i2', 'i3', 'u1', 'u2']);
  });

  it('uses same-tag element siblings for unannotated fallback targets', () => {
    const { f, dci } = setup();
    dbl(f.get('#p2'));
    expect(ids(dci.selection.get())).toEqual(['p1', 'p2', 'p3']);
  });

  it('does nothing for untyped nodes when fallback is off', () => {
    const { f, dci } = setup({ fallback: false });
    const e = dbl(f.get('#u1'));
    expect(dci.selection.get()).toEqual([]);
    expect(e.defaultPrevented).toBe(false);
  });

  it('respects the maxSelection cap', async () => {
    const { f, dci } = setup({ maxSelection: 2 });
    const limits = vi.fn();
    dci.selection.on('selectionlimit', limits);
    dbl(f.get('#i1'));
    expect(ids(dci.selection.get())).toEqual(['i1', 'i2']);
    await new Promise((r) => setTimeout(r, 0));
    expect(limits).toHaveBeenCalledWith({ dropped: 1, max: 2 });
  });

  it('does nothing when disabled', () => {
    const { f, dci } = setup({ bindings: { selectSameType: false } });
    dbl(f.get('#i1'));
    expect(dci.selection.get()).toEqual([]);
  });
});

describe('selectSameType()', () => {
  it('defaults to the primary node', () => {
    const { f, dci } = setup();
    dci.selection.set([f.get('#q1'), f.get('#i3')]);
    expect(ids(dci.selectSameType())).toEqual(['i1', 'i2', 'i3']);
    expect(ids(dci.selection.get())).toEqual(['i1', 'i2', 'i3']);
  });

  it('accepts a node and the add option', () => {
    const { f, dci } = setup();
    dci.selection.set([f.get('#u1')]);
    dci.selectSameType(f.get('#q1'), { add: true });
    expect(ids(dci.selection.get())).toEqual(['u1', 'q1']);
  });

  it('returns [] with no primary node', () => {
    const { dci } = setup();
    expect(dci.selectSameType()).toEqual([]);
  });
});
