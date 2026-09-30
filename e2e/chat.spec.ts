import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/#/classic');
  await page.waitForSelector('dci-root', { state: 'attached' });
}

const row = (page: Page, text: string) => page.locator('tr', { hasText: text });
/** Playwright locators pierce open shadow roots. */
const chat = (page: Page) => page.locator('dci-root .chat');

async function altClick(target: Locator) {
  await target
    .locator('td')
    .nth(1)
    .click({ modifiers: ['Alt'] });
}

async function openOn(page: Page, invoice: string) {
  await altClick(row(page, invoice));
  await expect(chat(page)).toBeVisible();
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('not visible');
  return b;
}

test.describe('chat', () => {
  test('popover anchors below the selected row and follows it on scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await ready(page);
    const target = row(page, 'INV-101');
    await openOn(page, 'INV-101');
    const r = await box(target);
    const c = await box(chat(page));
    expect(Math.abs(c.y - (r.y + r.height + 8))).toBeLessThanOrEqual(2);

    await page.mouse.wheel(0, 60);
    await expect
      .poll(async () => {
        const [r2, c2] = [await box(target), await box(chat(page))];
        return Math.round(c2.y - (r2.y + r2.height + 8));
      })
      .toBe(0);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the popover has a 2px border in the inverse color (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await ready(page);
      await openOn(page, 'INV-101');
      const style = await page.evaluate(() => {
        const host = document.querySelector('dci-root')!;
        const c = getComputedStyle(host.shadowRoot!.querySelector('.chat')!);
        return {
          width: c.borderTopWidth,
          border: c.borderTopColor,
          fg: c.color, // the chat's text color is --dci-fg
          bg: c.backgroundColor,
        };
      });
      expect(style.width).toBe('2px');
      expect(style.border).toBe(style.fg);
      expect(style.border).not.toBe(style.bg);
    });
  }

  test('flips above the row near the bottom of the viewport', async ({ page }) => {
    // The row sits at the bottom edge: no room below for the popover. Pin it
    // there, since browsers differ in how they scroll a row they're clicking.
    await page.setViewportSize({ width: 1200, height: 480 });
    await ready(page);
    const target = row(page, 'INV-104');
    await target.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await openOn(page, 'INV-104');
    await expect
      .poll(async () => {
        const [r, c] = [await box(target), await box(chat(page))];
        return Math.round(r.y - (c.y + c.height));
      })
      .toBe(8);
  });

  test('shrinks to fit above the row when it fits on neither side', async ({ page }) => {
    // Too short for the full popover above or below the row.
    await page.setViewportSize({ width: 1200, height: 200 });
    await ready(page);
    const target = row(page, 'INV-104');
    await target.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await openOn(page, 'INV-104');
    await expect
      .poll(async () => {
        const [r, c] = [await box(target), await box(chat(page))];
        return [Math.round(r.y - (c.y + c.height)), c.y >= 8];
      })
      .toEqual([8, true]);
  });

  test('suggested action streams a reply with tool progress and chips', async ({ page }) => {
    await ready(page);
    await openOn(page, 'INV-101');
    const c = chat(page);
    await expect(c.locator('.chip .name')).toHaveText(['Invoice INV-101']);
    await expect(c.locator('.crumbs button')).toHaveText([
      'Sales workspace',
      'Invoices',
      'Invoice INV-101',
    ]);
    await c.getByRole('button', { name: 'Draft reminder' }).click();
    await expect(c.locator('.msg.user')).toHaveText('Draft a payment reminder1 item');
    await expect(c.locator('.msg.assistant')).toContainText('friendly reminder', {
      timeout: 10_000,
    });
    await expect(c.locator('.msg.assistant a')).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(c.locator('details.tools summary')).toHaveText('1 step');
    await expect(c.locator('.send')).toHaveText('Send');
  });

  test('typing a question and Esc closing the chat before clearing', async ({ page }) => {
    await ready(page);
    await openOn(page, 'INV-102');
    await chat(page).locator('textarea').fill('What is this?');
    await page.keyboard.press('Enter');
    await expect(chat(page).locator('.msg.assistant')).toContainText('Your prompt was', {
      timeout: 10_000,
    });
    await page.keyboard.press('Escape');
    await expect(chat(page)).toBeHidden();
    await expect(page.getByTestId('context')).toContainText('"id": "inv_102"');
  });

  test('panel docks to the right, resizes and makes room', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await ready(page);
    await page.getByRole('button', { name: 'panel' }).click();
    const panel = page.locator('dci-root .chat[data-mode="panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'complementary');
    const p = await box(panel);
    expect(Math.round(p.x + p.width)).toBe(1280);
    expect(Math.round(p.width)).toBe(380);
    await expect(page.locator('body')).toHaveCSS('padding-right', '380px');

    const handle = page.locator('dci-root .resize');
    const h = await box(handle);
    await page.mouse.move(h.x + h.width / 2, h.y + 100);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 - 100, h.y + 100, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await box(panel)).width - 480)).toBeLessThanOrEqual(2);
    const width = Math.round((await box(panel)).width);
    await expect(page.locator('body')).toHaveCSS('padding-right', `${width}px`);

    await panel.getByRole('button', { name: 'Collapse chat' }).click();
    await expect(panel).toBeHidden();
    await expect(page.locator('dci-root .tab')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('padding-right', '0px');
  });

  for (const mode of ['popover', 'panel'] as const) {
    test(`has no axe violations with the ${mode} open`, async ({ page }) => {
      await ready(page);
      await altClick(row(page, 'INV-101'));
      await page.getByRole('button', { name: mode }).click();
      await expect(chat(page)).toBeVisible();
      await chat(page).getByRole('button', { name: 'Explain' }).click();
      await expect(chat(page).locator('details.tools')).toBeVisible({ timeout: 10_000 });
      const results = await new AxeBuilder({ page }).include('dci-root').analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});
