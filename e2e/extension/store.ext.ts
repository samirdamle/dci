import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
// From source: the repo root doesn't depend on the server package.
import { dciHandler } from '../../packages/server/src/index';
import { expect, openPage, test } from './fixtures';

/**
 * Store listing screenshots (1280×800), not a regular test:
 *   pnpm extension:screenshots
 * Answers come from a scripted DCI endpoint, so the pictures show what a
 * real backend's answers look like without calling a model.
 */
test.skip(!process.env.PW_STORE, 'Set PW_STORE=1 to take the store screenshots.');
test.use({ viewport: { width: 1280, height: 800 } });

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../apps/extension/store/screenshots');

const ORDERS: Array<[string, string, string, string, string, string]> = [
  ['#4824', 'Katherine Johnson', 'Headlamp, batteries', '$58.50', 'Late', 'Sep 23'],
  ['#4822', 'Grace Hopper', 'Down sleeping bag', '$219.00', 'Late', 'Sep 24'],
  ['#4827', 'Barbara Liskov', 'Rain shell (M)', '$179.00', 'Late', 'Sep 25'],
  ['#4821', 'Ada Lovelace', '2-person tent, stakes', '$349.00', 'Shipped', 'Sep 26'],
  ['#4825', 'Margaret Hamilton', 'Ultralight backpack', '$289.00', 'Shipped', 'Sep 27'],
  ['#4828', 'Donald Knuth', 'Water filter', '$44.95', 'Shipped', 'Sep 28'],
  ['#4823', 'Alan Turing', 'Trail runners (44)', '$139.00', 'Processing', 'Oct 2'],
  ['#4826', 'Edsger Dijkstra', 'Camp stove, fuel', '$96.00', 'Processing', 'Oct 3'],
];

/** An ordinary admin page: no DCI annotations anywhere. */
const PAGE = `
<title>Orders · Northwind Outfitters</title>
<style>
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
  header { display: flex; align-items: center; gap: 12px; padding: 14px 32px; background: #fff; border-bottom: 1px solid #e2e8f0; }
  header b { font-size: 16px; } header nav { display: flex; gap: 20px; margin-left: 32px; color: #64748b; }
  header nav a { color: inherit; text-decoration: none; } header nav a.on { color: #0f172a; font-weight: 600; }
  main { padding: 28px 32px; max-width: 820px; }
  h1 { font-size: 22px; margin: 0 0 4px; } p.sub { margin: 0 0 20px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 11px 16px; border-bottom: 1px solid #f1f5f9; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; background: #f8fafc; }
  td.status span { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .Shipped { background: #dcfce7; color: #166534; } .Late { background: #fee2e2; color: #991b1b; }
  .Processing { background: #e0e7ff; color: #3730a3; }
</style>
<header><b>Northwind Outfitters</b><nav><a>Dashboard</a><a class="on">Orders</a><a>Products</a><a>Customers</a></nav></header>
<main>
  <h1>Orders</h1>
  <p class="sub">Last 7 days · 8 orders · by ship date</p>
  <table>
    <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Ship by</th></tr></thead>
    <tbody>
      ${ORDERS.map(
        (o) =>
          `<tr>${o.map((v, i) => (i === 4 ? `<td class="status"><span class="${v}">${v}</span></td>` : `<td>${v}</td>`)).join('')}</tr>`,
      ).join('\n')}
    </tbody>
  </table>
</main>`;

/** Scripted answers, keyed by the question. */
const ANSWERS: Record<string, string> = {
  late: `Three of these orders are **past their ship-by date**:

- **#4824** (Katherine Johnson): headlamp and batteries, 7 days late
- **#4822** (Grace Hopper): down sleeping bag, 6 days late
- **#4827** (Barbara Liskov): rain shell, 5 days late

A short note for each customer: apologize, give the new ship date, and offer free express shipping. Want me to draft them?`,
  summary: `**8 orders, $1,374.45 in total.**

- **Shipped:** 3 orders, $682.95
- **Processing:** 2 orders, $235.00
- **Late:** 3 orders, $456.50 (#4824, #4822, #4827)

The late orders are all soft goods from the same warehouse, which points to one delayed shipment rather than three separate problems.`,
};

let server: Server;
let endpoint = '';

test.beforeAll(async () => {
  const handle = dciHandler(async (req, stream) => {
    const answer = /late/i.test(req.prompt) ? ANSWERS.late! : ANSWERS.summary!;
    for (const word of answer.split(/(?<= )/)) stream.text(word);
  });
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const response = await handle(
      new Request(`http://127.0.0.1${req.url}`, {
        method: req.method ?? 'GET',
        headers: req.headers as Record<string, string>,
        ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    for await (const chunk of response.body!) res.write(chunk);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/dci`;
});

test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const chat = (page: Page) => page.locator('dci-root .chat');

async function ask(page: Page, question: string) {
  await chat(page).locator('textarea').fill(question);
  await page.keyboard.press('Enter');
  await expect(chat(page).locator('.msg.assistant')).not.toHaveAttribute('aria-busy', 'true');
  await page.mouse.move(1270, 790); // No hover outline in the picture.
  await page.waitForTimeout(300);
}

test('store screenshots', async ({ page, extension }) => {
  // 1. Point at three rows, ask about them (popover).
  await extension.store({ settings: { backend: 'endpoint', endpointUrl: endpoint } });
  await openPage(page, PAGE);
  await extension.toggle(page);
  await page.getByText('Katherine Johnson').click({ modifiers: ['Alt'] });
  await page.getByText('Grace Hopper').click({ modifiers: ['Alt', 'Shift'] });
  await page.getByText('Barbara Liskov').click({ modifiers: ['Alt', 'Shift'] });
  await expect(chat(page).locator('.chip')).toHaveCount(3);
  await ask(page, 'Which of these are late, and what should I tell the customers?');
  await page.screenshot({ path: join(OUT, '1-point-and-ask.png') });

  // 2. Alt+Double-click selects every row; the chat docks as a side panel.
  await extension.store({
    settings: { backend: 'endpoint', endpointUrl: endpoint, chatMode: 'panel' },
  });
  await openPage(page, PAGE, '/panel');
  await extension.toggle(page);
  await page.getByText('Donald Knuth').dblclick({ modifiers: ['Alt'] });
  // Six chips, then "+2 more".
  await expect(chat(page).locator('.chip')).toHaveCount(6);
  await expect(chat(page).locator('.more')).toBeVisible();
  await ask(page, 'Summarize these orders by status.');
  await page.screenshot({ path: join(OUT, '2-whole-table.png') });

  // 3. The options page: choose where answers come from.
  await extension.store({ settings: { backend: 'claude' } });
  const options = await extension.openPage('options.html');
  await options.setViewportSize({ width: 1280, height: 800 });
  await options.screenshot({ path: join(OUT, '3-options.png') });
  await options.close();
});
