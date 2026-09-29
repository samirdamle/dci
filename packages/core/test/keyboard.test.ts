import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnnouncer, describeNode } from '../src/announce';
import {
  createInteractions,
  type InteractionOptions,
  type Interactions,
} from '../src/interactions';
import { createDciTree } from '../src/tree';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

const FIXTURE = `
  <table id="t" data-dci='{"id":"t","type":"table","label":"Invoices"}'><tbody>
    <tr id="r1" data-dci='{"id":"r1","type":"row","label":"Invoice #1"}'>
      <td id="a" data-dci='{"id":"a","type":"cell"}'>A</td><td id="b" data-dci='{"id":"b","type":"cell"}'>B</td>
    </tr>
    <tr id="r2" data-dci='{"id":"r2","type":"row","label":"Invoice #2"}'>
      <td id="c" data-dci='{"id":"c","type":"cell"}'>C</td>
    </tr>
  </tbody></table>
  <button id="focusable" data-dci='{"id":"btn","label":"Save"}'><span id="btn-inner">Save</span></button>
  <input id="field" />`;

let dci: Interactions | undefined;
afterEach(() => {
  dci?.destroy();
  dci = undefined;
  (document.activeElement as HTMLElement | null)?.blur?.();
});

function setup(options: InteractionOptions = {}) {
  const f = mountFixture(FIXTURE);
  dci = createInteractions({ root: f.root, ...options });
  const boundaries: string[] = [];
  const said: string[] = [];
  dci.bus.on('navboundary', ({ direction }) => boundaries.push(direction));
  dci.bus.on('announce', (t) => said.push(t));
  return { f, dci, boundaries, said };
}
const ids = (els: Element[]) => els.map((el) => el.id);

describe('keyboard navigation', () => {
  it('moves in every direction, replacing the selection', () => {
    const { f, dci } = setup();
    dci.selection.set([f.get('#a')]);
    fakeKey('ArrowRight');
    expect(ids(dci.selection.get())).toEqual(['b']);
    fakeKey('ArrowLeft');
    expect(ids(dci.selection.get())).toEqual(['a']);
    fakeKey('ArrowUp');
    expect(ids(dci.selection.get())).toEqual(['r1']);
    fakeKey('ArrowRight');
    expect(ids(dci.selection.get())).toEqual(['r2']);
    fakeKey('ArrowDown');
    expect(ids(dci.selection.get())).toEqual(['c']);
  });

  it('extends with Shift and moves the primary node', () => {
    const { f, dci } = setup();
    dci.selection.set([f.get('#a')]);
    fakeKey('ArrowRight', { shiftKey: true });
    expect(ids(dci.selection.get())).toEqual(['a', 'b']);
    expect(dci.selection.primary()?.id).toBe('b');
    fakeKey('ArrowLeft', { shiftKey: true });
    expect(ids(dci.selection.get())).toEqual(['a', 'b']);
    expect(dci.selection.primary()?.id).toBe('a');
  });

  it('emits navboundary at the edges and does nothing else', () => {
    const { f, dci, boundaries } = setup();
    dci.selection.set([f.get('#a')]);
    fakeKey('ArrowLeft');
    fakeKey('ArrowDown');
    dci.selection.set([f.get('#t')]);
    fakeKey('ArrowUp');
    expect(boundaries).toEqual(['prev', 'child', 'parent']);
    expect(ids(dci.selection.get())).toEqual(['t']);
  });

  it('only consumes keys it handles', () => {
    const { f, dci } = setup();
    expect(fakeKey('ArrowDown').defaultPrevented).toBe(false);
    dci.selection.set([f.get('#a')]);
    expect(fakeKey('ArrowRight').defaultPrevented).toBe(true);
    expect(fakeKey('PageDown').defaultPrevented).toBe(false);
    expect(fakeKey('ArrowLeft', { altKey: true }).defaultPrevented).toBe(false);
  });

  it('is inactive while focus is in an editable field', () => {
    const { f, dci } = setup();
    dci.selection.set([f.get('#a')]);
    const field = f.get<HTMLInputElement>('#field');
    field.focus();
    expect(fakeKey('ArrowRight', { target: field }).defaultPrevented).toBe(false);
    expect(fakeKey('Escape', { target: field }).defaultPrevented).toBe(false);
    expect(ids(dci.selection.get())).toEqual(['a']);
  });

  it('leaves keys to a host dialog that has focus', () => {
    const { f, dci } = setup();
    dci.selection.set([f.get('#a')]);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<button id="dialog-btn">OK</button>';
    document.body.appendChild(dialog);
    const button = dialog.querySelector<HTMLButtonElement>('button')!;
    button.focus();
    expect(fakeKey('Escape', { target: button }).defaultPrevented).toBe(false);
    expect(fakeKey('ArrowRight', { target: button }).defaultPrevented).toBe(false);
    expect(ids(dci.selection.get())).toEqual(['a']);
    dialog.remove();
  });

  it('scrolls the new primary node into view', () => {
    const { f, dci } = setup();
    const scroll = vi.fn();
    f.get('#b').scrollIntoView = scroll;
    dci.selection.set([f.get('#a')]);
    fakeKey('ArrowRight');
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('supports remapped and disabled keys', () => {
    const { f, dci } = setup({ bindings: { keyboard: { nextSibling: 'l', prevSibling: false } } });
    dci.selection.set([f.get('#a')]);
    fakeKey('ArrowRight');
    fakeKey('l');
    expect(ids(dci.selection.get())).toEqual(['b']);
    fakeKey('ArrowLeft');
    expect(ids(dci.selection.get())).toEqual(['b']);
  });

  it('can be disabled entirely', () => {
    const { f, dci } = setup({ bindings: { keyboard: false } });
    dci.selection.set([f.get('#a')]);
    fakeKey('ArrowRight');
    fakeKey('Escape');
    expect(ids(dci.selection.get())).toEqual(['a']);
  });

  describe('Esc', () => {
    it('clears the selection', () => {
      const { f, dci } = setup();
      dci.selection.set([f.get('#a')]);
      expect(fakeKey('Escape').defaultPrevented).toBe(true);
      expect(dci.selection.get()).toEqual([]);
    });

    it('closes the chat first when it is open, then clears', () => {
      let chatOpen = true;
      const { f, dci } = setup({
        onEscape: () => {
          if (!chatOpen) return false;
          chatOpen = false;
          return true;
        },
      });
      dci.selection.set([f.get('#a')]);
      fakeKey('Escape');
      expect(chatOpen).toBe(false);
      expect(ids(dci.selection.get())).toEqual(['a']);
      fakeKey('Escape');
      expect(dci.selection.get()).toEqual([]);
    });
  });
});

describe('keyboard-only selection', () => {
  it("Alt+Enter selects the focused element's node", () => {
    const { f, dci, said } = setup();
    const btn = f.get<HTMLButtonElement>('#focusable');
    btn.focus();
    fakeKey('Alt', { altKey: true, target: btn });
    const e = fakeKey('Enter', { altKey: true, target: btn });
    expect(e.defaultPrevented).toBe(true);
    expect(ids(dci.selection.get())).toEqual(['focusable']);
    expect(said).toEqual(['Selected Save']);
  });

  it('does nothing when the focused element has no DCI node', () => {
    const { f, dci } = setup();
    const field = f.get<HTMLInputElement>('#field');
    field.focus();
    expect(fakeKey('Enter', { altKey: true, target: field }).defaultPrevented).toBe(false);
    expect(dci.selection.get()).toEqual([]);
  });
});

describe('announcements', () => {
  it('describes the node and its position among same-type siblings', () => {
    const { f, dci, said } = setup();
    dci.selection.set([f.get('#r1')]);
    fakeKey('ArrowRight');
    fakeKey('ArrowDown');
    fakeKey('ArrowUp', { shiftKey: true });
    fakeKey('Escape');
    expect(said).toEqual([
      'Selected Invoice #2, row 2 of 2',
      'Selected c',
      'Added Invoice #2, row 2 of 2',
      'Selection cleared',
    ]);
  });

  it('reports when the selection limit blocks an extend', () => {
    const { f, dci, said } = setup({ maxSelection: 1 });
    dci.selection.set([f.get('#a')]);
    fakeKey('ArrowRight', { shiftKey: true });
    expect(said).toEqual(['Limit reached, not added b, cell 2 of 2']);
  });

  it('describeNode falls back to id and tag name', () => {
    const f = mountFixture(
      `<ul data-dci="list"><li id="x" data-dci="x"></li><li id="y" data-dci=""></li></ul>`,
    );
    const tree = createDciTree({ root: f.root });
    expect(describeNode(f.get('#x'), tree)).toBe('x');
    expect(describeNode(f.get('#y'), tree)).toBe('li');
  });

  it('writes to a polite live region inside the DCI shadow root', () => {
    const { f, dci: local } = setup();
    local.selection.set([f.get('#a')]);
    fakeKey('ArrowRight');
    const host = document.querySelector('dci-root[data-dci-ui]');
    const region = host?.shadowRoot?.querySelector(
      '[data-layer="live-region"] [aria-live="polite"]',
    );
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.textContent).toBe('Selected b, cell 2 of 2');
    local.destroy();
    dci = undefined;
    expect(document.querySelector('dci-root')).toBeNull();
  });

  it('createAnnouncer can render into a given parent', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const announcer = createAnnouncer(shadow);
    announcer.announce('hello');
    expect(shadow.querySelector('[aria-live]')?.textContent).toBe('hello');
    announcer.destroy();
    expect(shadow.querySelector('[aria-live]')).toBeNull();
  });
});

describe('Esc during a window-select drag', () => {
  it('cancels the drag without clearing the selection', async () => {
    const { f, dci } = setup();
    dci.selection.set([f.get('#c')]);
    fakeKey('Alt', { altKey: true });
    const target = f.get('#a');
    fakePointer(target, { type: 'pointerdown', clientX: 0, clientY: 0, altKey: true });
    fakePointer(target, { type: 'pointermove', clientX: 50, clientY: 50, altKey: true });
    fakeKey('Escape', { altKey: true });
    expect(ids(dci.selection.get())).toEqual(['c']);
  });
});
