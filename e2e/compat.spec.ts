import { expect, test } from '@playwright/test';

/** A strict-CSP page with annotated nodes inside a web component's shadow root. */
test.describe('compatibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/compat.html');
    await page.waitForSelector('body[data-ready="true"]');
  });

  test('works under a strict CSP (no inline styles or eval) with styled UI', async ({ page }) => {
    await page.locator('#plain').click({ modifiers: ['Alt'] });
    await page.locator('dci-root .chat').waitFor();
    // Constructable stylesheets style the shadow UI without 'unsafe-inline'.
    const styled = await page.evaluate(() => {
      const box = document
        .querySelector('dci-root')!
        .shadowRoot!.querySelector<HTMLElement>('.box.selected')!;
      return getComputedStyle(box).borderTopStyle;
    });
    expect(styled).toBe('solid');
    await page.locator('dci-root .chat textarea').fill('Hi');
    await page.locator('dci-root .chat textarea').press('Enter');
    await expect(page.locator('dci-root .chat .msg.assistant')).toHaveText(
      'Hello from a strict page.',
    );
    expect(
      await page.evaluate(() => (window as unknown as { violations: string[] }).violations),
    ).toEqual([]);
  });

  test('selects annotated nodes inside a web component’s shadow DOM', async ({ page }) => {
    await page.locator('shadow-card #shadow-item').click({ modifiers: ['Alt'] });
    await expect(page.locator('dci-root .chip .name')).toHaveText(['Shadow item']);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('dci-root .chip .name')).toHaveText(['Shadow card']);
    // The tree crosses the shadow boundary to the annotated host element.
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('dci-root .chip .name')).toHaveText(['Card component']);
  });
});
