import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInteractions,
  type InteractionOptions,
  type Interactions,
} from '../src/interactions';
import { LONG_PRESS_MS, SELECT_MODE_CLASS } from '../src/touch';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

const FIXTURE = `
  <ul id="list" data-dci='{"id":"list","type":"list"}'>
    <li id="a" data-dci='{"id":"a","type":"deal"}'><b id="a-text">A</b></li>
    <li id="b" data-dci='{"id":"b","type":"deal"}'>B</li>
    <li id="c" data-dci='{"id":"c","type":"deal"}'>C</li>
  </ul>
  <p id="plain">no annotation</p>
  <input id="field" />`;

let dci: Interactions | undefined;
afterEach(() => {
  dci?.destroy();
  dci = undefined;
  vi.useRealTimers();
});

function setup(options: InteractionOptions = {}) {
  const f = mountFixture(FIXTURE);
  dci = createInteractions({ root: f.root, overlay: false, ...options });
  const modes: boolean[] = [];
  dci.bus.on('selectmode', (on) => modes.push(on));
  return { f, dci, modes };
}

const ids = (els: Element[]) => els.map((el) => el.id);

/** A finger touching `el`: `pointerdown` with `pointerType: 'touch'`. */
function touchDown(el: Element, init: PointerEventInit = {}) {
  el.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 7,
      pointerType: 'touch',
      ...init,
    }),
  );
}

function touchEvent(el: Element, type: 'pointermove' | 'pointerup', init: PointerEventInit = {}) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      composed: true,
      pointerId: 7,
      pointerType: 'touch',
      ...init,
    }),
  );
}

/** A tap: touch down, then the click the browser sends. */
function tap(el: Element) {
  touchDown(el);
  touchEvent(el, 'pointerup');
  return fakePointer(el);
}

describe('select mode', () => {
  it('arms without the modifier and taps toggle nodes in and out', () => {
    const { f, dci, modes } = setup();
    dci.input.setLocked(true);
    expect(dci.input.isArmed()).toBe(true);
    expect(modes).toEqual([true]);

    expect(tap(f.get('#a')).defaultPrevented).toBe(true);
    tap(f.get('#b'));
    expect(ids(dci.selection.get())).toEqual(['a', 'b']);
    // Wait out the double-tap window before tapping `a` again.
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);
    fakePointer(f.get('#a'), { type: 'pointerdown' });
    fakePointer(f.get('#a'));
    expect(ids(dci.selection.get())).toEqual(['b']);
  });

  it('a tap on empty space clears', () => {
    const { f, dci } = setup();
    dci.input.setLocked(true);
    tap(f.get('#a'));
    tap(f.get('#plain'));
    // Fallback is on, so the paragraph itself is a target.
    expect(ids(dci.selection.get())).toEqual(['a', 'plain']);
    tap(f.root);
    expect(dci.selection.get()).toEqual([]);
  });

  it('stays armed when the modifier is released or the window blurs', () => {
    const { dci } = setup();
    dci.input.setLocked(true);
    fakeKey('Alt', { altKey: true });
    fakeKey('Alt', { type: 'keyup' });
    window.dispatchEvent(new Event('blur'));
    expect(dci.input.isArmed()).toBe(true);
    dci.input.setLocked(false);
    expect(dci.input.isArmed()).toBe(false);
  });

  it('marks the root for touch-friendly CSS while on', () => {
    const { f, dci: interactions, modes } = setup();
    interactions.input.setLocked(true);
    expect(f.root.classList.contains(SELECT_MODE_CLASS)).toBe(true);
    expect(document.adoptedStyleSheets).toHaveLength(1);
    interactions.input.setLocked(false);
    expect(f.root.classList.contains(SELECT_MODE_CLASS)).toBe(false);
    expect(document.adoptedStyleSheets).toHaveLength(0);
    expect(modes).toEqual([true, false]);
    // Destroying while on removes them too.
    interactions.input.setLocked(true);
    interactions.destroy();
    dci = undefined;
    expect(f.root.classList.contains(SELECT_MODE_CLASS)).toBe(false);
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('leaves presses outside the root alone', () => {
    const { f, dci } = setup();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    dci.input.setLocked(true);
    expect(fakePointer(outside, { type: 'pointerdown' }).defaultPrevented).toBe(false);
    expect(fakePointer(f.get('#a'), { type: 'pointerdown' }).defaultPrevented).toBe(true);
    expect(fakePointer(outside).defaultPrevented).toBe(false);
    outside.remove();
  });

  it('a double tap selects every node of the same type', () => {
    const { f, dci } = setup();
    dci.input.setLocked(true);
    tap(f.get('#a-text'));
    tap(f.get('#a-text'));
    expect(ids(dci.selection.get())).toEqual(['a', 'b', 'c']);
  });

  it('two mouse clicks are not a double tap', () => {
    const { f, dci } = setup();
    dci.input.setLocked(true);
    for (let i = 0; i < 2; i++) {
      fakePointer(f.get('#a'), { type: 'pointerdown' });
      fakePointer(f.get('#a'));
    }
    expect(dci.selection.get()).toEqual([]);
  });
});

describe('long press', () => {
  it('turns select mode on and selects the node', () => {
    vi.useFakeTimers();
    const { f, dci, modes } = setup();
    dci.selection.set([f.get('#c')]);
    touchDown(f.get('#a-text'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(modes).toEqual([true]);
    expect(ids(dci.selection.get())).toEqual(['a']);
    touchEvent(f.get('#a-text'), 'pointerup');
    // The click after the press is swallowed, not a toggle.
    expect(fakePointer(f.get('#a-text')).defaultPrevented).toBe(true);
    expect(ids(dci.selection.get())).toEqual(['a']);
  });

  it("only swallows the press's own click, not the next tap", () => {
    vi.useFakeTimers();
    const { f } = setup();
    const button = document.createElement('button');
    button.setAttribute('data-dci-ui', '');
    f.root.appendChild(button);
    touchDown(f.get('#a'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    touchEvent(f.get('#a'), 'pointerup');
    touchDown(button);
    expect(fakePointer(button).defaultPrevented).toBe(false);
  });

  it('a short press, a scroll or a mouse does nothing', () => {
    vi.useFakeTimers();
    const { f, dci } = setup();
    touchDown(f.get('#a'));
    vi.advanceTimersByTime(LONG_PRESS_MS / 2);
    touchEvent(f.get('#a'), 'pointerup');
    touchDown(f.get('#a'), { clientX: 0, clientY: 0 });
    touchEvent(f.get('#a'), 'pointermove', { clientX: 0, clientY: 40 });
    fakePointer(f.get('#a'), { type: 'pointerdown' });
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(dci.input.isLocked()).toBe(false);
    expect(dci.selection.get()).toEqual([]);
  });

  it('skips unannotated elements and text fields', () => {
    vi.useFakeTimers();
    const { f, dci } = setup();
    touchDown(f.get('#plain'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    touchDown(f.get('#field'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(dci.input.isLocked()).toBe(false);
  });

  it('takes over the context menu on the node', () => {
    vi.useFakeTimers();
    const { f, dci } = setup();
    touchDown(f.get('#b'));
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    f.get('#b').dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(ids(dci.selection.get())).toEqual(['b']);
  });

  it('can be turned off', () => {
    vi.useFakeTimers();
    const { f, dci } = setup({ bindings: { longPress: false } });
    touchDown(f.get('#a'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(dci.input.isLocked()).toBe(false);
  });
});
