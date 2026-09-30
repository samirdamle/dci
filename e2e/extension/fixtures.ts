import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';

/** The extension APIs the tests call inside the service worker. */
declare const chrome: {
  tabs: { query(query: object): Promise<Array<{ id?: number; url?: string }>> };
  action: { getBadgeText(details: { tabId: number }): Promise<string> };
};

const extensionDir = join(dirname(fileURLToPath(import.meta.url)), '../../apps/extension');
/** Pages are served from this origin with `page.route`; the e2e build may run there. */
export const ORIGIN = 'http://dci.test';

/** The loaded extension: its browser context and background service worker. */
export interface Extension {
  context: BrowserContext;
  worker: Worker;
  /** What the toolbar button does, for the tab showing `page`. */
  toggle(page: Page): Promise<void>;
  /** The toolbar badge text for `page`'s tab. */
  badge(page: Page): Promise<string>;
}

async function tabId(ext: { worker: Worker }, page: Page): Promise<number> {
  const url = page.url();
  return ext.worker.evaluate(
    async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)!.id!,
    url,
  );
}

export const test = base.extend<{ page: Page }, { extension: Extension }>({
  extension: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring.
    async ({}, use) => {
      execFileSync(process.execPath, ['scripts/build.mjs', '--e2e'], { cwd: extensionDir });
      const path = join(extensionDir, 'dist/e2e');
      // Extensions need the full Chromium (new headless), not the headless shell.
      const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
      });
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const ext: Extension = {
        context,
        worker,
        toggle: async (page) => {
          const id = await tabId(ext, page);
          await worker.evaluate(
            (i) => (globalThis as unknown as { dciToggle(id: number): Promise<void> }).dciToggle(i),
            id,
          );
        },
        badge: async (page) => {
          const id = await tabId(ext, page);
          return worker.evaluate((tabId) => chrome.action.getBadgeText({ tabId }), id);
        },
      };
      await use(ext);
      await context.close();
    },
    { scope: 'worker' },
  ],
  page: async ({ extension }, use) => {
    const page = await extension.context.newPage();
    await use(page);
    await page.close();
  },
});

/** Serve `html` at `ORIGIN + path` in `page` and open it. */
export async function openPage(page: Page, html: string, path = '/') {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html>${html}` }),
  );
  await page.goto(`${ORIGIN}${path}`);
}

export { expect } from '@playwright/test';
