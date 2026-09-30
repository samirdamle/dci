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
  storage: { local: { clear(): Promise<void>; set(values: object): Promise<void> } };
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
  /** Open one of the extension's own pages (e.g. `options.html`) in a new tab. */
  openPage(path: string): Promise<Page>;
  /** Replace the extension's stored settings and secrets. */
  store(values: Record<string, unknown>): Promise<void>;
}

/**
 * Run `fn` in the extension's current service worker. MV3 workers are stopped
 * when idle and started again on demand, so the one found at launch may be
 * gone, or still starting (without extension APIs yet): retry briefly.
 */
async function inWorker<A, R>(context: BrowserContext, fn: (arg: A) => R | Promise<R>, arg?: A) {
  for (let attempt = 0; ; attempt++) {
    const worker =
      [...context.serviceWorkers()]
        .reverse()
        .find((w) => w.url().startsWith('chrome-extension://')) ??
      (await context.waitForEvent('serviceworker'));
    try {
      const ready = await worker.evaluate(
        () => !!(globalThis as { chrome?: { storage?: unknown } }).chrome?.storage,
      );
      // Playwright's evaluate() generics don't accept a generic `fn`; the call is sound.
      if (ready) return (await worker.evaluate(fn as never, arg as never)) as R;
    } catch (err) {
      if (attempt >= 20) throw err;
    }
    if (attempt >= 20) throw new Error('The extension service worker never became ready.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function tabId(context: BrowserContext, page: Page): Promise<number> {
  const url = page.url();
  return inWorker(
    context,
    async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)!.id!,
    url,
  );
}

export const test = base.extend<{ page: Page }, { extension: Extension }>({
  extension: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring.
    async ({}, use) => {
      // Built once by e2e/global-setup.ts.
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
          const id = await tabId(context, page);
          await inWorker(
            context,
            (i) => (globalThis as unknown as { dciToggle(id: number): Promise<void> }).dciToggle(i),
            id,
          );
        },
        badge: async (page) => {
          const id = await tabId(context, page);
          return inWorker(context, (tabId) => chrome.action.getBadgeText({ tabId }), id);
        },
        openPage: async (path) => {
          const page = await context.newPage();
          // `new URL(…).origin` is "null" for chrome-extension: URLs; the host is the id.
          await page.goto(`chrome-extension://${new URL(worker.url()).host}/${path}`);
          return page;
        },
        store: (values) =>
          inWorker(
            context,
            async (v) => {
              await chrome.storage.local.clear();
              await chrome.storage.local.set(v);
            },
            values,
          ),
      };
      await use(ext);
      await context.close();
    },
    { scope: 'worker' },
  ],
  page: async ({ extension }, use) => {
    // Every test starts from the default settings (offline answers).
    await extension.store({});
    const page = await extension.context.newPage();
    await use(page);
    await page.close();
  },
});

/** Serve `html` at `ORIGIN + path` in `page` and open it. */
export async function openPage(page: Page, html: string, path = '/') {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html>${html}` }),
  );
  await page.goto(`${ORIGIN}${path}`);
}

export { expect } from '@playwright/test';
