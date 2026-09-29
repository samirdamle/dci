import { expect, type Locator, type Page } from '@playwright/test';

/** Overlay box roles drawn by DCI (class names on `.box`). */
export type BoxRole = 'hover' | 'selected' | 'primary' | 'preview';

/** DCI's overlay layer, read through its open shadow root. */
export class Overlay {
  constructor(private readonly page: Page) {}

  /** Viewport rects of the visible boxes with `role`. */
  boxes(role: BoxRole) {
    return this.page.evaluate((cls) => {
      const shadow = document.querySelector('dci-root')?.shadowRoot;
      return [...(shadow?.querySelectorAll<HTMLElement>(`.box.${cls}`) ?? [])]
        .filter((b) => b.style.display === 'block')
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
    }, role);
  }

  /** The marquee's border style, or `'hidden'`. */
  marquee() {
    return this.page.evaluate(() => {
      const m = document
        .querySelector('dci-root')
        ?.shadowRoot?.querySelector<HTMLElement>('.marquee');
      return m?.style.display === 'block' ? getComputedStyle(m).borderTopStyle : 'hidden';
    });
  }

  /** Wait until a `role` box sits within 1px of `target`. */
  async expectAligned(target: Locator, role: BoxRole = 'selected') {
    await expect
      .poll(async () => {
        // getBoundingClientRect, as DCI measures (Playwright's box includes SVG strokes).
        const r = await target.evaluate((el) => {
          const b = el.getBoundingClientRect();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        });
        const boxes = await this.boxes(role);
        if (!boxes.length) return 'missing';
        const off = Math.min(
          ...boxes.map((b) =>
            Math.max(
              Math.abs(b.x - r.x),
              Math.abs(b.y - r.y),
              Math.abs(b.width - r.width),
              Math.abs(b.height - r.height),
            ),
          ),
        );
        return off <= 1 ? 'aligned' : `off by ${off.toFixed(1)}px`;
      })
      .toBe('aligned');
  }
}

/** The built-in chat UI (Playwright locators pierce DCI's open shadow root). */
export class Chat {
  readonly root: Locator;
  readonly chips: Locator;
  readonly input: Locator;
  readonly send: Locator;
  readonly user: Locator;
  readonly assistant: Locator;
  readonly limit: Locator;

  constructor(page: Page) {
    this.root = page.locator('dci-root .chat');
    this.chips = this.root.locator('.chip .name');
    this.input = this.root.locator('textarea');
    this.send = this.root.locator('button.send');
    this.user = this.root.locator('.msg.user');
    this.assistant = this.root.locator('.msg.assistant');
    this.limit = this.root.locator('.limit');
  }

  async ask(prompt: string) {
    await this.input.fill(prompt);
    await this.input.press('Enter');
  }

  action(name: string) {
    return this.root.locator('.actions').getByRole('button', { name, exact: true });
  }

  removeChip(label: string) {
    return this.root.getByRole('button', { name: `Remove ${label}` }).click();
  }

  confirmDialog() {
    return this.root.getByRole('alertdialog');
  }

  close() {
    return this.root.getByRole('button', { name: /^(Close|Collapse) chat$/ }).click();
  }
}
