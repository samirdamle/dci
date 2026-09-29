import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type Page } from '@playwright/test';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';
import { RecordTable } from '../pages/crm';

/**
 * Records the README's demo GIF (`pnpm docs:gif` → docs/assets/demo.gif):
 * hold Alt, climb from a cell to its deal with the wheel, click, ask, and
 * watch the answer stream. Headless screenshots have no cursor, so the page
 * gets a drawn pointer and an "Alt" badge.
 */

const { applyPalette, GIFEncoder, quantize } = gifenc; // CommonJS: no named ESM exports

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../docs/assets/demo.gif');
const SIZE = { width: 1280, height: 720 };

/** A visible pointer and a badge showing when Alt is held. */
function decorate() {
  addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div');
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 11-7 1.4L9 21z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
    cursor.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)';
    const badge = document.createElement('div');
    badge.textContent = 'Alt held';
    badge.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:2147483647;pointer-events:none;display:none;' +
      'padding:6px 12px;border-radius:8px;background:#111;color:#fff;font:600 14px system-ui';
    document.body.append(cursor, badge);
    addEventListener(
      'mousemove',
      (e) => (cursor.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`),
      true,
    );
    addEventListener('keydown', (e) => e.key === 'Alt' && (badge.style.display = 'block'), true);
    addEventListener('keyup', (e) => e.key === 'Alt' && (badge.style.display = 'none'), true);
  });
}

/** Screenshot continuously until stopped; returns frames with their durations. */
function startCapture(page: Page) {
  const frames: Array<{ png: Buffer; at: number }> = [];
  let running = true;
  const loop = (async () => {
    while (running) {
      frames.push({ png: await page.screenshot(), at: Date.now() });
      await page.waitForTimeout(60);
    }
  })();
  return async () => {
    running = false;
    await loop;
    frames.push({ png: await page.screenshot(), at: Date.now() + 2500 }); // hold the end
    return frames;
  };
}

function encode(frames: Array<{ png: Buffer; at: number }>) {
  const gif = GIFEncoder();
  let previous: Buffer | null = null;
  let pending: { index: Uint8Array; palette: number[][]; start: number } | null = null;
  const flush = (end: number) => {
    if (!pending) return;
    const delay = Math.max(40, end - pending.start);
    gif.writeFrame(pending.index, SIZE.width, SIZE.height, { palette: pending.palette, delay });
  };
  for (const { png, at } of frames) {
    const { data } = PNG.sync.read(png);
    if (previous?.equals(data)) continue; // unchanged: the last frame just lasts longer
    flush(at);
    previous = data;
    const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const palette = quantize(rgba, 256);
    pending = { index: applyPalette(rgba, palette), palette, start: at };
  }
  flush(frames.at(-1)!.at);
  gif.finish();
  return gif.bytes();
}

test('record the README demo GIF', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(SIZE);
  await page.addInitScript(decorate);
  await page.goto('/?modifier=Alt#/sales/opportunities');
  await page.waitForSelector('dci-root', { state: 'attached' });
  await page.getByRole('button', { name: 'Dismiss hint' }).click();
  const opps = new RecordTable(page, 'Opportunities');
  // The first open deal (the mock's advice fits deals still in progress).
  const open = opps.rows.filter({ hasNot: page.getByText(/^Closed/) }).first();
  const cell = opps.cell(open, 2);
  await open.evaluate((row) => row.scrollIntoView({ block: 'center' }));
  const box = (await cell.boundingBox())!;
  await page.mouse.move(900, 140);

  const stop = startCapture(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 });
  await page.keyboard.down('Alt');
  // Hover tracking starts with the first pointer move after Alt goes down.
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
  await page.waitForTimeout(900); // hover preview on the cell
  await page.mouse.wheel(0, -40); // climb to the deal
  await page.waitForTimeout(900);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const chat = page.locator('dci-root .chat');
  await chat.waitFor();
  await page.waitForTimeout(800);
  await chat.locator('textarea').pressSequentially('What should I do next on this deal?', {
    delay: 35,
  });
  await page.keyboard.press('Enter');
  await chat.locator('.msg.assistant').waitFor();
  await chat.locator('button.send', { hasText: 'Send' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  const frames = await stop();

  mkdirSync(dirname(OUT), { recursive: true });
  const bytes = encode(frames);
  // Optional: keyframes for reviewing the recording (DEMO_FRAMES=<dir>).
  const dump = process.env.DEMO_FRAMES;
  if (dump) {
    mkdirSync(dump, { recursive: true });
    for (const i of [0.25, 0.45, 0.7, 1].map((f) =>
      Math.min(frames.length - 1, Math.floor(frames.length * f)),
    ))
      writeFileSync(join(dump, `frame-${i}.png`), frames[i]!.png);
  }
  writeFileSync(OUT, bytes);
  console.log(`Wrote ${OUT}: ${frames.length} frames, ${(bytes.length / 1024).toFixed(0)} KB`);
});
