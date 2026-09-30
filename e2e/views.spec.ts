import AxeBuilder from '@axe-core/playwright';
import { JourneyCanvas, RecordTable } from './pages/crm';
import { expect, test } from './pages/fixtures';

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
  test('every view is routable and populated', async ({ app, page }) => {
    for (const [path, title] of ROUTES) {
      await app.open(path);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.locator('[data-dci]').nth(3)).toBeAttached();
    }
  });

  test('no view scrolls sideways at 1024px, sidebar open or collapsed', async ({ app, page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await app.open('/sales');
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    const views: Array<[string, string]> = [['/sales', 'Sales Home'], ...ROUTES];
    for (const state of ['expanded', 'collapsed']) {
      if (state === 'collapsed') await page.locator('[data-slot="sidebar-trigger"]').click();
      await expect(page.locator('[data-slot="sidebar"][data-state]')).toHaveAttribute(
        'data-state',
        state,
      );
      for (const [path, title] of views) {
        await page.evaluate((hash) => (location.hash = hash), path);
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
        expect(await overflow(), `${path} (${state})`).toBeLessThanOrEqual(0);
      }
    }
  });

  test('window select picks whole opportunity rows', async ({ app, page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    await app.windowSelect(opps.rows.nth(0), opps.rows.nth(2));
    await expect(app.chat.chips).toHaveText(await opps.names(3));
  });

  test('journey canvas nests journey › step › branch › step', async ({ app, page }) => {
    await app.open('/marketing/journeys');
    await app.click(new JourneyCanvas(page).step('Gear care tips email'));
    await expect(app.chat.chips).toHaveText(['Gear care tips email']);
    for (const label of [
      'Opened welcome email? → Opened',
      'Opened welcome email?',
      'New Customer Onboarding',
    ]) {
      await page.keyboard.press('ArrowUp');
      await expect(app.chat.chips).toHaveText([label]);
    }
  });

  test('three selected campaigns offer "Compare with selected"', async ({ app, page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await app.open('/marketing/campaigns');
    const campaigns = new RecordTable(page, 'Campaigns');
    await app.windowSelect(campaigns.rows.nth(0), campaigns.rows.nth(2));
    await expect(app.chat.chips).toHaveCount(3);
    await expect(app.chat.action('Compare with selected')).toBeAttached();
  });

  for (const [path] of [['/sales/pipeline'], ['/marketing/journeys'], ['/sales/opportunities']]) {
    test(`${path} has no axe violations`, async ({ app, page }) => {
      await app.open(path!);
      await page.locator('[data-dci]').nth(3).waitFor();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.help}`)).toEqual([]);
    });
  }
});
