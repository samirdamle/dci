import { describe, expect, it, vi } from 'vitest';
import { createInteractions, type Gesture } from '../src/interactions';
import { fakeKey } from './test-utils';

describe('createInteractions', () => {
  it('wires the gesture context and resolves bindings', () => {
    let seen: Parameters<Gesture>[0] | undefined;
    const cleanup = vi.fn();
    const dci = createInteractions({
      modifier: 'Meta',
      bindings: { windowSelect: false },
      gestures: [
        (ctx) => {
          seen = ctx;
          return cleanup;
        },
      ],
    });
    expect(seen?.input.modifier).toBe('Meta');
    expect(seen?.bindings.windowSelect).toBe(false);
    expect(seen?.selection).toBe(dci.selection);
    dci.destroy();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('forwards arm changes to the bus', () => {
    const dci = createInteractions({ gestures: [] });
    const arms: boolean[] = [];
    dci.bus.on('arm', (a) => arms.push(a));
    fakeKey('Alt', { altKey: true });
    fakeKey('Alt', { type: 'keyup' });
    dci.destroy();
    fakeKey('Alt', { altKey: true });
    expect(arms).toEqual([true, false]);
  });
});
