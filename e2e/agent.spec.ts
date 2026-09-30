import { KanbanBoard, RecordTable } from './pages/crm';
import { expect, test } from './pages/fixtures';

/**
 * The full loop against the demo backend in mock mode: select records, ask,
 * the backend changes them (tool calls) and the page updates via
 * `client-action`s. Navigation stays in-app (no reloads), because each page
 * load starts a fresh org and session.
 */

test.describe('agent write-back (mock mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
  });

  test('shows the backend mode', async ({ app, page }) => {
    await app.open('/sales');
    await expect(page.getByText('Mock mode')).toBeVisible();
  });

  test('moving 3 deals updates the list, the Kanban and the record page', async ({ app, page }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    await opps.filter.fill('Prospecting');
    const names = await opps.names(3);
    await app.windowSelect(opps.rows.nth(0), opps.rows.nth(2));
    await expect(app.chat.chips).toHaveText(names);

    await app.chat.ask('Move these 3 deals to Negotiation and add a follow-up task for each');
    await expect(app.chat.assistant).toContainText('Done. I made 6 changes');
    await expect(app.chat.root.locator('details.tools summary')).toHaveText('7 steps');

    // The list: the filter no longer matches (they left Prospecting)…
    await opps.filter.fill('');
    for (const name of names) await expect(opps.row(name)).toContainText('Negotiation');

    // …the Kanban board…
    await app.chat.close();
    await page.getByRole('link', { name: 'Pipeline' }).click();
    const negotiation = new KanbanBoard(page).column('Negotiation');
    for (const name of names)
      await expect(negotiation.getByText(name, { exact: true })).toBeVisible();

    // …and the account record page, with the new follow-up task.
    await page.getByRole('link', { name: 'Accounts' }).click();
    const account = names[0]!.split(' – ')[0]!;
    await page.getByRole('link', { name: account, exact: true }).click();
    await page.getByRole('tab', { name: /Activities/ }).click();
    await expect(page.getByRole('tabpanel').getByText(`Follow up: ${names[0]}`)).toBeVisible();
  });

  test('comparing 3 campaigns recommends where to shift budget', async ({ app, page }) => {
    await app.open('/marketing/campaigns');
    const campaigns = new RecordTable(page, 'Campaigns');
    await app.windowSelect(campaigns.rows.nth(0), campaigns.rows.nth(2));
    await app.chat.action('Compare with selected').click();
    const answer = app.chat.assistant;
    await expect(answer).toContainText('Spring Trail Webinar spent $42,000 for 18 leads');
    await expect(answer).toContainText('Recommendation: shift budget from');
  });

  test('without a server, the mock runs in the browser and still writes back', async ({
    app,
    page,
  }) => {
    await page.route('**/api/mode', (route) => route.fulfill({ status: 404, body: 'Not found' }));
    await app.open('/sales/leads');
    await expect(page.getByText('Mock mode')).toHaveAttribute('title', /in your browser/);
    const leads = new RecordTable(page, 'Leads');
    const row = leads.row('Jordan Park');
    await app.click(leads.cell(row, 0));
    await app.chat.ask('Mark this lead as qualified');
    await expect(app.chat.assistant).toContainText('Done.');
    await expect(row).toContainText('Qualified');
  });
});
