import { describe, expect, it } from 'vitest';
import { resolveBindings, DEFAULT_BINDINGS } from '../src/bindings';
import { createEmitter } from '../src/emitter';
import { hasModifier, isEditable, isFromDciUi, matchesCombo } from '../src/keys';
import { mountFixture } from './test-utils';

const key = (k: string, mods: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { key: k, ...mods });

describe('hasModifier', () => {
  it('reads event flags, not event.key', () => {
    // Option+E on macOS produces a dead key, but altKey is still set.
    const e = key('´', { altKey: true });
    expect(hasModifier(e, 'Alt')).toBe(true);
    expect(hasModifier(e, 'Shift')).toBe(false);
    expect(hasModifier(key('a', { metaKey: true }), 'Meta')).toBe(true);
    expect(hasModifier(key('a', { ctrlKey: true }), 'Control')).toBe(true);
  });
});

describe('matchesCombo', () => {
  it('matches a bare key and ignores extra modifiers unless exact', () => {
    expect(matchesCombo(key('Escape'), 'Escape')).toBe(true);
    expect(matchesCombo(key('ArrowUp', { shiftKey: true }), 'ArrowUp')).toBe(true);
    expect(matchesCombo(key('ArrowUp', { shiftKey: true }), 'ArrowUp', true)).toBe(false);
  });

  it('requires listed modifiers', () => {
    expect(matchesCombo(key('Enter', { altKey: true }), 'Alt+Enter')).toBe(true);
    expect(matchesCombo(key('Enter'), 'Alt+Enter')).toBe(false);
    expect(matchesCombo(key('enter', { altKey: true, shiftKey: true }), 'Alt+Shift+Enter')).toBe(
      true,
    );
    expect(matchesCombo(key('x'), 'Enter')).toBe(false);
  });
});

describe('isEditable', () => {
  it('detects text fields and contenteditable', () => {
    const f = mountFixture(`
      <input id="text" /><input id="check" type="checkbox" /><textarea id="ta"></textarea>
      <select id="sel"></select><div id="ce" contenteditable="true"></div><button id="btn"></button>`);
    expect(isEditable(f.get('#text'))).toBe(true);
    expect(isEditable(f.get('#ta'))).toBe(true);
    expect(isEditable(f.get('#sel'))).toBe(true);
    expect(isEditable(f.get('#ce'))).toBe(true);
    expect(isEditable(f.get('#check'))).toBe(false);
    expect(isEditable(f.get('#btn'))).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});

describe('isFromDciUi', () => {
  it('is true for events inside the DCI UI host, including its shadow root', () => {
    const f = mountFixture(`<div id="ui" data-dci-ui></div><div id="app"></div>`);
    const shadow = f.get('#ui').attachShadow({ mode: 'open' });
    shadow.innerHTML = `<button id="inside">x</button>`;
    let fromUi: boolean | undefined;
    document.addEventListener('click', (e) => (fromUi = isFromDciUi(e)), { once: true });
    shadow
      .getElementById('inside')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(fromUi).toBe(true);

    document.addEventListener('click', (e) => (fromUi = isFromDciUi(e)), { once: true });
    f.get('#app').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fromUi).toBe(false);
  });
});

describe('resolveBindings', () => {
  it('returns the defaults', () => {
    expect(resolveBindings()).toEqual(DEFAULT_BINDINGS);
  });

  it('merges overrides, including partial keyboard maps', () => {
    const b = resolveBindings({ toggle: 'Meta', windowSelect: false, keyboard: { clear: false } });
    expect(b.toggle).toBe('Meta');
    expect(b.windowSelect).toBe(false);
    expect(b.select).toBe(true);
    expect(b.keyboard && b.keyboard.clear).toBe(false);
    expect(b.keyboard && b.keyboard.parent).toBe('ArrowUp');
  });

  it('can disable the whole keyboard map', () => {
    expect(resolveBindings({ keyboard: false }).keyboard).toBe(false);
  });
});

describe('createEmitter', () => {
  it('emits to listeners and supports unsubscribe and clear', () => {
    const bus = createEmitter<{ a: number; b: string }>();
    const seen: unknown[] = [];
    const off = bus.on('a', (n) => seen.push(n));
    bus.on('b', (s) => seen.push(s));
    bus.emit('a', 1);
    bus.emit('b', 'x');
    off();
    bus.emit('a', 2);
    bus.clear();
    bus.emit('b', 'y');
    expect(seen).toEqual([1, 'x']);
  });
});
