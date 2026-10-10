import { RecordTable } from './pages/crm';
import { expect, test } from './pages/fixtures';

/** Selection markers: badges on the page, the same letters on the chips and in the request. */
test.describe('selection markers', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
  });

  test('badges, chips and the request share markers in selection order', async ({ app, page }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    const names = await opps.names(3);
    // The third row first, then add the first two: markers follow selection order,
    // and rows added together are numbered in page order.
    await app.windowSelect(opps.rows.nth(2), opps.rows.nth(2));
    await app.windowSelect(opps.rows.nth(0), opps.rows.nth(1), { extra: ['Shift'] });
    await expect(app.chat.chips).toHaveText([names[2]!, names[0]!, names[1]!]);
    await expect(app.chat.root.locator('.chip .marker')).toHaveText(['A', 'B', 'C']);
    const badges = page.locator('dci-root .box.selected .marker').filter({ visible: true });
    await expect(badges).toHaveText(['A', 'B', 'C']);

    // Removing B keeps C.
    await app.chat.removeChip(names[0]!);
    await expect(app.chat.root.locator('.chip .marker')).toHaveText(['A', 'C']);
    await expect(badges).toHaveText(['A', 'C']);

    const request = page.waitForRequest('**/api/dci');
    await app.chat.ask('Compare A and C');
    const body = (await request).postDataJSON() as { context: Array<{ marker?: string }> };
    expect(body.context.map((n) => n.marker)).toEqual(['A', 'C']);
  });
});
