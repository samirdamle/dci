import { expect, test, type CDPSession, type Page } from '@playwright/test';

/** The slice of the DCI instance these tests use (set by `apps/demo/src/fixtures/perf.ts`). */
interface Instance {
  selection: { get(): unknown[]; set(ids: string[]): void };
  chat: { open(): void };
  destroy(): void;
}
declare global {
  interface Window {
    fixture: { create(): Instance; dci: Instance | null };
  }
}

/**
 * Runtime budgets (SPEC §12), measured in Chromium with CDP. Frame times come
 * from requestAnimationFrame deltas during the interaction; "60 fps" means a
 * p95 frame under ~20 ms (one 16.7 ms frame plus scheduling slack) and no
 * long tasks. Run with `pnpm e2e:perf` (nightly in CI).
 */

async function open(page: Page, rows: number) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/perf.html?rows=${rows}`);
  await page.waitForSelector('body[data-ready="true"]');
}

/** Record frame deltas and long tasks while `interaction` runs. */
async function frames(page: Page, interaction: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __long: number[]; __stop: boolean };
    w.__frames = [];
    w.__long = [];
    w.__stop = false;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ type: 'longtask', buffered: false });
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await interaction();
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __long: number[]; __stop: boolean };
    w.__stop = true;
    const sorted = w.__frames.slice(1).sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    return { count: sorted.length, p95, longTasks: w.__long.length, worst: sorted.at(-1) ?? 0 };
  });
}

/** Window/document event listeners, via CDP. */
async function listeners(cdp: CDPSession, expression: string) {
  const { result } = await cdp.send('Runtime.evaluate', { expression });
  const { listeners: list } = await cdp.send('DOMDebugger.getEventListeners', {
    objectId: result.objectId!,
  });
  return list.map((l) => l.type).sort();
}

test.describe('runtime budgets', () => {
  test('idle: only keydown/keyup/blur listeners and no long tasks until armed', async ({
    page,
  }) => {
    await open(page, 1000);
    const cdp = await page.context().newCDPSession(page);
    const before = await listeners(cdp, 'window');
    const docBefore = await listeners(cdp, 'document');
    await page.evaluate(() => window.fixture.create());
    const after = await listeners(cdp, 'window');
    const docAfter = await listeners(cdp, 'document');
    const added = after
      .filter((t, i, all) => all.indexOf(t) === i)
      .flatMap((t) => {
        const n = after.filter((x) => x === t).length - before.filter((x) => x === t).length;
        return Array(Math.max(0, n)).fill(t) as string[];
      });
    expect(added.sort()).toEqual(['blur', 'keydown', 'keyup']);
    expect(docAfter).toEqual(docBefore);
    const idle = await frames(page, () => page.waitForTimeout(1500));
    expect(idle.longTasks).toBe(0);
  });

  test('hover stays at 60 fps on a 10k-node page', async ({ page }) => {
    await open(page, 1000);
    await page.evaluate(() => window.fixture.create());
    await page.keyboard.down('Alt');
    // Warm up: the first hover builds the overlay layer.
    for (let i = 0; i < 5; i++) await page.mouse.move(60 + i * 90, 60 + i * 40);
    const stats = await frames(page, async () => {
      for (let i = 0; i < 120; i++)
        await page.mouse.move(40 + ((i * 37) % 1300), 40 + ((i * 53) % 800));
    });
    await page.keyboard.up('Alt');
    console.log('hover', stats);
    expect(stats.longTasks).toBe(0);
    expect(stats.p95).toBeLessThan(20);
  });

  test('window select stays at 60 fps with 1,000 candidates', async ({ page }) => {
    await open(page, 100); // 100 rows × 10 nodes = 1,000 candidates
    await page.evaluate(() => window.fixture.create());
    await page.keyboard.down('Alt');
    await page.mouse.move(4, 4);
    await page.mouse.down();
    const stats = await frames(page, async () => {
      for (let i = 1; i <= 60; i++) await page.mouse.move(4 + i * 22, 4 + i * 14);
    });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    console.log('marquee', stats);
    expect(await page.evaluate(() => window.fixture.dci!.selection.get().length)).toBeGreaterThan(
      50,
    );
    expect(stats.longTasks).toBe(0);
    expect(stats.p95).toBeLessThan(20);
  });

  test('200 selected boxes follow scrolling at 60 fps', async ({ page }) => {
    await open(page, 1000);
    await page.evaluate(() => {
      const dci = window.fixture.create();
      dci.selection.set(Array.from({ length: 200 }, (_, i) => `r${i * 2}`));
    });
    await page.mouse.move(700, 450);
    const stats = await frames(page, async () => {
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(0, 60);
        await page.waitForTimeout(16);
      }
    });
    console.log('scroll', stats);
    expect(stats.longTasks).toBe(0);
    expect(stats.p95).toBeLessThan(20);
  });

  test('50 create/destroy cycles leave no listeners or DOM behind', async ({ page }) => {
    await open(page, 200);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const metrics = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics: m } = await cdp.send('Performance.getMetrics');
      const get = (name: string) => m.find((x) => x.name === name)!.value;
      return { nodes: get('Nodes'), listeners: get('JSEventListeners') };
    };
    // Warm up once (lazy custom element definition, stylesheet caches).
    await page.evaluate(() => {
      const dci = window.fixture.create();
      dci.selection.set(['r1']);
      dci.chat.open();
      dci.destroy();
    });
    const before = await metrics();
    await page.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        const dci = window.fixture.create();
        dci.selection.set([`r${i}`, `r${i + 1}c3`]);
        dci.chat.open();
        await new Promise((r) => requestAnimationFrame(r));
        dci.destroy();
      }
      window.fixture.dci = null;
    });
    const after = await metrics();
    console.log('memory', { before, after });
    expect(await page.locator('dci-root').count()).toBe(0);
    expect(after.listeners).toBeLessThanOrEqual(before.listeners);
    expect(after.nodes).toBeLessThanOrEqual(before.nodes + 50);
  });
});
