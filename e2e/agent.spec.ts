import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The full loop against the demo backend in mock mode: select records, ask,
 * the backend changes them (tool calls) and the page updates via
 * `client-action`s. Navigation stays in-app (no reloads), because each page
 * load starts a fresh org and session.
 */

async function open(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await page.waitForSelector('dci-root', { state: 'attached' });
}

const chat = (page: Page) => page.locator('dci-root .chat');
const chips = (page: Page) => page.locator('dci-root .chip .name');

async function windowSelect(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(a.x - 4, a.y - 3);
  await page.mouse.down();
  await page.mouse.move(
    Math.min(b.x + b.width + 4, page.viewportSize()!.width - 2),
    b.y + b.height + 3,
    {
      steps: 6,
    },
  );
  await page.mouse.up();
  await page.keyboard.up('Alt');
}

async function ask(page: Page, prompt: string) {
  await chat(page).locator('textarea').fill(prompt);
  await chat(page).locator('textarea').press('Enter');
}

test.describe('agent write-back (mock mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
  });

  test('shows the backend mode', async ({ page }) => {
    await open(page, '/sales');
    await expect(page.getByText('Mock mode')).toBeVisible();
  });

  test('moving 3 deals updates the list, the Kanban and the record page', async ({ page }) => {
    await open(page, '/sales/opportunities');
    await page.getByLabel('Filter Opportunities').fill('Prospecting');
    const rows = page.locator('tbody tr');
    const names = (await rows.evaluateAll((trs) =>
      trs.slice(0, 3).map((tr) => (tr as HTMLTableRowElement).cells[0]!.textContent!),
    )) as string[];
    await windowSelect(page, rows.nth(0), rows.nth(2));
    await expect(chips(page)).toHaveText(names);

    await ask(page, 'Move these 3 deals to Negotiation and add a follow-up task for each');
    await expect(chat(page).locator('.msg.assistant')).toContainText('Done. I made 6 changes');
    await expect(chat(page).locator('details.tools summary')).toHaveText('7 steps');

    // The list: the filter no longer matches (they left Prospecting)…
    await page.getByLabel('Filter Opportunities').fill('');
    for (const name of names)
      await expect(page.locator('tbody tr', { hasText: name }).first()).toContainText(
        'Negotiation',
      );

    // …the Kanban board…
    await chat(page).getByRole('button', { name: 'Close chat' }).click();
    await page.getByRole('link', { name: 'Pipeline' }).click();
    const negotiation = page
      .getByRole('region', { name: 'Opportunity pipeline' })
      .getByLabel('Negotiation');
    for (const name of names)
      await expect(negotiation.getByText(name, { exact: true })).toBeVisible();

    // …and the account record page, with the new follow-up task.
    await page.getByRole('link', { name: 'Accounts' }).click();
    const account = names[0]!.split(' – ')[0]!;
    await page.getByRole('link', { name: account, exact: true }).click();
    await page.getByRole('tab', { name: /Activities/ }).click();
    await expect(page.getByRole('tabpanel').getByText(`Follow up: ${names[0]}`)).toBeVisible();
  });

  test('comparing 3 campaigns recommends where to shift budget', async ({ page }) => {
    await open(page, '/marketing/campaigns');
    const rows = page.locator('tbody tr');
    await windowSelect(page, rows.nth(0), rows.nth(2));
    await chat(page).getByRole('button', { name: 'Compare with selected' }).click();
    const answer = chat(page).locator('.msg.assistant');
    await expect(answer).toContainText('Spring Trail Webinar spent $42,000 for 18 leads');
    await expect(answer).toContainText('Recommendation: shift budget from');
  });

  test('without a server, the mock runs in the browser and still writes back', async ({ page }) => {
    await page.route('**/api/mode', (route) => route.fulfill({ status: 404, body: 'Not found' }));
    await open(page, '/sales/leads');
    await expect(page.getByText('Mock mode')).toHaveAttribute('title', /in your browser/);
    const row = page.locator('tbody tr', { hasText: 'Jordan Park' });
    await row
      .locator('td')
      .first()
      .click({ modifiers: ['Alt'] });
    await ask(page, 'Mark this lead as qualified');
    await expect(chat(page).locator('.msg.assistant')).toContainText('Done.');
    await expect(row).toContainText('Qualified');
  });
});
