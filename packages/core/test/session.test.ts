import { describe, expect, it, vi } from 'vitest';
import { createSession, randomId } from '../src/session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('createSession', () => {
  it('page scope generates a UUID once', () => {
    const session = createSession();
    const id = session.id;
    expect(id).toMatch(UUID);
    expect(session.id).toBe(id);
    expect(createSession().id).not.toBe(id);
  });

  it('manual scope uses the supplied value or function', () => {
    expect(createSession({ scope: 'manual', id: 'abc' }).id).toBe('abc');
    let n = 0;
    const session = createSession({ scope: 'manual', id: () => `conv-${++n}` });
    expect(session.id).toBe('conv-1');
    expect(session.reset()).toBe('conv-2');
    expect(() => createSession({ scope: 'manual' })).toThrow(/needs an id/);
  });

  it('reset rotates the id and fires sessionchange for history listeners', () => {
    const session = createSession();
    const first = session.id;
    const history = ['user: hi', 'ai: hello'];
    const change = vi.fn(() => history.splice(0));
    const off = session.onChange(change);
    const next = session.reset();
    expect(next).toMatch(UUID);
    expect(next).not.toBe(first);
    expect(session.id).toBe(next);
    expect(change).toHaveBeenCalledWith({ id: next, previous: first });
    expect(history).toEqual([]);
    off();
    session.reset('explicit');
    expect(session.id).toBe('explicit');
    expect(change).toHaveBeenCalledOnce();
  });

  it('falls back when crypto.randomUUID is unavailable', () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(randomId()).toMatch(UUID);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: original,
        configurable: true,
      });
    }
  });
});
