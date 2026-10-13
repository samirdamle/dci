import { afterEach, describe, expect, it } from 'vitest';
import { TOUR_STEPS } from './steps';
import { markTourSeen, shouldAutoOpenTour } from './tour-storage';

describe('tour steps', () => {
  const keys = { mod: 'Alt (⌥)', toggle: 'Shift' };

  it('teach select, add, then select same type', () => {
    expect(TOUR_STEPS.map((s) => s.gesture(keys))).toEqual([
      ['Alt (⌥)', 'Click'],
      ['Alt (⌥)', 'Shift', 'Click'],
      ['Alt (⌥)', 'Double-click'],
    ]);
  });

  it('are done by selection size', () => {
    const [select, add, sameType] = TOUR_STEPS;
    expect([0, 1].map((n) => select!.isDone(n, 4))).toEqual([false, true]);
    expect([1, 2].map((n) => add!.isDone(n, 4))).toEqual([false, true]);
    expect([3, 4].map((n) => sameType!.isDone(n, 4))).toEqual([false, true]);
    expect(sameType!.isDone(0, 0)).toBe(false);
  });

  it('start the same-type step from an empty selection', () => {
    expect(TOUR_STEPS.filter((s) => s.resetOnEnter).map((s) => s.id)).toEqual(['same-type']);
  });
});

describe('shouldAutoOpenTour', () => {
  afterEach(() => localStorage.clear());

  it('opens on a first visit only', () => {
    expect(shouldAutoOpenTour('', false)).toBe(true);
    markTourSeen();
    expect(shouldAutoOpenTour('', false)).toBe(false);
  });

  it('skips automated browsers unless ?tour=on', () => {
    expect(shouldAutoOpenTour('', true)).toBe(false);
    expect(shouldAutoOpenTour('?tour=on', true)).toBe(true);
    expect(shouldAutoOpenTour('?tour=off', false)).toBe(false);
  });
});
