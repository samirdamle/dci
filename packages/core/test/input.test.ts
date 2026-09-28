import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInputManager, type InputManager } from '../src/input';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

let input: InputManager | undefined;
afterEach(() => {
  input?.destroy();
  input = undefined;
  vi.restoreAllMocks();
});

const press = (mod = 'Alt') => fakeKey(mod, { altKey: mod === 'Alt' });
const release = (mod = 'Alt') => fakeKey(mod, { type: 'keyup' });

describe('createInputManager', () => {
  it('attaches only keydown, keyup and blur while idle', () => {
    const add = vi.spyOn(window, 'addEventListener');
    input = createInputManager();
    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(['blur', 'keydown', 'keyup']);
  });

  it('arms while the modifier is held and attaches pointer listeners', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    input = createInputManager();
    const changes: boolean[] = [];
    input.onArmChange((a) => changes.push(a));

    press();
    expect(input.isArmed()).toBe(true);
    const armedTypes = add.mock.calls.map((c) => c[0]).slice(3);
    expect(armedTypes.sort()).toEqual(['click', 'dblclick', 'pointerdown', 'pointermove', 'wheel']);
    const wheel = add.mock.calls.find((c) => c[0] === 'wheel')![2] as AddEventListenerOptions;
    expect(wheel).toMatchObject({ capture: true, passive: false });

    release();
    expect(input.isArmed()).toBe(false);
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual([
      'click',
      'dblclick',
      'pointerdown',
      'pointermove',
      'wheel',
    ]);
    expect(changes).toEqual([true, false]);
  });

  it('disarms on window blur and when the page is hidden', () => {
    input = createInputManager();
    press();
    window.dispatchEvent(new Event('blur'));
    expect(input.isArmed()).toBe(false);

    press();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(input.isArmed()).toBe(false);
  });

  it('ignores repeated keydowns and other keys for arming', () => {
    input = createInputManager();
    const changes: boolean[] = [];
    input.onArmChange((a) => changes.push(a));
    fakeKey('a');
    press();
    press();
    expect(changes).toEqual([true]);
  });

  it('supports a remapped modifier', () => {
    input = createInputManager({ modifier: 'Meta' });
    press('Alt');
    expect(input.isArmed()).toBe(false);
    fakeKey('Meta', { metaKey: true });
    expect(input.isArmed()).toBe(true);

    const f = mountFixture(`<button id="b"></button>`);
    const fn = vi.fn(() => 'consume' as const);
    input.on('click', fn);
    fakePointer(f.get('#b'), { metaKey: true });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('routes armed events to handlers only while armed', () => {
    const f = mountFixture(`<button id="b"></button>`);
    input = createInputManager();
    const fn = vi.fn();
    input.on('click', fn);
    fakePointer(f.get('#b'), { altKey: true });
    expect(fn).not.toHaveBeenCalled();
    press();
    fakePointer(f.get('#b'), { altKey: true });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('disarms when an armed event arrives without the modifier held', () => {
    const f = mountFixture(`<button id="b"></button>`);
    input = createInputManager();
    const fn = vi.fn();
    input.on('pointermove', fn);
    press();
    fakePointer(f.get('#b'), { type: 'pointermove' });
    expect(fn).not.toHaveBeenCalled();
    expect(input.isArmed()).toBe(false);
  });

  describe('event suppression', () => {
    it('prevents default and stops propagation when a gesture consumes the event', () => {
      const f = mountFixture(`<a id="link" href="#x">x</a>`);
      const host = vi.fn();
      f.get('#link').addEventListener('click', host);
      input = createInputManager();
      input.on('click', () => 'consume');
      press();
      const e = fakePointer(f.get('#link'), { altKey: true });
      expect(e.defaultPrevented).toBe(true);
      expect(host).not.toHaveBeenCalled();
    });

    it('leaves events alone when no gesture happened', () => {
      const f = mountFixture(`<a id="link" href="#x">x</a>`);
      const host = vi.fn();
      f.get('#link').addEventListener('click', host);
      input = createInputManager();
      input.on('click', () => undefined);
      press();
      const e = fakePointer(f.get('#link'), { altKey: true });
      expect(e.defaultPrevented).toBe(false);
      expect(host).toHaveBeenCalledOnce();
    });

    it("lets 'handled' events through to the host", () => {
      const f = mountFixture(`<button id="b"></button>`);
      const host = vi.fn();
      f.get('#b').addEventListener('click', host);
      input = createInputManager();
      input.on('click', () => 'handled');
      press();
      const e = fakePointer(f.get('#b'), { altKey: true });
      expect(e.defaultPrevented).toBe(false);
      expect(host).toHaveBeenCalledOnce();
    });

    it('ignores events from the DCI UI', () => {
      const f = mountFixture(`<div data-dci-ui><button id="ui"></button></div>`);
      input = createInputManager();
      const fn = vi.fn(() => 'consume' as const);
      const keyFn = vi.fn(() => 'consume' as const);
      input.on('click', fn);
      input.onKeyDown(keyFn);
      press();
      fakePointer(f.get('#ui'), { altKey: true });
      fakeKey('ArrowUp', { target: f.get('#ui') });
      expect(fn).not.toHaveBeenCalled();
      expect(keyFn).not.toHaveBeenCalled();
    });
  });

  describe('Alt keyup (Firefox menu bar)', () => {
    it('is prevented only when a gesture used the Alt press', () => {
      const f = mountFixture(`<button id="b"></button>`);
      input = createInputManager();
      input.on('click', () => 'consume');

      press();
      expect(release().defaultPrevented).toBe(false);

      press();
      fakePointer(f.get('#b'), { altKey: true });
      expect(release().defaultPrevented).toBe(true);

      press();
      expect(release().defaultPrevented).toBe(false);
    });

    it('is never prevented for other modifiers', () => {
      const f = mountFixture(`<button id="b"></button>`);
      input = createInputManager({ modifier: 'Control' });
      input.on('click', () => 'consume');
      fakeKey('Control', { ctrlKey: true });
      fakePointer(f.get('#b'), { ctrlKey: true });
      expect(fakeKey('Control', { type: 'keyup' }).defaultPrevented).toBe(false);
    });
  });

  it('routes non-modifier keydowns to key handlers, armed or not', () => {
    input = createInputManager();
    const keys: string[] = [];
    input.onKeyDown((e) => {
      keys.push(e.key);
      return e.key === 'Escape' ? 'consume' : undefined;
    });
    fakeKey('ArrowUp');
    press();
    const esc = fakeKey('Escape', { altKey: true });
    expect(keys).toEqual(['ArrowUp', 'Escape']);
    expect(esc.defaultPrevented).toBe(true);
  });

  it('stops at the first handler that consumes, in registration order', () => {
    input = createInputManager();
    const calls: string[] = [];
    input.onKeyDown(() => void calls.push('first'));
    input.onKeyDown(() => {
      calls.push('second');
      return 'consume';
    });
    input.onKeyDown(() => void calls.push('third'));
    fakeKey('Escape');
    expect(calls).toEqual(['first', 'second']);
  });

  it('removes every listener on destroy', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    input = createInputManager();
    press();
    input.destroy();
    const types = remove.mock.calls.map((c) => c[0]);
    expect(types).toEqual(expect.arrayContaining(['keydown', 'keyup', 'blur', 'wheel', 'click']));
    expect(input.isArmed()).toBe(false);
    input = undefined;
  });
});
