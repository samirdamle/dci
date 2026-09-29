import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await page.waitForSelector('dci-root', { state: 'attached' });
}

/** Rect of the visible selected overlay box. */
const selectedBox = (page: Page) =>
  page.evaluate(() => {
    const shadow = document.querySelector('dci-root')!.shadowRoot!;
    const box = [...shadow.querySelectorAll<HTMLElement>('.box.selected')].find(
      (b) => b.style.display === 'block',
    );
    const r = box?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });

test.describe('CRM shell', () => {
  test('a chart bar is selectable and the highlight lines up with it', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await open(page, '/sales');
    const bar = page.locator('[data-dci*="datapoint.pipeline.Proposal"]');
    await bar.click({ modifiers: ['Alt'] });
    await expect(page.locator('dci-root .chip .name')).toHaveText([/^Proposal: \$/]);
    await expect
      .poll(async () => {
        const [box, target] = [await selectedBox(page), await bar.boundingBox()];
        if (!box || !target) return 'missing';
        return Math.max(
          Math.abs(box.x - target.x),
          Math.abs(box.y - target.y),
          Math.abs(box.width - target.width),
          Math.abs(box.height - target.height),
        ) <= 1
          ? 'aligned'
          : JSON.stringify({ box, target });
      })
      .toBe('aligned');
  });

  test('KPI tiles offer their suggested actions', async ({ page }) => {
    await open(page, '/sales');
    await page.locator('[data-dci*="kpi.win-rate"]').click({ modifiers: ['Alt'] });
    const chat = page.locator('dci-root .chat');
    await expect(chat).toBeVisible();
    await expect(chat.locator('.actions > button')).toHaveText([
      'Why did this change?',
      'Summarize',
    ]);
  });

  test('the app switcher and theme toggle work', async ({ page }) => {
    await open(page, '/sales');
    await page.getByRole('button', { name: 'Switch app' }).click();
    await page.getByRole('menuitem', { name: 'Marketing Cloud' }).click();
    await expect(page.getByRole('heading', { name: 'Marketing Home' })).toBeVisible();
    await expect(page).toHaveURL(/#\/marketing$/);

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('dci-root')).toHaveAttribute('data-theme', 'dark');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`Sales Home has no axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await open(page, '/sales');
      await expect(page.getByRole('heading', { name: 'Sales Home' })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.help}`)).toEqual([]);
    });
  }
});
