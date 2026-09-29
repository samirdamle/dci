import { KanbanBoard } from './pages/crm';
import { Overlay } from './pages/dci';
import { expect, test } from './pages/fixtures';

test.describe('overlay on the CRM', () => {
  test('a Recharts line point is selectable and the box lines up', async ({ app, page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await app.open('/marketing');
    const points = page.locator(`[data-dci*='"type":"datapoint"']`);
    await points.first().scrollIntoViewIfNeeded();
    // Series overlap; take a point that is topmost at its own centre.
    const index = await points.evaluateAll((gs) =>
      gs.findIndex((g) => {
        const r = g.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit?.closest('[data-dci]') === g;
      }),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const point = points.nth(index);
    const label = JSON.parse((await point.getAttribute('data-dci'))!).label as string;
    // SVG <g> groups fail Playwright's actionability checks; click the point directly.
    const r = (await point.boundingBox())!;
    await app.holding(() => page.mouse.click(r.x + r.width / 2, r.y + r.height / 2));
    await expect(app.chat.chips).toHaveText([label]);
    await app.overlay.expectAligned(point);
  });

  test('boxes follow a resize and a horizontally scrolled Kanban board', async ({ app, page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await app.open('/sales/pipeline');
    const board = new KanbanBoard(page);
    const card = board.cards('Proposal').first();
    await app.click(card);
    await app.chat.close();
    await app.overlay.expectAligned(card);

    await board.board.evaluate((el) => (el.scrollLeft = 180));
    await app.overlay.expectAligned(card);

    // Narrower: the card now overflows the viewport (boxes clip to it), so
    // bring it back into view; the box follows both the resize and the scroll.
    await page.setViewportSize({ width: 1000, height: 800 });
    await card.scrollIntoViewIfNeeded();
    await app.overlay.expectAligned(card);
  });
});

/**
 * Pixel snapshots of the overlay on a text-free fixture. Baselines exist for
 * Chromium on Linux (CI); other engines and platforms skip.
 */
test.describe('overlay visuals', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium' || process.platform !== 'linux',
    'baselines are Chromium/Linux only',
  );

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 520, height: 260 });
    await page.goto('/visual.html');
    await page.waitForSelector('body[data-ready="true"]');
  });

  const shot = { animations: 'disabled', maxDiffPixelRatio: 0.01 } as const;

  test('hover, selected and primary boxes', async ({ page }) => {
    await page.evaluate(() =>
      (window as unknown as { dci: { selection: { set(ids: string[]): void } } }).dci.selection.set(
        ['t0', 't4'],
      ),
    );
    const hover = (await page.locator('#t2').boundingBox())!;
    await page.keyboard.down('Alt');
    await page.mouse.move(hover.x + 20, hover.y + 20);
    await expect.poll(async () => (await new Overlay(page).boxes('hover')).length).toBe(1);
    await expect(page).toHaveScreenshot('boxes.png', shot);
    await page.keyboard.up('Alt');
  });

  test('contain (solid) and touch (dashed) marquees with previews', async ({ page }) => {
    const overlay = new Overlay(page);
    const a = (await page.locator('#t0').boundingBox())!;
    const b = (await page.locator('#t4').boundingBox())!;
    await page.keyboard.down('Alt');
    await page.mouse.move(a.x - 8, a.y - 8);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width + 8, b.y + b.height + 8, { steps: 4 });
    await expect.poll(() => overlay.marquee()).toBe('solid');
    await expect.poll(async () => (await overlay.boxes('preview')).length).toBe(4);
    await expect(page).toHaveScreenshot('marquee-contain.png', shot);
    await page.keyboard.press('Escape');
    await page.mouse.up();

    await page.mouse.move(b.x + 20, b.y + 20);
    await page.mouse.down();
    await page.mouse.move(a.x + 20, a.y + 20, { steps: 4 });
    await expect.poll(() => overlay.marquee()).toBe('dashed');
    await expect(page).toHaveScreenshot('marquee-touch.png', shot);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.keyboard.up('Alt');
  });
});
