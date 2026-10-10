import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkMarkers, formatMarker, letterMarker } from '../src/markers';

afterEach(() => vi.restoreAllMocks());

describe('markers', () => {
  it('letters run A … Z, then AA, AB … AZ, BA …', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(letterMarker)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('formats letters, numbers and custom series', () => {
    expect(formatMarker(2, 'letters')).toBe('C');
    expect(formatMarker(2, 'numbers')).toBe('3');
    expect(formatMarker(2, (i) => String.fromCharCode(0x2460 + i))).toBe('③');
  });

  it('warns once when a custom series repeats itself', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkMarkers(['A', undefined, 'B']);
    expect(warn).not.toHaveBeenCalled();
    checkMarkers(['X', 'X', 'X']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('share the marker "X"');
  });
});
