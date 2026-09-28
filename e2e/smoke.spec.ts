import { expect, test } from '@playwright/test';

test('demo renders every package version in a card', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('DCI Demo')).toBeVisible();
  const rows = page.getByTestId('package-version');
  await expect(rows).toHaveCount(4);
  for (const name of ['@dci/protocol', '@dci/core', '@dci/react', '@dci/server']) {
    await expect(rows.filter({ hasText: name })).toContainText(/v\d+\.\d+\.\d+/);
  }
});
