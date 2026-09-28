import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInteractions,
  type InteractionOptions,
  type Interactions,
} from '../src/interactions';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

const FIXTURE = `
  <table id="t" data-dci='{"id":"t","type":"table"}'><tbody>
    <tr id="r1" data-dci='{"id":"r1","type":"row"}'>
      <td id="c1" data-dci='{"id":"c1","type":"cell"}'><b id="text">A</b></td>
      <td id="plain">no annotation</td>
    </tr>
  </tbody></table>
  <p id="outside-node">loose text</p>`;

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

let dci: Interactions | undefined;
afterEach(() => {
  dci?.destroy();
  dci = undefined;
});

function setup(options: InteractionOptions = {}) {
  const f = mountFixture(FIXTURE);
  dci = createInteractions({ root: f.root, ...options });
  const hovers: Array<{ id: string | null; depth: number }> = [];
  dci.bus.on('hover', ({ node, depth }) => hovers.push({ id: node?.id ?? null, depth }));
  fakeKey('Alt', { altKey: true });
  return { f, dci, hovers };
}

const alt = { altKey: true };
const ids = (els: Element[]) => els.map((el) => el.id);

describe('hover preview', () => {
  it('emits the nearest node once per frame while armed', async () => {
    const { f, hovers } = setup();
    fakePointer(f.get('#text'), { type: 'pointermove', ...alt });
    fakePointer(f.get('#text'), { type: 'pointermove', ...alt });
    expect(hovers).toEqual([]);
    await frame();
    expect(hovers).toEqual([{ id: 'c1', depth: 0 }]);
  });

  it('only emits when the target changes', async () => {
    const { f, hovers } = setup();
    fakePointer(f.get('#text'), { type: 'pointermove', ...alt });
    await frame();
    fakePointer(f.get('#c1'), { type: 'pointermove', ...alt });
    await frame();
    expect(hovers).toHaveLength(1);
  });

  it('hovers unannotated elements only when fallback is on', async () => {
    const on = setup();
    fakePointer(on.f.get('#plain'), { type: 'pointermove', ...alt });
    await frame();
    expect(on.hovers[on.hovers.length - 1]).toEqual({ id: 'r1', depth: 0 });
    dci!.destroy();

    const f = mountFixture(`<div id="host"><span id="raw">x</span></div>`);
    dci = createInteractions({ root: f.root });
    const hovers: Array<string | null> = [];
    dci.bus.on('hover', ({ node }) => hovers.push(node?.id ?? null));
    fakeKey('Alt', { altKey: true });
    fakePointer(f.get('#raw'), { type: 'pointermove', ...alt });
    await frame();
    expect(hovers).toEqual(['raw']);
    dci.destroy();

    dci = createInteractions({ root: f.root, fallback: false });
    const none: Array<string | null> = [];
    dci.bus.on('hover', ({ node }) => none.push(node?.id ?? null));
    fakeKey('Alt', { altKey: true });
    fakePointer(f.get('#raw'), { type: 'pointermove', ...alt });
    await frame();
    expect(none).toEqual([]);
  });

  it('clears the hover on disarm', async () => {
    const { f, hovers } = setup();
    fakePointer(f.get('#text'), { type: 'pointermove', ...alt });
    await frame();
    fakeKey('Alt', { type: 'keyup' });
    expect(hovers[hovers.length - 1]).toEqual({ id: null, depth: 0 });
  });

  it('resolves targets inside open shadow roots', async () => {
    const f = mountFixture(`<div id="card" data-dci="card"><div id="host"></div></div>`);
    const shadow = f.get('#host').attachShadow({ mode: 'open' });
    shadow.innerHTML = `<span id="inner" data-dci="inner">x</span>`;
    dci = createInteractions({ root: f.root });
    const hovers: Array<string | null> = [];
    dci.bus.on('hover', ({ node }) => hovers.push(node?.id ?? null));
    fakeKey('Alt', { altKey: true });
    fakePointer(shadow.getElementById('inner')!, { type: 'pointermove', ...alt });
    await frame();
    expect(hovers).toEqual(['inner']);
  });
});

describe('Mod+Click', () => {
  it('selects the innermost annotated node, replacing the selection', () => {
    const { f, dci } = setup();
    fakePointer(f.get('#r1'), alt);
    fakePointer(f.get('#text'), alt);
    expect(ids(dci.selection.get())).toEqual(['c1']);
    expect(dci.selection.primary()?.id).toBe('c1');
  });

  it('selects the annotated parent of an unannotated child', () => {
    const { f, dci } = setup();
    fakePointer(f.get('#plain'), alt);
    expect(ids(dci.selection.get())).toEqual(['r1']);
  });

  it('toggles with Mod+Shift+Click', () => {
    const { f, dci } = setup();
    fakePointer(f.get('#text'), alt);
    fakePointer(f.get('#r1'), { ...alt, shiftKey: true });
    expect(ids(dci.selection.get())).toEqual(['c1', 'r1']);
    fakePointer(f.get('#text'), { ...alt, shiftKey: true });
    expect(ids(dci.selection.get())).toEqual(['r1']);
  });

  it('clears on an empty-space click unless disabled', () => {
    const { f, dci } = setup({ fallback: false });
    fakePointer(f.get('#text'), alt);
    fakePointer(f.get('#outside-node'), alt);
    expect(dci.selection.get()).toEqual([]);
    dci.destroy();

    const again = setup({ fallback: false, clearOnEmptyClick: false });
    fakePointer(again.f.get('#text'), alt);
    fakePointer(again.f.get('#outside-node'), alt);
    expect(ids(again.dci.selection.get())).toEqual(['c1']);
  });

  it('selects the raw element as a fallback node', () => {
    const { f, dci } = setup();
    fakePointer(f.get('#outside-node'), alt);
    expect(ids(dci.selection.get())).toEqual(['outside-node']);
  });

  it('uses the hover target when a depth offset is active', async () => {
    const { f, dci } = setup();
    fakePointer(f.get('#text'), { type: 'pointermove', ...alt });
    await frame();
    dci.hover.setDepth(1);
    fakePointer(f.get('#text'), alt);
    expect(ids(dci.selection.get())).toEqual(['r1']);
  });

  it('respects disabled bindings', () => {
    const { f, dci } = setup({ bindings: { select: false, toggle: false } });
    fakePointer(f.get('#text'), alt);
    fakePointer(f.get('#text'), { ...alt, shiftKey: true });
    expect(dci.selection.get()).toEqual([]);
  });

  it('supports a remapped toggle modifier', () => {
    const { f, dci } = setup({ bindings: { toggle: 'Meta' } });
    fakePointer(f.get('#text'), { ...alt, metaKey: true });
    fakePointer(f.get('#r1'), { ...alt, metaKey: true });
    expect(ids(dci.selection.get())).toEqual(['c1', 'r1']);
  });

  it('ignores non-primary buttons', () => {
    const { f, dci } = setup();
    fakePointer(f.get('#text'), { ...alt, button: 2 });
    expect(dci.selection.get()).toEqual([]);
  });

  describe('host click handlers', () => {
    it('do not fire on a DCI click', () => {
      const { f } = setup();
      const host = vi.fn();
      f.get('#text').addEventListener('click', host);
      const e = fakePointer(f.get('#text'), alt);
      expect(host).not.toHaveBeenCalled();
      expect(e.defaultPrevented).toBe(true);
    });

    it('fire on a normal click', () => {
      const { f, dci } = setup();
      fakeKey('Alt', { type: 'keyup' });
      const host = vi.fn();
      f.get('#text').addEventListener('click', host);
      fakePointer(f.get('#text'));
      expect(host).toHaveBeenCalledOnce();
      expect(dci.selection.get()).toEqual([]);
    });

    it('fire alongside DCI with passthroughClicks', () => {
      const { f, dci } = setup({ passthroughClicks: true });
      const host = vi.fn();
      f.get('#text').addEventListener('click', host);
      fakePointer(f.get('#text'), alt);
      expect(host).toHaveBeenCalledOnce();
      expect(ids(dci.selection.get())).toEqual(['c1']);
    });
  });
});

describe('hover state', () => {
  it('clamps depth to the node chain and resets on a new leaf', async () => {
    const { f, dci, hovers } = setup();
    fakePointer(f.get('#text'), { type: 'pointermove', ...alt });
    await frame();
    dci.hover.setDepth(5);
    expect(dci.hover.node()?.id).toBe('t');
    expect(dci.hover.depth()).toBe(2);
    dci.hover.setDepth(-1);
    expect(dci.hover.depth()).toBe(0);
    expect(ids(dci.hover.chain())).toEqual(['c1', 'r1', 't']);
    dci.hover.setLeaf(f.get('#r1'));
    expect(dci.hover.depth()).toBe(0);
    expect(hovers.map((h) => `${h.id}:${h.depth}`)).toEqual(['c1:0', 't:2', 'c1:0', 'r1:0']);
  });
});
