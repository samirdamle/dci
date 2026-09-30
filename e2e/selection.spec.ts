import { JourneyCanvas, KanbanBoard, RecordTable } from './pages/crm';
import { expect, test } from './pages/fixtures';

/**
 * Every selection gesture against the CRM demo. Runs once per modifier
 * project (Alt by default, and Control in `chromium-ctrl`).
 */
test.describe('selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
  });

  test('hovering with the modifier previews the node under the pointer', async ({ app, page }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    const cell = opps.cell(opps.rows.nth(1), 0);
    await app.holding(async () => {
      await cell.hover();
      await app.overlay.expectAligned(cell, 'hover');
    });
    await expect.poll(() => app.overlay.boxes('hover')).toEqual([]);
    await expect(app.chat.chips).toHaveCount(0);
  });

  test('Mod+Click selects, ↑ reaches the row, Mod+Shift+Click toggles, empty space clears', async ({
    app,
    page,
  }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    const [first] = await opps.names(1);
    // A cell is a `field` node; ↑ climbs to its opportunity row.
    await app.click(opps.cell(opps.rows.nth(0), 2));
    await expect(app.chat.chips).toHaveText(['Stage']);
    await page.keyboard.press('ArrowUp');
    await expect(app.chat.chips).toHaveText([first!]);
    await app.overlay.expectAligned(opps.rows.nth(0));

    const amount = opps.cell(opps.rows.nth(1), 3);
    await app.click(amount, ['Shift']);
    await expect(app.chat.chips).toHaveText([first!, 'Amount']);
    await app.click(amount, ['Shift']);
    await expect(app.chat.chips).toHaveText([first!]);

    // Empty space inside the DCI root (its padding) clears.
    await app.click(page.getByTestId('crm-content'), [], { x: 6, y: 6 });
    await expect(app.chat.chips).toHaveCount(0);
  });

  test('Mod+Wheel climbs from a cell to its row and then the table', async ({ app, page }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    const row = opps.rows.nth(2);
    const cell = opps.cell(row, 1);
    const [, , name] = await opps.names(3);
    const wheelThenClick = async (levels: number) =>
      app.holding(async () => {
        await cell.hover();
        await app.overlay.expectAligned(cell, 'hover');
        for (let i = 0; i < levels; i++) await page.mouse.wheel(0, -40);
        if (levels === 1) await app.overlay.expectAligned(row, 'hover');
        await page.mouse.down();
        await page.mouse.up();
      });
    await wheelThenClick(1);
    await expect(app.chat.chips).toHaveText([name!]);
    await wheelThenClick(2);
    await expect(app.chat.chips).toHaveText(['Opportunities']);
  });

  test('window select: contain, touch, Shift adds, Ctrl/Cmd subtracts', async ({
    app,
    page,
    modifier,
  }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    const names = await opps.names(5);
    const r = (i: number) => opps.rows.nth(i);

    // The selected rows, in any order (rows already selected keep their place).
    const selected = () => app.chat.chips.allTextContents().then((t) => t.sort());
    const rows = (...i: number[]) => i.map((n) => names[n]!).sort();

    // Right→left selects what it touches.
    await app.windowSelect(r(1), r(2), { touch: true });
    await expect.poll(selected).toEqual(expect.arrayContaining(rows(1, 2)));
    expect(await selected()).not.toContain(names[0]);

    // Left→right selects what it contains, replacing the selection; Shift adds.
    await app.windowSelect(r(0), r(2));
    await expect.poll(selected).toEqual(rows(0, 1, 2));
    await app.windowSelect(r(3), r(4), { extra: ['Shift'] });
    await expect.poll(selected).toEqual(rows(0, 1, 2, 3, 4));

    // Subtract with whichever of Ctrl/Cmd isn't the DCI modifier; Cmd on macOS,
    // where Ctrl+press is a right-click. Last, because headless WebKit on Linux
    // can keep reporting Ctrl as held on the next drag after it's released.
    const subtract = modifier === 'Control' || process.platform === 'darwin' ? 'Meta' : 'Control';
    await app.windowSelect(r(1), r(2), { extra: [subtract] });
    await expect.poll(selected).toEqual(rows(0, 3, 4));
  });

  test('window select auto-scrolls at the viewport edge, and Esc cancels', async ({
    app,
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 600 });
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    const first = opps.rows.nth(0);
    const a = (await first.boundingBox())!;
    await app.holding(async () => {
      await page.mouse.move(a.x - 4, a.y - 3);
      await page.mouse.down();
      await page.mouse.move(a.x + 400, 598, { steps: 6 });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      await expect.poll(() => app.overlay.marquee()).toBe('solid');
      await page.keyboard.press('Escape');
      await expect.poll(() => app.overlay.marquee()).toBe('hidden');
      await page.mouse.up();
    });
    await expect(app.chat.chips).toHaveCount(0);
  });

  test('Mod+Double-click a Kanban card selects every deal in that stage', async ({ app, page }) => {
    await app.open('/sales/pipeline');
    const board = new KanbanBoard(page);
    const cards = board.cards('Qualification');
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);
    await app.dblclick(cards.first());
    await expect(app.chat.chips).toHaveCount(Math.min(count, 50));
  });

  test('keyboard: ←/→ between cards, ↑ to the stage, Shift extends, Alt+Enter from focus', async ({
    app,
    page,
  }) => {
    await app.open('/sales/pipeline');
    const board = new KanbanBoard(page);
    const cards = board.cards('Qualification');
    const labels = await cards.evaluateAll((els) =>
      els.slice(0, 3).map((el) => JSON.parse(el.getAttribute('data-dci')!).label as string),
    );
    await app.click(cards.first());
    await expect(app.chat.chips).toHaveText([labels[0]!]);
    await page.keyboard.press('ArrowRight');
    await expect(app.chat.chips).toHaveText([labels[1]!]);
    await page.keyboard.press('ArrowLeft');
    await expect(app.chat.chips).toHaveText([labels[0]!]);
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(app.chat.chips).toHaveText(labels);
    await page.keyboard.press('ArrowUp');
    await expect(app.chat.chips).toHaveText(['Qualification']);

    // Alt+Enter selects the focused element's node without a pointer.
    await page.keyboard.press('Escape'); // closes the chat
    await page.keyboard.press('Escape'); // clears the selection
    await expect(app.chat.chips).toHaveCount(0);
    await board.board.focus();
    await page.keyboard.press('Alt+Enter');
    await expect(app.chat.chips).toHaveText(['Opportunity pipeline']);
  });

  test('keyboard: ↓ goes into journey steps, Esc closes the chat before clearing', async ({
    app,
    page,
  }) => {
    await app.open('/marketing/journeys');
    const canvas = new JourneyCanvas(page);
    await app.click(canvas.step('Gear care tips email'));
    await page.keyboard.press('ArrowUp');
    await expect(app.chat.chips).toHaveText(['Opened welcome email? → Opened']);
    await page.keyboard.press('ArrowDown');
    await expect(app.chat.chips).toHaveText(['Gear care tips email']);

    await expect(app.chat.root).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(app.chat.root).toBeHidden();
    await expect.poll(() => app.overlay.boxes('selected')).toHaveLength(1);
    await page.keyboard.press('Escape');
    await expect.poll(() => app.overlay.boxes('selected')).toHaveLength(0);
  });

  test('the private CreditLimit field is transparent to selection', async ({ app, page }) => {
    await app.open('/sales/accounts');
    await page
      .getByRole('link', { name: /Alpine/ })
      .first()
      .click();
    await app.click(page.getByText('Credit Limit'));
    await expect(app.chat.chips).toHaveText([/Alpine/]);
    await expect(app.chat.root).not.toContainText(/credit/i);
  });

  test('the unannotated "Org notes" card uses the fallback, and not when it is off', async ({
    app,
    page,
  }) => {
    await app.open('/sales');
    const notes = page.getByText('Q3 focus: convert Proposal-stage');
    await app.click(notes);
    await expect(app.chat.root.locator('.chip')).toHaveCount(1);
    await expect(app.chat.root.locator('.chip')).toContainText('unannotated');

    await app.open('/sales', { fallback: 'off' });
    await app.click(notes);
    await expect(app.chat.chips).toHaveCount(0);
  });

  test('shows a notice when the selection limit is reached', async ({ app, page }) => {
    await app.open('/sales/opportunities', { maxSelection: 3 });
    const opps = new RecordTable(page, 'Opportunities');
    await app.windowSelect(opps.rows.nth(0), opps.rows.nth(5));
    await expect(app.chat.chips).toHaveCount(3);
    await expect(app.chat.limit).toHaveText('Showing 3 of 6. Selection limit reached.');
  });
});
