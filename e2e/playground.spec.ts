import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await page.waitForSelector('dci-root', { state: 'attached' });
}

const drawer = (page: Page) => page.getByRole('dialog', { name: 'Playground' });
const chips = (page: Page) => page.locator('dci-root .chip .name');
const kpi = (page: Page, id: string) => page.locator(`[data-dci*='"id":"kpi.${id}"']`);

async function choose(page: Page, label: string, option: string) {
  await drawer(page).getByLabel(label).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('playground', () => {
  test('toggles apply immediately, and the cheat sheet follows the modifier', async ({ page }) => {
    await open(page, '/sales');
    await page.getByRole('button', { name: 'Playground' }).click();
    await expect(drawer(page)).toBeVisible();

    await choose(page, 'Mode', 'Panel');
    // Shift, not Ctrl: Ctrl+Click is a right-click on macOS.
    await choose(page, 'Modifier key', 'Shift');
    // Non-modal: the page stays usable while the drawer is open.
    await kpi(page, 'win-rate').click({ modifiers: ['Alt'] });
    await expect(chips(page)).toHaveCount(0);
    await kpi(page, 'win-rate').click({ modifiers: ['Shift'] });
    await expect(chips(page)).toHaveText(['Win Rate']);
    await expect(page.locator('dci-root .chat')).toHaveAttribute('role', 'complementary');

    await page.getByRole('button', { name: 'Gestures and keys' }).click();
    const sheet = page.getByRole('dialog', { name: 'Gestures and keys' });
    await expect(sheet).toContainText('Shift+Click');
    await expect(sheet).not.toContainText('Alt (⌥)+Click');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('note')).toContainText('Hold Shift');
  });

  test('the inspector previews the request and logs the response', async ({ page }) => {
    await open(page, '/sales');
    await page.getByRole('button', { name: 'Playground' }).click();
    await kpi(page, 'avg-deal-size').click({ modifiers: ['Alt'] });
    const preview = page.getByTestId('request-preview');
    await expect(preview).toContainText('"id": "kpi.avg-deal-size"');
    await expect(preview).toContainText('"sessionId"');

    await page
      .locator('dci-root .chat')
      .getByRole('button', { name: 'Why did this change?' })
      .click();
    const log = page.getByTestId('event-log');
    await expect(log).toContainText('text-delta');
    await expect(log).toContainText('done');
  });

  test('switching to the custom shadcn chat keeps the conversation and selection', async ({
    page,
  }) => {
    await open(page, '/sales');
    await kpi(page, 'win-rate').click({ modifiers: ['Alt'] });
    const builtIn = page.locator('dci-root .chat');
    await builtIn.getByRole('button', { name: 'Summarize' }).click();
    await expect(builtIn.locator('.msg.assistant')).toContainText('Win Rate');

    await page.getByRole('button', { name: 'Playground' }).click();
    await choose(page, 'Chat UI', 'Custom shadcn chat');
    const custom = page.getByRole('complementary', { name: 'Custom chat' });
    await expect(custom).toBeVisible();
    await expect(builtIn).toHaveCount(0);
    await expect(custom.getByRole('log')).toContainText('Summarize');

    // Selecting still feeds the custom chat, and it can send on its own.
    await kpi(page, 'open-pipeline').click({ modifiers: ['Alt'] });
    await expect(custom.getByLabel('Context')).toContainText('Open Pipeline');
    await custom.getByLabel('Message').fill('And this one?');
    await custom.getByLabel('Message').press('Enter');
    await expect(custom.getByRole('log')).toContainText('Open Pipeline');

    await choose(page, 'Chat UI', 'Default DCI UI');
    await expect(custom).toHaveCount(0);
    await page.locator('dci-root .chat').waitFor({ state: 'attached' });
    await expect(page.locator('dci-root .chat .msg.user')).toHaveCount(2);
  });

  test('the first-run hint can be dismissed for good', async ({ page }) => {
    await open(page, '/sales');
    await page.getByRole('button', { name: 'Dismiss hint' }).click();
    await expect(page.getByRole('note')).toHaveCount(0);
    await page.reload();
    await page.waitForSelector('dci-root', { state: 'attached' });
    await expect(page.getByRole('heading', { name: 'Sales Home' })).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
  });

  test('has no axe violations with the drawer and custom chat open', async ({ page }) => {
    await open(page, '/sales');
    await page.getByRole('button', { name: 'Playground' }).click();
    await choose(page, 'Chat UI', 'Custom shadcn chat');
    await expect(page.getByRole('complementary', { name: 'Custom chat' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.help}`)).toEqual([]);
  });
});
