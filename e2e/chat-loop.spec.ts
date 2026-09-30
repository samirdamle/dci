import AxeBuilder from '@axe-core/playwright';
import type { Route } from '@playwright/test';
import { RecordTable } from './pages/crm';
import { expect, test, type CrmApp } from './pages/fixtures';

/** The chat loop on CRM records against the demo backend in mock mode. */

async function selectOpportunity(app: CrmApp, index = 0) {
  const opps = new RecordTable(app.page, 'Opportunities');
  await app.click(opps.cell(opps.rows.nth(index), 2));
  await app.page.keyboard.press('ArrowUp');
  const [name] = (await opps.names(index + 1)).slice(index);
  await expect(app.chat.chips).toHaveText([name!]);
  return { opps, name: name! };
}

test.describe('chat loop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
  });

  test('asks, streams an answer, then a follow-up keeps the thread', async ({ app }) => {
    await app.open('/sales/opportunities');
    const { name } = await selectOpportunity(app);
    await expect(app.chat.root).toBeVisible();
    await app.chat.ask('Summarize this deal');
    await expect(app.chat.assistant).toHaveCount(1);
    await expect(app.chat.assistant.first()).toContainText(name.split(' – ')[0]!);
    await expect(app.chat.send).toHaveText('Send');

    await app.chat.ask('What should I do next?');
    await expect(app.chat.user).toHaveCount(2);
    await expect(app.chat.assistant).toHaveCount(2);
    await expect(app.chat.assistant.nth(1)).not.toBeEmpty();
  });

  test('a suggested action sends its id as `action`', async ({ app, page }) => {
    await app.open('/sales/opportunities');
    await selectOpportunity(app);
    const request = page.waitForRequest('**/api/dci');
    await app.chat.action('Draft follow-up email').click();
    const body = (await request).postDataJSON() as { action?: string; prompt: string };
    expect(body.action).toBe('draft-follow-up');
    await expect(app.chat.assistant).toContainText('Subject: Next steps on');
  });

  test('Stop ends a pending reply, and Retry recovers from an error', async ({ app, page }) => {
    await app.open('/sales/opportunities');
    await selectOpportunity(app);

    // A reply that never arrives: the send button becomes Stop.
    const held: Route[] = [];
    await page.route('**/api/dci', (route) => void held.push(route));
    await app.chat.ask('Summarize this deal');
    await expect(app.chat.send).toHaveText('Stop');
    await app.chat.send.click();
    await expect(app.chat.root.locator('.stopped')).toHaveText('Stopped.');
    await expect(app.chat.send).toHaveText('Send');
    await page.unroute('**/api/dci');

    // A failing request shows an error with Retry, which succeeds.
    await page.route('**/api/dci', (route) => route.fulfill({ status: 500, body: 'boom' }), {
      times: 1,
    });
    await app.chat.ask('Summarize this deal');
    const error = app.chat.root.getByRole('alert');
    await expect(error).toContainText('Something went wrong');
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(error).toHaveCount(0);
    await expect(app.chat.assistant.last()).not.toBeEmpty();
    for (const route of held) await route.abort().catch(() => {});
  });

  test('mid-chat: Mod+Click adds a chip for the next turn; removing it deselects', async ({
    app,
  }) => {
    await app.open('/sales/opportunities');
    const { opps } = await selectOpportunity(app);
    await app.chat.ask('Summarize this deal');
    await expect(app.chat.assistant).toHaveCount(1);
    // Chips show context for the next message: nothing new yet.
    await expect(app.chat.chips).toHaveCount(0);

    // Rows below the popover, which is anchored under the first one.
    const name = opps.cell(opps.rows.nth(8), 0);
    const amount = opps.cell(opps.rows.nth(9), 3);
    await app.click(name);
    await app.click(amount, ['Shift']);
    await expect(app.chat.chips).toHaveText(['Opportunity', 'Amount']);
    await expect.poll(async () => (await app.overlay.boxes('selected')).length).toBe(2);
    await expect(app.chat.user).toHaveCount(1); // the conversation is kept

    await app.chat.removeChip('Amount');
    await expect(app.chat.chips).toHaveText(['Opportunity']);
    await expect.poll(async () => (await app.overlay.boxes('selected')).length).toBe(1);
    await app.overlay.expectAligned(name);
  });

  test('confirm before send: Cancel keeps it local, Send goes through', async ({ app }) => {
    await app.open('/sales/opportunities', { confirmBeforeSend: 'on' });
    await selectOpportunity(app);
    await app.chat.ask('Summarize this deal');
    const dialog = app.chat.confirmDialog();
    await expect(dialog).toContainText('Send this context to the assistant?');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(app.chat.root).toContainText('Message not sent.');
    await expect(app.chat.assistant).toHaveCount(0);

    await app.chat.ask('Summarize this deal');
    await app.chat.confirmDialog().getByRole('button', { name: 'Send' }).click();
    await expect(app.chat.assistant).toHaveCount(1);
    await expect(app.chat.assistant).not.toBeEmpty();
  });

  test('panel mode docks the chat as a complementary landmark', async ({ app }) => {
    await app.open('/sales/opportunities', { chatMode: 'panel' });
    await selectOpportunity(app);
    await expect(app.chat.root).toHaveAttribute('role', 'complementary');
    await expect
      .poll(async () => {
        const box = await app.chat.root.boundingBox();
        return box && Math.round(box.x + box.width);
      })
      .toBe(1400);
  });

  for (const open of [false, true]) {
    test(`Opportunities has no axe violations with the chat ${open ? 'open' : 'closed'}`, async ({
      app,
      page,
    }) => {
      await app.open('/sales/opportunities');
      if (open) {
        await selectOpportunity(app);
        await app.chat.ask('Summarize this deal');
        await expect(app.chat.assistant).not.toBeEmpty();
      }
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.help}`)).toEqual([]);
    });
  }
});
