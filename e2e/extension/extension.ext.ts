import type { Page } from '@playwright/test';
import { expect, openPage, test } from './fixtures';

const PLAIN = `
<title>Orders</title>
<h1>Orders</h1>
<table>
  <tr><th>Order</th><th>Customer</th><th>Total</th></tr>
  <tr><td>#1001</td><td>Ada Lovelace</td><td>$120</td></tr>
  <tr><td>#1002</td><td>Alan Turing</td><td>$75</td></tr>
</table>`;

const chat = (page: Page) => page.locator('dci-root .chat');

test.describe('browser extension', () => {
  test('the toolbar toggle starts DCI on any page and answers offline', async ({
    page,
    extension,
  }) => {
    await openPage(page, PLAIN);
    await expect(page.locator('dci-root')).toHaveCount(0);

    await extension.toggle(page);
    await expect(page.locator('dci-root')).toBeAttached();
    await expect.poll(() => extension.badge(page)).toBe('ON');

    // An unannotated cell is selectable through the fallback.
    await page.getByText('Ada Lovelace').click({ modifiers: ['Alt'] });
    await expect(chat(page).locator('.chip .name')).toHaveText(['Ada Lovelace']);

    // The request goes content script → port → background worker → offline backend.
    await chat(page).locator('textarea').fill('Who is this?');
    await page.keyboard.press('Enter');
    await expect(chat(page).locator('.msg.assistant')).toContainText(
      'Context (1 selected item) and prompt passed on to model.',
    );
    await expect(chat(page).locator('.msg.assistant')).toContainText(
      'Analysis of the context sent back from model.',
    );

    // Toggling again removes everything.
    await extension.toggle(page);
    await expect(page.locator('dci-root')).toHaveCount(0);
    await expect.poll(() => extension.badge(page)).toBe('');
    await page.getByText('Alan Turing').click({ modifiers: ['Alt'] });
    await expect(page.locator('dci-root')).toHaveCount(0);
  });

  test('leaves pages that run their own DCI alone', async ({ page, extension }) => {
    // A page with its own DCI has a <dci-root>.
    await openPage(page, `${PLAIN}<dci-root></dci-root>`, '/own-dci');
    await extension.toggle(page);
    await expect.poll(() => extension.badge(page)).toBe('—');
    await expect(page.locator('dci-root')).toHaveCount(1);
  });

  test('a navigation turns DCI off in that tab', async ({ page, extension }) => {
    await openPage(page, PLAIN, '/first');
    await extension.toggle(page);
    await expect.poll(() => extension.badge(page)).toBe('ON');
    await page.goto('http://dci.test/second');
    await expect.poll(() => extension.badge(page)).toBe('');
    await expect(page.locator('dci-root')).toHaveCount(0);
  });
});
