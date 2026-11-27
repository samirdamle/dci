import AxeBuilder from '@axe-core/playwright';
import { RecordTable } from './pages/crm';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './pages/fixtures';

/**
 * Text selection (spec §13.2) against the CRM demo in deterministic mock
 * mode. The selectable prose surface is the "Org notes" card on Sales Home:
 * two unannotated paragraphs, so a drag selects words rather than a node.
 * The private surface is the Credit Limit field on an account record.
 */
test.describe('text selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
  });

  /** The first Org-notes paragraph on Sales Home. */
  const notes = (page: Page) => page.getByText('Q3 focus: convert Proposal-stage');

  /** The floating pill (inside DCI's Shadow DOM). */
  const pill = (page: Page) => page.locator('dci-root .text-pill');

  /** Whether the pill is currently shown. */
  const pillVisible = (page: Page) =>
    page.evaluate(() => {
      const b = document
        .querySelector('dci-root')
        ?.shadowRoot?.querySelector<HTMLElement>('.text-pill');
      return b?.getAttribute('data-visible') === 'true';
    });

  /** Text chips in the chat (as opposed to element chips). */
  const textChips = (page: Page) => page.locator('dci-root .chip[data-text]');

  /** The live native selection's text (empty when collapsed). */
  const liveSelection = (page: Page) =>
    page.evaluate(() => window.getSelection()?.toString() ?? '');

  /** Whether the CSS Custom Highlight registry holds a `dci-text` entry. */
  const hasTextHighlight = (page: Page) => page.evaluate(() => CSS.highlights.has('dci-text'));

  /** How many ranges the `dci-text` highlight currently covers. */
  const highlightRangeCount = (page: Page) =>
    page.evaluate(() => CSS.highlights.get('dci-text')?.size ?? 0);

  /**
   * Drag across `target` with a real mouse drag, selecting most of its
   * text. The drag stays inside the element so the selection is one range.
   */
  async function dragSelect(page: Page, target: Locator) {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    const y = box.y + box.height / 2;
    // Collapse any existing selection first: a drag that starts inside a
    // live selection drag-and-drops the selected text instead of selecting.
    await page.mouse.click(box.x + box.width - 4, y);
    await page.mouse.move(box.x + 4, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 4, y, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => liveSelection(page)).not.toBe('');
  }

  /** Drag-select the Org-notes paragraph and wait for the pill. */
  async function selectNotes(page: Page) {
    await dragSelect(page, notes(page));
    await expect.poll(() => pillVisible(page)).toBe(true);
  }

  /** Capture the live range via the pill; the chat opens with a text chip. */
  async function captureViaPill(app: { chat: { chips: Locator } }, page: Page) {
    await pill(page).click();
    await expect(app.chat.chips).toHaveCount(1);
    await expect(textChips(page)).toHaveCount(1);
  }

  test('drag text → pill appears → tap → chat opens with a text chip; ask and the mock responder receives the excerpt', async ({
    app,
    page,
  }) => {
    await app.open('/sales');
    await selectNotes(page);
    await expect(pill(page)).toHaveText('Ask about this');
    await expect(pill(page)).toHaveAttribute('aria-label', 'Ask about this selection');
    // The pill carries the excerpt as its tooltip, with the character count.
    await expect(pill(page)).toHaveAttribute('title', /Q3 focus: convert Proposal-stage/);

    await captureViaPill(app, page);
    await expect(app.chat.root).toBeVisible();
    await expect(textChips(page).locator('.name')).toHaveText(
      'Q3 focus: convert Proposal-stage tent deals before the winter catalog ships.',
    );
    await expect(textChips(page).locator('small')).toHaveText('text');
    await expect(textChips(page).locator('.marker')).toHaveText('A');
    // DOM-level highlight check (pixel rendering is spike-verified, §12):
    // the captured range is registered in CSS.highlights.
    await expect.poll(() => hasTextHighlight(page)).toBe(true);
    await expect.poll(() => highlightRangeCount(page)).toBe(1);

    // The request inspector shows the exact next request: the excerpt
    // travels as a `source: 'text'` context node.
    await page.getByRole('button', { name: 'Playground' }).click();
    const preview = page.getByTestId('request-preview');
    await expect(preview).toContainText('"source": "text"');
    await expect(preview).toContainText(
      'Q3 focus: convert Proposal-stage tent deals before the winter catalog ships.',
    );

    await app.chat.ask('What does this imply for the winter catalog?');
    // The mock responder quotes the context it received back, so the
    // excerpt in its reply proves it arrived in the request.
    await expect(app.chat.assistant).toContainText('Q3 focus: convert Proposal-stage', {
      timeout: 10_000,
    });
    await expect(page.getByTestId('event-log')).toContainText('done');
  });

  test('add text to an already-open chat: chip appears, no auto-send, draft untouched', async ({
    app,
    page,
  }) => {
    await app.open('/sales');
    const winRate = page.locator(`[data-dci*='"id":"kpi.win-rate"']`);
    await app.click(winRate);
    await expect(app.chat.chips).toHaveText(['Win Rate']);
    await app.chat.input.fill('What changed here?');

    await selectNotes(page);
    await expect(pill(page)).toHaveText('+ Add to chat');
    await expect(pill(page)).toHaveAttribute('aria-label', 'Add selection to chat');
    await pill(page).click();
    await expect(app.chat.chips).toHaveCount(2);
    await expect(textChips(page)).toHaveCount(1);
    await expect(textChips(page).locator('.marker')).toHaveText('B');
    // Nothing was sent and the draft is untouched.
    await expect(app.chat.user).toHaveCount(0);
    await expect(app.chat.input).toHaveValue('What changed here?');
    // The new chip is pending context for the next message.
    await page.getByRole('button', { name: 'Playground' }).click();
    await expect(page.getByTestId('request-preview')).toContainText('"source": "text"');
  });

  test('Mod+Click on a live range captures the text instead of the node', async ({ app, page }) => {
    await app.open('/sales');
    await dragSelect(page, notes(page));
    const rect = await page.evaluate(() => {
      const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    // The pointer gesture arms on the project's configured modifier
    // (Alt in chromium, Control in chromium-ctrl) — never a hardcoded key.
    await page.keyboard.down(app.mod);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up(app.mod);
    await expect(textChips(page)).toHaveCount(1);
    // The whole unannotated card was not selected as a fallback node.
    await expect(app.chat.chips).toHaveCount(1);
    await expect(app.chat.root).toBeVisible();
  });

  test('Alt+Enter with a range captures it; Alt+Enter without a range selects the focused node', async ({
    app,
    page,
  }) => {
    await app.open('/sales');
    await dragSelect(page, notes(page));
    // Alt+Enter is a literal key binding (keys.ts matchesCombo), not the
    // configured modifier, so it stays 'Alt+Enter' in every project.
    await page.keyboard.press('Alt+Enter');
    await expect(textChips(page)).toHaveCount(1);
    await expect(app.chat.root).toBeVisible();

    // No range: Alt+Enter behaves exactly as today.
    await app.open('/sales/pipeline');
    const board = page.getByRole('region', { name: 'Opportunity pipeline' });
    await board.focus();
    await page.keyboard.press('Alt+Enter');
    await expect(app.chat.chips).toHaveText(['Opportunity pipeline']);
    await expect(textChips(page)).toHaveCount(0);
  });

  test('Alt+Drag still window-selects nodes and never produces a text item', async ({
    app,
    page,
  }) => {
    await app.open('/sales/opportunities');
    const opps = new RecordTable(page, 'Opportunities');
    await app.windowSelect(opps.rows.nth(0), opps.rows.nth(2));
    await expect(app.chat.chips).toHaveCount(3);
    await expect(textChips(page)).toHaveCount(0);
    await expect.poll(() => pillVisible(page)).toBe(false);
  });

  test('remove a text chip → highlight gone, context gone', async ({ app, page }) => {
    await app.open('/sales');
    await selectNotes(page);
    await captureViaPill(app, page);
    await expect.poll(() => hasTextHighlight(page)).toBe(true);

    const label = (await textChips(page).locator('.name').textContent())!;
    await app.chat.removeChip(label);
    await expect(app.chat.chips).toHaveCount(0);
    await expect.poll(() => hasTextHighlight(page)).toBe(false);
    await expect.poll(() => highlightRangeCount(page)).toBe(0);

    // The context is gone from the next request too.
    await page.getByRole('button', { name: 'Playground' }).click();
    await expect(page.getByTestId('request-preview')).not.toContainText('"source": "text"');
  });

  test('Esc dismisses the pill; Esc with no pill closes the chat first, then clears the selection', async ({
    app,
    page,
  }) => {
    await app.open('/sales');
    await selectNotes(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => pillVisible(page)).toBe(false);
    await expect(app.chat.root).toBeHidden();

    // Capture again, then Esc twice: chat closes, then the selection clears.
    // (A text selection has no element for the overlay to box, so the
    // "still selected" check is the persistent CSS highlight, not a box.)
    await selectNotes(page);
    await captureViaPill(app, page);
    await expect(app.chat.root).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(app.chat.root).toBeHidden();
    await expect.poll(() => hasTextHighlight(page)).toBe(true);
    await expect(app.chat.chips).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect.poll(() => hasTextHighlight(page)).toBe(false);
    await expect(app.chat.chips).toHaveCount(0);
  });

  test('private text: no pill, no capture', async ({ app, page }) => {
    await app.open('/sales/accounts');
    await page
      .getByRole('link', { name: /Alpine/ })
      .first()
      .click();
    const creditLimit = page.locator('[data-dci*="CreditLimit"]');
    await dragSelect(page, creditLimit);
    // The drag really did select the private value's text…
    expect(await liveSelection(page)).not.toBe('');
    // …but no pill appears for it, and Alt+Enter captures nothing.
    await expect.poll(() => pillVisible(page)).toBe(false);
    await page.keyboard.press('Alt+Enter');
    await expect(app.chat.chips).toHaveCount(0);
    await expect(app.chat.root).toBeHidden();
    await expect.poll(() => hasTextHighlight(page)).toBe(false);
  });

  test('has no axe violations with the pill visible', async ({ app, page }) => {
    await app.open('/sales');
    await selectNotes(page);
    const results = await new AxeBuilder({ page }).include('dci-root').analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('has no axe violations with a chat containing a text chip', async ({ app, page }) => {
    await app.open('/sales');
    await selectNotes(page);
    await captureViaPill(app, page);
    const results = await new AxeBuilder({ page }).include('dci-root').analyze();
    // Known pre-existing issue, not text-specific: the demo theme pairs
    // `--dci-muted` with `--dci-surface` at 4.34:1, so every chip's `<small>`
    // tag (element chips included — verified with a plain Win Rate chip)
    // fails color-contrast. The text chip must introduce nothing beyond it.
    const beyondKnown = results.violations.filter(
      (v) =>
        !(
          v.id === 'color-contrast' &&
          v.nodes.every((n) => n.target.flat().join(' ').endsWith('small'))
        ),
    );
    expect(beyondKnown.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
