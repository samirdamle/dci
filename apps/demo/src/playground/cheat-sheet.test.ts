import { resolveBindings } from '@samirdamle/dci-core';
import { describe, expect, it } from 'vitest';
import { cheatSheetRows } from './cheat-sheet-rows';

describe('cheatSheetRows', () => {
  it('follows the modifier and the default bindings', () => {
    const rows = Object.fromEntries(cheatSheetRows(resolveBindings(), 'Alt'));
    expect(rows['Alt (⌥)+Click']).toMatch(/Select it/);
    expect(rows['Alt (⌥)+Shift+Click']).toMatch(/Add or remove/);
    expect(rows['↑ / ↓']).toMatch(/parent/);
    expect(rows['Esc']).toMatch(/clear the selection/);
  });

  it('reflects a remapped modifier and leaves disabled gestures out', () => {
    const rows = cheatSheetRows(
      resolveBindings({ wheelTraverse: false, keyboard: { parent: 'k', child: 'j' } }),
      'Control',
    );
    const keys = rows.map(([k]) => k);
    expect(keys).toContain('Ctrl+Click');
    expect(keys).toContain('k / j');
    expect(keys.some((k) => k.includes('Wheel'))).toBe(false);
    expect(keys.some((k) => k.includes('Alt (⌥)+Click'))).toBe(false);
  });
});
