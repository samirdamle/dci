import AxeBuilder from '@axe-core/playwright';
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

  test('the options page saves an endpoint, tests it, and chat answers come from it', async ({
    page,
    extension,
  }) => {
    const options = await extension.openPage('options.html');
    await options.getByLabel('Your DCI endpoint').check();
    await options.getByLabel('Endpoint URL').fill('http://127.0.0.1:8787/api/dci');
    await options.getByRole('button', { name: 'Save' }).click();
    await expect(options.getByRole('status')).toHaveText('Saved.');
    await options.getByRole('button', { name: 'Test connection' }).click();
    await expect(options.getByRole('status')).toContainText('Connected.');

    // A fresh load of the options page shows what was saved.
    await options.reload();
    await expect(options.getByLabel('Your DCI endpoint')).toBeChecked();
    await expect(options.getByLabel('Endpoint URL')).toHaveValue('http://127.0.0.1:8787/api/dci');
    await options.close();

    await openPage(page, PLAIN);
    await extension.toggle(page);
    await page.getByText('Ada Lovelace').click({ modifiers: ['Alt'] });
    await chat(page).locator('textarea').fill('Who is this?');
    await page.keyboard.press('Enter');
    // The demo backend (mock mode) describes the selected element.
    await expect(chat(page).locator('.msg.assistant')).toContainText(
      'Here is what I can see about Ada Lovelace',
    );
  });

  test('the Claude backend asks for a key until one is set', async ({ page, extension }) => {
    await extension.store({ settings: { backend: 'claude' } });
    await openPage(page, PLAIN);
    await extension.toggle(page);
    await page.getByText('Ada Lovelace').click({ modifiers: ['Alt'] });
    await chat(page).locator('textarea').fill('Who is this?');
    await page.keyboard.press('Enter');
    await expect(chat(page)).toContainText(
      'Add your Anthropic API key in the DCI extension options.',
    );
  });

  test('an always-on site starts DCI on every page load', async ({ page, extension }) => {
    await extension.store({ settings: { alwaysOnSites: ['http://dci.test'] } });
    await openPage(page, PLAIN, '/always');
    await expect(page.locator('dci-root')).toBeAttached();
    await expect.poll(() => extension.badge(page)).toBe('ON');
    await page.goto('http://dci.test/always-again');
    await expect(page.locator('dci-root')).toBeAttached();
  });

  test('the options page and popup have no axe violations', async ({ extension }) => {
    for (const path of ['options.html', 'popup.html']) {
      const page = await extension.openPage(path);
      // The popup opened as a tab sees itself as the active tab, which DCI can't run on.
      await expect(page.getByRole('status').first()).not.toHaveText('…');
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${path} ${v.id}: ${v.help}`)).toEqual([]);
      await page.close();
    }
  });
});
