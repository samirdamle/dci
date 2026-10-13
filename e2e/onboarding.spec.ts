import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './pages/fixtures';

/** The hands-on tour: each step's gesture on the sample deals, with the real chat. */
test.describe('onboarding tour', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
  });

  test('opens on a short intro to DCI, and Back from step 1 returns to it', async ({
    app,
    page,
  }) => {
    await app.open('/sales', { tour: 'on' });
    const tour = page.getByTestId('tour');
    await expect(
      tour.getByRole('heading', { name: 'Point and select. Don’t describe.' }),
    ).toBeVisible();
    await expect(tour.getByTestId('tour-intro').getByRole('heading')).toHaveText([
      'What is DCI?',
      'The problem',
      'How DCI fixes it',
    ]);
    expect(await new AxeBuilder({ page }).include('[role=dialog]').analyze()).toHaveProperty(
      'violations',
      [],
    );
    await tour.getByRole('button', { name: 'Show me how' }).click();
    await expect(tour.getByText('Step 1 of 3')).toBeVisible();
    await tour.getByRole('button', { name: 'Back' }).click();
    await expect(tour.getByTestId('tour-intro')).toBeVisible();
  });

  test('walks through select, add and select same type, then stays closed', async ({
    app,
    page,
  }) => {
    await app.open('/sales', { tour: 'on' });
    const tour = page.getByTestId('tour');
    await tour.getByRole('button', { name: 'Show me how' }).click();
    const deals = page.getByTestId('tour-deals').locator('[data-dci]');
    const status = page.getByTestId('tour-status');
    const chat = page.locator('dci-root .chat').filter({ visible: true });
    await expect(tour.getByText('Step 1 of 3')).toBeVisible();
    await expect(tour.getByRole('heading', { name: 'Select something' })).toBeVisible();
    await expect(status).not.toHaveAttribute('data-done');

    await app.click(deals.nth(0));
    await expect(status).toHaveAttribute('data-done');
    await expect(chat.locator('.chip .name')).toHaveText(['Alpine Outfitters renewal']);
    await tour.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(tour.getByRole('heading', { name: 'Add more to the selection' })).toBeVisible();
    await app.click(deals.nth(1), ['Shift']);
    await expect(status).toHaveAttribute('data-done');
    await expect(chat.locator('.chip .marker')).toHaveText(['A', 'B']);
    await tour.getByRole('button', { name: 'Next', exact: true }).click();

    // The last step starts from an empty selection.
    await expect(tour.getByRole('heading', { name: 'Select everything like it' })).toBeVisible();
    await expect(status).not.toHaveAttribute('data-done');
    await app.dblclick(deals.nth(2));
    await expect(status).toHaveAttribute('data-done');
    await expect(status).toContainText('You’re set');
    expect(await new AxeBuilder({ page }).include('[role=dialog]').analyze()).toHaveProperty(
      'violations',
      [],
    );
    await tour.getByRole('button', { name: 'Finish' }).click();
    await expect(tour).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('dci-demo-tour-seen'))).toBe('1');
  });

  test('can be skipped, and reopened from the top bar', async ({ app, page }) => {
    await app.open('/sales', { tour: 'on' });
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await expect(page.getByTestId('tour')).toHaveCount(0);
    await page.getByLabel('Take the tour').click();
    await expect(page.getByTestId('tour-intro')).toBeVisible();
  });

  test('does not open by itself for automated browsers', async ({ app, page }) => {
    await app.open('/sales');
    await expect(page.getByRole('heading', { name: 'Sales Home' })).toBeVisible();
    await expect(page.getByTestId('tour')).toHaveCount(0);
  });
});
