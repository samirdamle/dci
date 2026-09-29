import { expect, test, type Locator, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/#/classic');
  await page.waitForSelector('dci-root', { state: 'attached' });
}

const row = (page: Page, text: string) => page.locator('tr', { hasText: text });

/** Rects of visible overlay boxes matching a class, read from the shadow root. */
function boxes(page: Page, cls: string) {
  return page.evaluate((c) => {
    const shadow = document.querySelector('dci-root')!.shadowRoot!;
    return [...shadow.querySelectorAll<HTMLElement>(`.box.${c}`)]
      .filter((b) => b.style.display === 'block')
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, className: b.className };
      });
  }, cls);
}

async function expectAligned(page: Page, target: Locator, cls = 'selected') {
  await expect
    .poll(async () => {
      const [box] = await boxes(page, cls);
      const r = await target.boundingBox();
      if (!box || !r) return 'missing';
      const off = Math.max(
        Math.abs(box.x - r.x),
        Math.abs(box.y - r.y),
        Math.abs(box.width - r.width),
        Math.abs(box.height - r.height),
      );
      return off <= 1 ? 'aligned' : `off by ${off}px`;
    })
    .toBe('aligned');
}

test.describe('overlay', () => {
  test('Alt+Click selects a row and draws an aligned box', async ({ page }) => {
    await ready(page);
    const target = row(page, 'INV-102');
    await target
      .locator('td')
      .nth(1)
      .click({ modifiers: ['Alt'] });
    await expectAligned(page, target);
    await expect(page.getByTestId('context')).toContainText('"id": "inv_102"');
  });

  test('boxes stay aligned when the window and a nested container scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 500 });
    await ready(page);
    const card = page.locator('[data-dci*="opp_5"]');
    await card.scrollIntoViewIfNeeded();
    await card.click({ modifiers: ['Alt'], position: { x: 10, y: 10 } });
    await expectAligned(page, card);

    await page.mouse.wheel(0, 120);
    await expectAligned(page, card);

    await page.getByTestId('pipeline-scroller').evaluate((el) => (el.scrollTop = 30));
    await expectAligned(page, card);

    await page.setViewportSize({ width: 900, height: 600 });
    await expectAligned(page, card);
  });

  test('is not clipped inside an overflow: hidden container', async ({ page }) => {
    await ready(page);
    const note = page.locator('[data-dci*="Account note"]');
    await note.scrollIntoViewIfNeeded();
    await note.click({ modifiers: ['Alt'] });
    await expectAligned(page, note);
  });

  test('host page styles do not leak into DCI UI, but theme tokens apply', async ({ page }) => {
    await ready(page);
    await page.addStyleTag({
      content: `
        * { color: red !important; font-family: serif !important; }
        div, span { display: flex !important; border: 5px solid lime !important; }
        dci-root { --dci-selected: rgb(255, 0, 128); }`,
    });
    await row(page, 'INV-101')
      .locator('td')
      .first()
      .click({ modifiers: ['Alt'] });
    await expect.poll(async () => (await boxes(page, 'selected')).length).toBe(1);
    const styles = await page.evaluate(() => {
      const shadow = document.querySelector('dci-root')!.shadowRoot!;
      const box = shadow.querySelector<HTMLElement>('.box.selected')!;
      const label = box.querySelector<HTMLElement>('.label')!;
      const b = getComputedStyle(box);
      const l = getComputedStyle(label);
      return {
        boxDisplay: b.display,
        borderColor: b.borderTopColor,
        labelColor: l.color,
        labelFont: l.fontFamily,
      };
    });
    expect(styles.boxDisplay).toBe('block');
    expect(styles.borderColor).toBe('rgb(255, 0, 128)');
    expect(styles.labelColor).toBe('rgb(255, 255, 255)');
    expect(styles.labelFont).not.toContain('serif,');
    expect(styles.labelFont).not.toBe('serif');
  });

  test('marquee is solid left→right and dashed right→left', async ({ page }) => {
    await ready(page);
    const table = await page.getByTestId('invoices').boundingBox();
    if (!table) throw new Error('no table');
    const marqueeStyle = () =>
      page.evaluate(() => {
        const m = document
          .querySelector('dci-root')!
          .shadowRoot!.querySelector<HTMLElement>('.marquee')!;
        return m.style.display === 'block' ? getComputedStyle(m).borderTopStyle : 'hidden';
      });

    await page.keyboard.down('Alt');
    await page.mouse.move(table.x - 5, table.y + 30);
    await page.mouse.down();
    await page.mouse.move(table.x + table.width + 5, table.y + 110, { steps: 4 });
    await expect.poll(marqueeStyle).toBe('solid');
    await page.mouse.up();
    await expect.poll(marqueeStyle).toBe('hidden');
    await expect(page.getByTestId('context')).toContainText('"source": "annotated"');

    await page.mouse.move(table.x + table.width - 10, table.y + 60);
    await page.mouse.down();
    await page.mouse.move(table.x + table.width - 80, table.y + 90, { steps: 4 });
    await expect.poll(marqueeStyle).toBe('dashed');
    await page.mouse.up();
    await page.keyboard.up('Alt');
  });

  test('keyboard navigation moves the selection and Esc clears it', async ({ page }) => {
    await ready(page);
    await row(page, 'INV-101')
      .locator('td')
      .first()
      .click({ modifiers: ['Alt'] });
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('context')).toContainText('"id": "inv_101.amount"');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('context')).toContainText('"id": "inv_102"');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('context')).toHaveText('Nothing selected yet.');
  });

  test('reduced motion disables the boundary animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    await row(page, 'INV-101')
      .locator('td')
      .first()
      .click({ modifiers: ['Alt'] });
    await expect.poll(async () => (await boxes(page, 'primary')).length).toBe(1);
    await page.keyboard.press('ArrowLeft'); // first row: no previous sibling
    const animation = await page.evaluate(() => {
      const box = document
        .querySelector('dci-root')!
        .shadowRoot!.querySelector<HTMLElement>('.box.primary')!;
      return {
        shaking: box.classList.contains('shake'),
        name: getComputedStyle(box).animationName,
      };
    });
    expect(animation.shaking).toBe(true);
    expect(animation.name).toBe('none');
  });
});
