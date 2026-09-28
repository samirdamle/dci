import { describe, expect, it, vi } from 'vitest';
import { isDciElement, parseDciAttribute, readDci } from '../src/parse';
import { mountFixture } from './test-utils';

const noWarn = () => {
  throw new Error('unexpected warning');
};

describe('parseDciAttribute', () => {
  it('returns null when the attribute is absent', () => {
    expect(parseDciAttribute(null, noWarn)).toBeNull();
  });

  it('treats an empty value as an anonymous node', () => {
    expect(parseDciAttribute('', noWarn)).toEqual({ private: false, data: {} });
    expect(parseDciAttribute('   ', noWarn)).toEqual({ private: false, data: {} });
  });

  it('parses the short form as an id', () => {
    expect(parseDciAttribute('inv_123', noWarn)).toEqual({
      id: 'inv_123',
      private: false,
      data: {},
    });
    expect(parseDciAttribute('  inv_123 ', noWarn)).toMatchObject({ id: 'inv_123' });
  });

  it('treats primitives as the short form', () => {
    expect(parseDciAttribute('123', noWarn)).toMatchObject({ id: '123' });
    expect(parseDciAttribute('true', noWarn)).toMatchObject({ id: 'true' });
  });

  it('splits reserved keys from free-form data', () => {
    const value = JSON.stringify({
      id: 'inv_123',
      type: 'invoice',
      label: 'Invoice #123',
      amount: 420,
      status: 'overdue',
      nested: { a: 1 },
    });
    expect(parseDciAttribute(value, noWarn)).toEqual({
      id: 'inv_123',
      type: 'invoice',
      label: 'Invoice #123',
      private: false,
      data: { amount: 420, status: 'overdue', nested: { a: 1 } },
    });
  });

  it('reads the private flag only when it is literally true', () => {
    expect(parseDciAttribute('{"id":"a","private":true}', noWarn)?.private).toBe(true);
    expect(parseDciAttribute('{"id":"a","private":"true"}', noWarn)?.private).toBe(false);
    expect(parseDciAttribute('{"id":"a"}', noWarn)?.private).toBe(false);
  });

  it('coerces non-string reserved values with String()', () => {
    expect(parseDciAttribute('{"id":42,"type":7,"label":false}', noWarn)).toEqual({
      id: '42',
      type: '7',
      label: 'false',
      private: false,
      data: {},
    });
  });

  it('omits reserved keys that are null or missing', () => {
    expect(parseDciAttribute('{"id":null,"x":1}', noWarn)).toEqual({
      private: false,
      data: { x: 1 },
    });
  });

  it('falls back to the short form and warns on a JSON array', () => {
    const warn = vi.fn();
    expect(parseDciAttribute('[1,2]', warn)).toEqual({ id: '[1,2]', private: false, data: {} });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('falls back to the short form and warns on invalid JSON', () => {
    const warn = vi.fn();
    expect(parseDciAttribute('{id: inv_1}', warn)).toMatchObject({ id: '{id: inv_1}' });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toMatch(/Invalid JSON/);
  });
});

describe('readDci', () => {
  it('returns null for elements without the attribute', () => {
    const f = mountFixture(`<div id="plain"></div>`);
    expect(readDci(f.get('#plain'))).toBeNull();
  });

  it('returns the cached object while the attribute is unchanged', () => {
    const f = mountFixture(
      `<table><tbody><tr data-dci='{"id":"r1","type":"row"}'></tr></tbody></table>`,
    );
    const el = f.get('[data-dci]');
    const first = readDci(el);
    expect(first).toMatchObject({ id: 'r1', type: 'row' });
    expect(readDci(el)).toBe(first);
  });

  it('re-parses when the attribute value changes', () => {
    const f = mountFixture(`<div data-dci="a"></div>`);
    const el = f.get('[data-dci]');
    const first = readDci(el);
    el.setAttribute('data-dci', 'b');
    const second = readDci(el);
    expect(second).not.toBe(first);
    expect(second?.id).toBe('b');
    el.removeAttribute('data-dci');
    expect(readDci(el)).toBeNull();
  });

  it('warns at most once per element', () => {
    const warn = vi.fn();
    const f = mountFixture(`<div id="a" data-dci="{bad"></div><div id="b" data-dci="{bad"></div>`);
    const a = f.get('#a');
    readDci(a, { warn });
    a.setAttribute('data-dci', '{still bad');
    readDci(a, { warn });
    expect(warn).toHaveBeenCalledOnce();
    readDci(f.get('#b'), { warn });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('honours a custom attribute name', () => {
    const f = mountFixture(`<li data-ctx='{"id":"x","type":"item"}' data-dci="ignored"></li>`);
    const el = f.get('li');
    expect(readDci(el, { attribute: 'data-ctx' })).toMatchObject({ id: 'x', type: 'item' });
    expect(readDci(el)).toMatchObject({ id: 'ignored' });
    // Switching back does not return the other attribute's cached result.
    expect(readDci(el, { attribute: 'data-ctx' })?.id).toBe('x');
  });
});

describe('isDciElement', () => {
  it('checks for the attribute, including a custom name', () => {
    const f = mountFixture(`<a id="a" data-dci=""></a><b id="b" data-ctx="x"></b>`);
    expect(isDciElement(f.get('#a'))).toBe(true);
    expect(isDciElement(f.get('#b'))).toBe(false);
    expect(isDciElement(f.get('#b'), 'data-ctx')).toBe(true);
  });
});

describe('dev warnings', () => {
  it('logs through console.warn by default outside production', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseDciAttribute('{oops');
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\[dci\] Invalid JSON/));
    spy.mockRestore();
  });
});
