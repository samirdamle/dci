import { test as base, type Locator, type Page } from '@playwright/test';
import { Chat, Overlay } from './dci';

export type Modifier = 'Alt' | 'Control' | 'Meta' | 'Shift';

export interface DemoOptions {
  /** The DCI modifier the demo is started with (a parameterized project option). */
  modifier: Modifier;
}

/** The CRM demo with DCI, driven with whichever modifier the project uses. */
export class CrmApp {
  readonly overlay: Overlay;
  readonly chat: Chat;

  constructor(
    readonly page: Page,
    readonly mod: Modifier,
  ) {
    this.overlay = new Overlay(page);
    this.chat = new Chat(page);
  }

  /** Open a route; `settings` become playground URL params (e.g. `{ fallback: 'off' }`). */
  async open(path: string, settings: Record<string, string | number> = {}) {
    const params = new URLSearchParams({ modifier: this.mod });
    for (const [k, v] of Object.entries(settings)) params.set(k, String(v));
    await this.page.goto(`/?${params}#${path}`);
    await this.page.waitForSelector('dci-root', { state: 'attached' });
  }

  /** Mod+Click, optionally with more modifiers (Mod+Shift+Click toggles). */
  click(target: Locator, extra: Modifier[] = [], position?: { x: number; y: number }) {
    return target.click({ modifiers: [this.mod, ...extra], ...(position ? { position } : {}) });
  }

  dblclick(target: Locator) {
    return target.dblclick({ modifiers: [this.mod] });
  }

  /** Run `fn` with the modifier held down. */
  async holding<T>(fn: () => Promise<T>): Promise<T> {
    await this.page.keyboard.down(this.mod);
    try {
      return await fn();
    } finally {
      await this.page.keyboard.up(this.mod);
    }
  }

  /**
   * Mod+Drag from just outside `from`'s top-left to `to`'s bottom-right
   * ("contain"), or the reverse direction (`touch`). `extra` keys are held
   * during the drag; `beforeRelease` runs before the mouse is released.
   */
  async windowSelect(
    from: Locator,
    to: Locator,
    {
      touch = false,
      extra = [],
      beforeRelease,
    }: { touch?: boolean; extra?: Modifier[]; beforeRelease?: () => Promise<void> } = {},
  ) {
    const a = (await from.boundingBox())!;
    const b = (await to.boundingBox())!;
    const width = this.page.viewportSize()!.width;
    const topLeft = { x: a.x - 4, y: a.y - 3 };
    const bottomRight = { x: Math.min(b.x + b.width + 4, width - 2), y: b.y + b.height + 3 };
    // Touch mode drags right→left; stay inside the rows so it only touches them.
    const [start, end] = touch
      ? [
          { x: bottomRight.x - 8, y: a.y + 3 },
          { x: b.x + 8, y: b.y + b.height - 3 },
        ]
      : [topLeft, bottomRight];
    await this.holding(async () => {
      for (const k of extra) await this.page.keyboard.down(k);
      await this.page.mouse.move(start.x, start.y);
      await this.page.mouse.down();
      await this.page.mouse.move(end.x, end.y, { steps: 6 });
      await beforeRelease?.();
      await this.page.mouse.up();
      for (const k of extra) await this.page.keyboard.up(k);
    });
  }
}

export const test = base.extend<DemoOptions & { app: CrmApp }>({
  modifier: ['Alt', { option: true }],
  app: async ({ page, modifier }, use) => {
    await use(new CrmApp(page, modifier));
  },
});

export { expect } from '@playwright/test';
