import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function open(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await page.waitForSelector('dci-root', { state: 'attached' });
}

const chips = (page: Page) => page.locator('dci-root .chip .name');

/** Alt+drag from the left of `from` to the right of `to` (a "contain" window select). */
async function windowSelect(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(a.x - 4, a.y - 3);
  await page.mouse.down();
  const right = Math.min(b.x + b.width + 4, page.viewportSize()!.width - 2);
  await page.mouse.move(right, b.y + b.height + 3, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
}

const ROUTES: Array<[string, string]> = [
  ['/sales/opportunities', 'Opportunities'],
  ['/sales/pipeline', 'Pipeline'],
  ['/sales/accounts', 'Accounts'],
  ['/sales/leads', 'Leads'],
  ['/marketing/campaigns', 'Campaigns'],
  ['/marketing/emails', 'Email sends'],
  ['/marketing/journeys', 'Journeys'],
  ['/marketing/segments', 'Audience segments'],
];

test.describe('CRM views', () => {
  test('every view is routable and populated', async ({ page }) => {
    for (const [path, title] of ROUTES) {
      await open(page, path);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.locator('[data-dci]').nth(3)).toBeAttached();
    }
  });

  test('window select picks whole opportunity rows', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await open(page, '/sales/opportunities');
    const rows = page.locator('tbody tr');
    await windowSelect(page, rows.nth(0), rows.nth(2));
    await expect(chips(page)).toHaveCount(3);
    const names = await rows.evaluateAll((trs) =>
      trs.slice(0, 3).map((tr) => (tr as HTMLTableRowElement).cells[0]!.textContent),
    );
    await expect(chips(page)).toHaveText(names as string[]);
  });

  test('Kanban: ↑ from a deal selects its stage column', async ({ page }) => {
    await open(page, '/sales/pipeline');
    const card = page.locator('[data-dci*=\'"type":"opportunity"\']').first();
    await card.click({ modifiers: ['Alt'] });
    await expect(chips(page)).toHaveCount(1);
    await page.keyboard.press('ArrowUp');
    await expect(chips(page)).toHaveText(['Prospecting']);
  });

  test('journey canvas nests journey › step › branch › step', async ({ page }) => {
    await open(page, '/marketing/journeys');
    await page.getByText('Gear care tips email').click({ modifiers: ['Alt'] });
    await expect(chips(page)).toHaveText(['Gear care tips email']);
    await page.keyboard.press('ArrowUp');
    await expect(chips(page)).toHaveText(['Opened welcome email? → Opened']);
    await page.keyboard.press('ArrowUp');
    await expect(chips(page)).toHaveText(['Opened welcome email?']);
    await page.keyboard.press('ArrowUp');
    await expect(chips(page)).toHaveText(['New Customer Onboarding']);
  });

  test('an account’s private credit limit never becomes context', async ({ page }) => {
    await open(page, '/sales/accounts');
    await page
      .getByRole('link', { name: /Alpine/ })
      .first()
      .click();
    await page.getByText('Credit Limit').click({ modifiers: ['Alt'] });
    // The private field is transparent: the click lands on the account itself.
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page)).toHaveText([/Alpine/]);
    const context = await page.evaluate(
      () => document.querySelector('dci-root')!.shadowRoot!.querySelector('.chat')!.textContent,
    );
    expect(context).not.toMatch(/credit/i);
  });

  test('three selected campaigns offer "Compare with selected"', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await open(page, '/marketing/campaigns');
    const rows = page.locator('tbody tr');
    await windowSelect(page, rows.nth(0), rows.nth(2));
    await expect(chips(page)).toHaveCount(3);
    const chat = page.locator('dci-root .chat');
    await chat.waitFor();
    await expect(
      chat.locator('.actions button', { hasText: 'Compare with selected' }),
    ).toBeAttached();
  });

  for (const [path] of [['/sales/pipeline'], ['/marketing/journeys'], ['/sales/opportunities']]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await open(page, path!);
      await page.locator('[data-dci]').nth(3).waitFor();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.help}`)).toEqual([]);
    });
  }
});
