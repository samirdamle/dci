import type { DciEvent, DciRequest } from '@samirdamle/dci-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatController, type ChatControllerOptions } from '../src/chat/controller';
import { createChatUi, type ChatUiOptions } from '../src/chat/ui/chat-ui';
import { DEFAULT_STRINGS, type ChatStrings } from '../src/chat/ui/strings';
import { createInteractions } from '../src/interactions';
import { fakeTransport, reply, tick } from './chat-utils';
import { mountFixture } from './test-utils';

const FIXTURE = `
  <section id="page" data-dci='{"id":"page","type":"page","label":"Dashboard"}'>
    <div id="list" data-dci='{"id":"list","type":"table","label":"Invoices"}'>
      <div id="a" data-dci='{"id":"inv_1","type":"invoice","label":"Invoice 1"}'></div>
      <div id="b" data-dci='{"id":"inv_2","type":"invoice","label":"Invoice 2"}'></div>
      <div id="c" data-dci='{"id":"cust","type":"customer","label":"Acme"}'></div>
    </div>
  </section>
  <button id="outside">outside</button>`;

/** Rendering is batched per animation frame. */
const frame = () => new Promise((r) => setTimeout(r, 30));

let cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  document.documentElement.style.removeProperty('--dci-chat-inset');
});

function setup(
  ui: Partial<ChatUiOptions> = {},
  script: (r: DciRequest) => DciEvent[] = () => reply('Hello **world**'),
  ctrl: Partial<ChatControllerOptions> = {},
  gate?: Promise<void>,
) {
  const f = mountFixture(FIXTURE);
  const interactions = createInteractions({ root: f.root, overlay: false });
  const fake = fakeTransport(script, gate);
  const controller = createChatController({
    transport: fake.transport,
    selection: interactions.selection,
    contextOptions: { root: f.root },
    page: () => ({ url: 'https://x.test/', title: 'X' }),
    ...ctrl,
  });
  const chat = createChatUi({ controller, interactions, autoOpen: false, ...ui });
  cleanup.push(() => {
    chat.destroy();
    controller.destroy();
    interactions.destroy();
  });
  const shadow = document.querySelector('dci-root')!.shadowRoot!;
  const $ = <T extends Element = HTMLElement>(sel: string) => shadow.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...shadow.querySelectorAll<T>(sel)];
  return { f, interactions, controller, chat, requests: fake.requests, shadow, $, $$ };
}

async function select(s: ReturnType<typeof setup>, ...ids: string[]) {
  s.interactions.selection.set(ids.map((id) => s.f.get(`#${id}`)));
  await tick();
  await frame();
}

const text = (els: Element[]) => els.map((e) => e.textContent?.trim());

describe('chat shell', () => {
  it('stays hidden until opened, then focuses the input', async () => {
    const s = setup();
    expect(s.chat.element.hidden).toBe(true);
    s.f.get<HTMLButtonElement>('#outside').focus();
    s.controller.open();
    expect(s.chat.element.hidden).toBe(false);
    expect(s.chat.element.getAttribute('role')).toBe('dialog');
    expect(s.chat.element.getAttribute('aria-modal')).toBe('false');
    const title = s.shadow.getElementById(s.chat.element.getAttribute('aria-labelledby')!);
    expect(title?.textContent).toBe(DEFAULT_STRINGS.title);
    expect(s.shadow.activeElement?.tagName).toBe('TEXTAREA');
  });

  it('closes on Esc and returns focus to the page', async () => {
    const s = setup();
    const outside = s.f.get<HTMLButtonElement>('#outside');
    outside.focus();
    s.controller.open();
    s.$('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(s.controller.getState().open).toBe(false);
    expect(document.activeElement).toBe(outside);
    expect(s.chat.escape()).toBe(false);
  });

  it('auto-opens shortly after a selection (onSelect)', async () => {
    const s = setup({ autoOpen: 'onSelect' });
    const outside = s.f.get<HTMLButtonElement>('#outside');
    outside.focus();
    await select(s, 'a');
    expect(s.controller.getState().open).toBe(false);
    await new Promise((r) => setTimeout(r, 300));
    expect(s.controller.getState().open).toBe(true);
    // Focus stays on the page, so keyboard navigation keeps working.
    expect(document.activeElement).toBe(outside);
  });

  it('opens when a message is sent (onAction)', async () => {
    const s = setup({ autoOpen: 'onAction' });
    await select(s, 'a');
    await new Promise((r) => setTimeout(r, 300));
    expect(s.controller.getState().open).toBe(false);
    await s.controller.send('hi');
    expect(s.controller.getState().open).toBe(true);
  });

  it('switches to a docked panel at runtime and back', async () => {
    const s = setup({ pushContent: true, panelWidth: 400 });
    s.chat.setMode('panel');
    expect(s.chat.element.getAttribute('role')).toBe('complementary');
    expect(s.$('.tab')!.hidden).toBe(false);
    s.$('.tab')!.click();
    expect(s.controller.getState().open).toBe(true);
    expect(s.$('.tab')!.hidden).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--dci-chat-inset')).toBe('400px');
    s.$('.resize')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    expect(document.documentElement.style.getPropertyValue('--dci-chat-inset')).toBe('420px');
    s.chat.setMode('popover');
    expect(s.chat.element.getAttribute('role')).toBe('dialog');
    expect(document.documentElement.style.getPropertyValue('--dci-chat-inset')).toBe('');
  });

  it('headless: the controller works with no shell rendered', async () => {
    const f = mountFixture(FIXTURE);
    const interactions = createInteractions({ root: f.root, overlay: false });
    const fake = fakeTransport(() => reply('ok'));
    const controller = createChatController({
      transport: fake.transport,
      selection: interactions.selection,
    });
    cleanup.push(() => (controller.destroy(), interactions.destroy()));
    expect(await controller.send('hi')).toBe(true);
    expect(controller.getState().messages[1]?.text).toBe('ok');
    // Only the announcer's live region lives in the shadow root: no chat shell.
    expect(
      document.querySelector('dci-root')?.shadowRoot?.querySelector('.chat') ?? null,
    ).toBeNull();
  });
});

describe('chips and breadcrumb', () => {
  it('shows a chip per pending node; × deselects it', async () => {
    const s = setup();
    await select(s, 'a', 'c');
    expect(text(s.$$('.chip .name'))).toEqual(['Invoice 1', 'Acme']);
    expect(text(s.$$('.chip small'))).toEqual(['#inv_1', '#cust']);
    s.$$<HTMLButtonElement>('.chip .x')[0]!.click();
    await tick();
    await frame();
    expect(s.interactions.selection.get()).toEqual([s.f.get('#c')]);
    expect(text(s.$$('.chip .name'))).toEqual(['Acme']);
  });

  it('collapses extra chips behind "+N more"', async () => {
    const s = setup({ maxChips: 1 });
    await select(s, 'a', 'b', 'c');
    expect(s.$$('.chip')).toHaveLength(1);
    const more = s.$<HTMLButtonElement>('.more')!;
    expect(more.textContent).toBe('+2 more');
    more.click();
    expect(s.$$('.chip')).toHaveLength(3);
    expect(s.$('.more')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('flashes and reveals a chip’s element', async () => {
    const s = setup();
    const flashes: Element[] = [];
    s.interactions.bus.on('flash', (el) => flashes.push(el));
    await select(s, 'a');
    const a = s.f.get('#a');
    a.scrollIntoView = vi.fn();
    const chip = s.$<HTMLButtonElement>('.chip button')!;
    chip.dispatchEvent(new MouseEvent('mouseenter'));
    chip.click();
    expect(flashes).toEqual([a, a]);
    expect(a.scrollIntoView).toHaveBeenCalled();
  });

  it('renders the path to the primary node; a segment selects that ancestor', async () => {
    const s = setup();
    await select(s, 'a');
    expect(text(s.$$('.crumbs button'))).toEqual(['Dashboard', 'Invoices', 'Invoice 1']);
    expect(s.$('.crumbs [aria-current]')?.textContent).toBe('Invoice 1');
    s.$$<HTMLButtonElement>('.crumbs button')[1]!.click();
    await tick();
    expect(s.interactions.selection.get()).toEqual([s.f.get('#list')]);
  });

  it('shows the selection-limit notice', async () => {
    const f = mountFixture(FIXTURE);
    const interactions = createInteractions({ root: f.root, overlay: false, maxSelection: 1 });
    const controller = createChatController({
      transport: fakeTransport(() => reply('')).transport,
      selection: interactions.selection,
    });
    const chat = createChatUi({ controller, interactions, autoOpen: false });
    cleanup.push(() => (chat.destroy(), controller.destroy(), interactions.destroy()));
    interactions.selection.set([f.get('#a'), f.get('#b')]);
    await tick();
    await frame();
    const shadow = document.querySelector('dci-root')!.shadowRoot!;
    expect(shadow.querySelector('.limit')?.textContent).toBe(
      'Showing 1 of 2. Selection limit reached.',
    );
  });
});

describe('suggested actions', () => {
  const actions = {
    invoice: [
      { id: 'explain', label: 'Explain' },
      { id: 'remind', label: 'Draft reminder', prompt: 'Draft a payment reminder' },
    ],
    '*': [
      { id: 'summarize', label: 'Summarize' },
      { id: 'compare', label: 'Compare' },
    ],
  };

  it('offers the selection’s actions and sends the action id', async () => {
    const s = setup({ actions });
    await select(s, 'a');
    expect(text(s.$$('.actions > button'))).toEqual([
      'Explain',
      'Draft reminder',
      'Summarize',
      'Compare',
    ]);
    s.$$<HTMLButtonElement>('.actions > button')[1]!.click();
    await tick();
    expect(s.requests[0]).toMatchObject({ prompt: 'Draft a payment reminder', action: 'remind' });
  });

  it('moves extra actions to an overflow menu; arrows move focus', async () => {
    const s = setup({ actions, maxActions: 2 });
    await select(s, 'a');
    const bar = s.$('.actions')!;
    const visible = s.$$<HTMLButtonElement>('.actions > button');
    expect(text(visible)).toEqual(['Explain', 'Draft reminder', '⋯']);
    expect(s.$('.menu')!.hidden).toBe(true);
    visible[0]!.focus();
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(s.shadow.activeElement).toBe(visible[1]);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(s.shadow.activeElement).toBe(visible[0]);
    visible[2]!.click();
    expect(s.$('.menu')!.hidden).toBe(false);
    expect(text(s.$$('.menu button'))).toEqual(['Summarize', 'Compare']);
  });
});

describe('messages', () => {
  async function sendAndRender(s: ReturnType<typeof setup>, prompt = 'hi') {
    s.controller.open();
    await s.controller.send(prompt);
    await frame();
  }

  it('renders the exchange with markdown', async () => {
    const s = setup();
    await select(s, 'a');
    await sendAndRender(s);
    const [user, assistant] = s.$$('.msg');
    expect(user!.querySelector('.body')?.textContent).toBe('hi');
    expect(user!.querySelector('.meta')?.textContent).toBe('1 item');
    expect(assistant!.querySelector('strong')?.textContent).toBe('world');
    expect(assistant!.hasAttribute('aria-busy')).toBe(false);
    expect(s.$('.log')!.getAttribute('aria-busy')).toBe('false');
    expect(s.$('.chip')).toBeNull();
  });

  it('sends with Enter and keeps Shift+Enter for new lines', async () => {
    const s = setup();
    s.controller.open();
    const ta = s.$<HTMLTextAreaElement>('textarea')!;
    ta.value = 'hello';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    expect(s.requests).toHaveLength(0);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    await frame();
    expect(s.requests[0]?.prompt).toBe('hello');
    expect(s.$<HTMLTextAreaElement>('textarea')!.value).toBe('');
  });

  it('shows running tools, then collapses them into a summary', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const s = setup(
      {},
      () => [
        { type: 'tool-start', id: 't1', name: 'lookup', label: 'Looking up invoice' },
        { type: 'tool-end', id: 't1', ok: true },
        { type: 'tool-start', id: 't2', name: 'update' },
        { type: 'tool-end', id: 't2', ok: false },
        { type: 'text-delta', text: 'Done' },
        { type: 'done' },
      ],
      {},
      gate,
    );
    s.controller.open();
    const sent = s.controller.send('go');
    await tick();
    await frame();
    const row = s.$('.tool')!;
    expect(row.textContent).toContain('Looking up invoice');
    expect(row.getAttribute('aria-busy')).toBe('true');
    expect(s.$('.log')!.getAttribute('aria-busy')).toBe('true');
    open();
    await sent;
    await frame();
    expect(s.$('details.tools summary')?.textContent).toBe('2 steps');
    expect(s.$$('.tool').map((t) => t.getAttribute('data-state'))).toEqual(['ok', 'failed']);
  });

  it('shows Stop while streaming and marks the reply stopped', async () => {
    const gate = new Promise<void>(() => {});
    const s = setup({}, () => reply('Hello there'), {}, gate);
    s.controller.open();
    const sent = s.controller.send('go');
    await tick();
    await frame();
    const stop = s.$<HTMLButtonElement>('.send.stop')!;
    expect(stop.textContent).toBe('Stop');
    stop.click();
    await sent;
    await frame();
    expect(s.$('.stopped')?.textContent).toBe(DEFAULT_STRINGS.stopped);
    expect(s.$('.send')!.textContent).toBe('Send');
  });

  it('shows an error card whose Retry resends', async () => {
    let calls = 0;
    const s = setup({}, () =>
      calls++ === 0 ? [{ type: 'error', message: 'Backend down' }] : reply('Recovered'),
    );
    await sendAndRender(s);
    const card = s.$('.error')!;
    expect(card.getAttribute('role')).toBe('alert');
    expect(card.textContent).toContain('Backend down');
    s.$<HTMLButtonElement>('.error button')!.click();
    await tick();
    await tick();
    await frame();
    expect(s.requests).toHaveLength(2);
    expect(s.$('.error')).toBeNull();
    expect(s.$$('.msg')[1]?.textContent).toContain('Recovered');
  });

  it('keeps the scroll pinned unless the user scrolled up', async () => {
    const s = setup();
    const log = s.$('.log')!;
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => 1000 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 100 });
    await sendAndRender(s, 'one');
    expect(log.scrollTop).toBe(1000);
    log.scrollTop = 0;
    log.dispatchEvent(new Event('scroll'));
    await sendAndRender(s, 'two');
    const btn = s.$<HTMLButtonElement>('.new')!;
    expect(btn.hidden).toBe(false);
    btn.click();
    expect(btn.hidden).toBe(true);
    expect(log.scrollTop).toBe(1000);
  });

  it('uses a custom message renderer', async () => {
    const s = setup({
      render: {
        message: (m) => {
          const el = document.createElement('div');
          el.className = 'custom';
          el.textContent = `${m.role}: ${m.text}`;
          return el;
        },
      },
    });
    await sendAndRender(s, 'yo');
    expect(text(s.$$('.custom'))).toEqual(['user: yo', 'assistant: Hello **world**']);
    expect(s.$('.msg')).toBeNull();
  });

  it('asks before sending when confirmBeforeSend is on', async () => {
    const s = setup({}, () => reply('ok'), { confirmBeforeSend: true });
    s.controller.open();
    const sent = s.controller.send('go');
    await tick();
    await frame();
    expect(s.$('[role="alertdialog"]')?.textContent).toContain(DEFAULT_STRINGS.confirmSend);
    s.$<HTMLButtonElement>('.confirm .primary')!.click();
    await sent;
    await frame();
    expect(s.requests).toHaveLength(1);
    expect(s.$('.confirm')!.childElementCount).toBe(0);
  });
});

describe('strings', () => {
  it('every string can be overridden', async () => {
    const overrides: { [K in keyof ChatStrings]-?: ChatStrings[K] } = {
      ...DEFAULT_STRINGS,
      title: 'Fragen',
      send: 'Senden',
      placeholder: 'Frag etwas…',
    };
    const s = setup({ strings: overrides });
    s.controller.open();
    expect(s.$('h2')?.textContent).toBe('Fragen');
    expect(s.$('.send')?.textContent).toBe('Senden');
    expect(s.$('textarea')?.getAttribute('placeholder')).toBe('Frag etwas…');
  });
});
