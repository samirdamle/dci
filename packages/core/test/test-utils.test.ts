import { describe, expect, it, vi } from 'vitest';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

describe('test-utils', () => {
  it('mountFixture mounts HTML and scopes queries', () => {
    const f = mountFixture(`<table data-dci="t"><tr data-dci="r1"><td>A</td></tr></table>`);
    expect(document.body.contains(f.root)).toBe(true);
    expect(f.get('[data-dci="r1"]').tagName).toBe('TR');
    expect(f.getAll('[data-dci]')).toHaveLength(2);
    expect(() => f.get('.missing')).toThrow(/no element matches/);
    f.unmount();
    expect(document.body.contains(f.root)).toBe(false);
  });

  it('cleans up fixtures between tests', () => {
    expect(document.querySelectorAll('[data-testid="fixture"]')).toHaveLength(0);
  });

  it('fakePointer dispatches a bubbling event with modifiers', () => {
    const f = mountFixture(`<div id="outer"><span id="inner">x</span></div>`);
    const handler = vi.fn((e: MouseEvent) => e.preventDefault());
    f.get('#outer').addEventListener('click', handler);

    const event = fakePointer(f.get('#inner'), { altKey: true, shiftKey: true });

    expect(handler).toHaveBeenCalledOnce();
    const received = handler.mock.calls[0]![0];
    expect(received.altKey).toBe(true);
    expect(received.shiftKey).toBe(true);
    expect(received.ctrlKey).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('fakePointer supports pointer and wheel events', () => {
    const f = mountFixture(`<div id="el"></div>`);
    const types: string[] = [];
    for (const t of ['pointerdown', 'wheel'] as const) {
      f.get('#el').addEventListener(t, (e) => types.push(e.type));
      fakePointer(f.get('#el'), { type: t, altKey: true });
    }
    expect(types).toEqual(['pointerdown', 'wheel']);
  });

  it('fakeKey dispatches a keyboard event with modifiers', () => {
    const handler = vi.fn();
    document.addEventListener('keydown', handler);
    fakeKey('ArrowUp', { shiftKey: true });
    document.removeEventListener('keydown', handler);

    const event = handler.mock.calls[0]![0] as KeyboardEvent;
    expect(event.key).toBe('ArrowUp');
    expect(event.shiftKey).toBe(true);
    expect(event.altKey).toBe(false);
  });
});

describe('fakePointer wheel events', () => {
  it('carries modifiers and coordinates', () => {
    const f = mountFixture(`<div id="el"></div>`);
    const e = fakePointer(f.get('#el'), {
      type: 'wheel',
      altKey: true,
      clientX: 7,
      deltaY: -3,
    }) as WheelEvent;
    expect([e.altKey, e.shiftKey, e.clientX, e.deltaY]).toEqual([true, false, 7, -3]);
  });
});
