import type { Locator, Page } from '@playwright/test';
import { RecordTable } from './pages/crm';
import { expect, test } from './pages/fixtures';

/** A phone: touch input (so `pointer: coarse` matches) and a narrow screen. */
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

/** Rest a finger on `target` for `ms`, then lift it. Playwright only has taps built in. */
async function longPress(page: Page, target: Locator, ms = 700) {
  const box = (await target.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('touch screens', () => {
  test('the tour teaches Select mode, taps and double tap', async ({ app, page }) => {
    await app.open('/sales', { tour: 'on' });
    const tour = page.getByTestId('tour');
    const deals = page.getByTestId('tour-deals').locator('[data-dci]');
    const status = page.getByTestId('tour-status');
    const bar = tour.getByTestId('select-mode-bar');

    await expect(tour.locator('kbd')).toHaveText(['Select', 'Tap']);
    await bar.getByRole('button', { name: 'Select' }).tap();
    await deals.nth(0).tap();
    await expect(status).toHaveAttribute('data-done');
    await tour.getByRole('button', { name: 'Next', exact: true }).tap();

    await expect(tour.locator('kbd')).toHaveText(['Tap another']);
    await deals.nth(1).tap();
    await expect(status).toHaveAttribute('data-done');
    await expect(bar).toContainText('2 selected');
    await tour.getByRole('button', { name: 'Next', exact: true }).tap();

    await expect(tour.locator('kbd')).toHaveText(['Double-tap']);
    await expect(status).not.toHaveAttribute('data-done');
    await deals.nth(2).tap();
    await deals.nth(2).tap();
    await expect(status).toHaveAttribute('data-done');
  });

  test('a long press starts Select mode, taps add, Done ends it', async ({ app, page }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    const bar = page.getByTestId('select-mode-bar');
    await expect(bar.getByRole('button', { name: 'Select' })).toBeVisible();

    await longPress(page, opps.rows.nth(0).locator('td').first());
    await expect(bar).toContainText('1 selected');
    await expect(page.locator('html')).not.toHaveClass(/dci-select-mode/);
    await expect(page.getByTestId('crm-content')).toHaveClass(/dci-select-mode/);

    await opps.rows.nth(1).locator('td').first().tap();
    await expect(bar).toContainText('2 selected');

    // A tap with Select mode off is the page's own again.
    await bar.getByRole('button', { name: 'Done' }).tap();
    await expect(page.getByTestId('crm-content')).not.toHaveClass(/dci-select-mode/);
    await opps.rows.nth(2).locator('td').first().tap();
    await expect(bar.getByRole('button', { name: 'Select' })).toBeVisible();
  });

  test('in Select mode a drag draws the selection box instead of scrolling', async ({
    app,
    page,
  }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    const bar = page.getByTestId('select-mode-bar');
    await bar.getByRole('button', { name: 'Select' }).tap();
    const first = (await opps.rows.nth(0).boundingBox())!;
    const third = (await opps.rows.nth(2).boundingBox())!;
    const scroll = await page.evaluate(() => window.scrollY);
    // Right → left, so it selects the rows the box touches.
    // The table is wider than the phone: start at the screen's right edge.
    const from = { x: Math.min(first.x + first.width, 412) - 30, y: first.y + 10 };
    const to = { x: third.x + 20, y: third.y + 10 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 8; i++) {
      const point = {
        x: from.x + ((to.x - from.x) * i) / 8,
        y: from.y + ((to.y - from.y) * i) / 8,
      };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(bar).toContainText('3 selected');
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  });

  test('on a phone the chat waits for Ask', async ({ app, page }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    const bar = page.getByTestId('select-mode-bar');
    const chat = page.locator('dci-root .chat').filter({ visible: true });
    await bar.getByRole('button', { name: 'Select' }).tap();
    await opps.rows.nth(0).locator('td').first().tap();
    await opps.rows.nth(1).locator('td').first().tap();
    await expect(chat).toHaveCount(0);
    await bar.getByRole('button', { name: 'Ask' }).tap();
    await expect(chat.locator('.chip .marker')).toHaveText(['A', 'B']);
  });
});
