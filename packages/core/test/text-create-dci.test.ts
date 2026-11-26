import { afterEach, describe, expect, it } from 'vitest';
import { createDci, type DciInstance } from '../src/dci/create-dci';
import { fakeTransport, reply, tick } from './chat-utils';
import { mountFixture } from './test-utils';

const FIXTURE = `
  <section id="page" data-dci='{"id":"page","type":"page","label":"Dashboard"}'>
    <p id="note">Q3 focus: convert Proposal-stage deals before winter.</p>
  </section>`;

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let dci: DciInstance | undefined;
afterEach(() => {
  dci?.destroy();
  dci = undefined;
  window.getSelection()?.removeAllRanges();
});

/** Select `text` inside #note with the native selection, stubbing layout. */
function selectText(text: string): Range {
  const p = document.querySelector<HTMLElement>('#note')!;
  const full = p.textContent ?? '';
  const start = full.indexOf(text);
  const range = document.createRange();
  range.setStart(p.firstChild as Text, start);
  range.setEnd(p.firstChild as Text, start + text.length);
  const rect = {
    left: 100,
    top: 100,
    right: 300,
    bottom: 130,
    width: 200,
    height: 30,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  } as DOMRect;
  range.getBoundingClientRect = () => rect;
  range.getClientRects = () => [rect] as unknown as DOMRectList;
  // `liveTextItem` clones the range; a real clone keeps layout, but in
  // happy-dom the clone loses the stubbed rect, so keep the same range.
  range.cloneRange = () => range;
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return range;
}

function pillButton() {
  return (
    document
      .querySelector('dci-root')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('.text-pill') ?? null
  );
}

describe('createDci text selection', () => {
  it('get/capture/items/remove work through dci.textSelection', async () => {
    const f = mountFixture(FIXTURE);
    const fake = fakeTransport(() => reply('ok'));
    dci = createDci({ transport: fake.transport, root: f.root, chat: { autoOpen: false } });
    expect(dci.textSelection.get()).toBeNull();
    expect(dci.textSelection.capture()).toBe(false);

    selectText('convert Proposal-stage');
    const node = dci.textSelection.get();
    expect(node?.source).toBe('text');
    expect(node?.text?.excerpt).toBe('convert Proposal-stage');
    expect(dci.textSelection.capture()).toBe(true);
    expect(dci.textSelection.items()).toHaveLength(1);
    expect(dci.textSelection.items()[0]!.marker).toBe('A');
    // Capturing the identical range twice is a no-op.
    expect(dci.textSelection.capture()).toBe(false);
    expect(dci.textSelection.items()).toHaveLength(1);
    await tick();
    expect(dci.chat.state().pendingContext.map((n) => n.source)).toEqual(['text']);

    dci.textSelection.remove(dci.textSelection.items()[0]!);
    expect(dci.textSelection.items()).toEqual([]);
    await tick();
    expect(dci.chat.state().pendingContext).toEqual([]);
  });

  it('drag → pill → tap opens the chat with a text chip', async () => {
    const f = mountFixture(FIXTURE);
    const fake = fakeTransport(() => reply('ok'));
    dci = createDci({ transport: fake.transport, root: f.root, chat: { autoOpen: false } });
    selectText('convert Proposal-stage');
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await frame();
    await sleep(10);
    const btn = pillButton();
    expect(btn?.getAttribute('data-visible')).toBe('true');
    expect(btn?.textContent).toBe('Ask about this');
    btn!.click();
    await tick();
    await frame();
    expect(dci.chat.state().open).toBe(true);
    expect(dci.textSelection.items()).toHaveLength(1);
    const shadow = document.querySelector('dci-root')!.shadowRoot!;
    expect(shadow.querySelector('.chip small')?.textContent).toBe('text');
    expect(shadow.querySelector('.chip .name')?.textContent).toBe('convert Proposal-stage');
  });

  it('textSelection: false disables the pill and capture', async () => {
    const f = mountFixture(FIXTURE);
    const fake = fakeTransport(() => reply('ok'));
    dci = createDci({
      transport: fake.transport,
      root: f.root,
      textSelection: false,
      chat: { autoOpen: false },
    });
    selectText('convert Proposal-stage');
    expect(dci.textSelection.get()).toBeNull();
    expect(dci.textSelection.capture()).toBe(false);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await frame();
    expect(pillButton()?.getAttribute('data-visible')).not.toBe('true');
  });

  it('update() toggles the pill back on', async () => {
    const f = mountFixture(FIXTURE);
    const fake = fakeTransport(() => reply('ok'));
    dci = createDci({
      transport: fake.transport,
      root: f.root,
      textSelection: false,
      chat: { autoOpen: false },
    });
    selectText('convert Proposal-stage');
    expect(dci.textSelection.capture()).toBe(false);
    dci.update({ textSelection: true });
    expect(dci.textSelection.capture()).toBe(true);
    expect(dci.textSelection.items()).toHaveLength(1);
  });

  it('a private range is refused with no pill and no capture', async () => {
    const f = mountFixture(
      `<p id="secret" data-dci='{"id":"s","private":true}'>do not quote this sentence.</p>
       <p id="note">Q3 focus: convert Proposal-stage deals before winter.</p>`,
    );
    const fake = fakeTransport(() => reply('ok'));
    dci = createDci({ transport: fake.transport, root: f.root, chat: { autoOpen: false } });
    const p = f.get('#secret');
    const range = document.createRange();
    range.setStart(p.firstChild as Text, 0);
    range.setEnd(p.firstChild as Text, 10);
    window.getSelection()!.addRange(range);
    expect(dci.textSelection.get()).toBeNull();
    expect(dci.textSelection.capture()).toBe(false);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await frame();
    expect(pillButton()?.getAttribute('data-visible')).not.toBe('true');
  });
});
