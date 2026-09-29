import type { DciRequest } from '@dci/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dciAttr, stableStringify } from '../src/dci/attr';
import { DEFAULTS, mergeConfig, validateConfig } from '../src/dci/config';
import { createDci, type DciInstance } from '../src/dci/create-dci';
import { readDci } from '../src/parse';
import { fakeTransport, reply, tick } from './chat-utils';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

const FIXTURE = `
  <section id="page" data-dci='{"id":"page","type":"page","label":"Dashboard"}'>
    <div id="a" data-dci='{"id":"inv_1","type":"invoice","label":"Invoice 1"}'>A</div>
    <div id="b" data-dci='{"id":"inv_2","type":"invoice","label":"Invoice 2"}'>B</div>
  </section>`;

const instances: DciInstance[] = [];
afterEach(() => {
  instances.splice(0).forEach((d) => d.destroy());
  vi.restoreAllMocks();
});

function setup(config: Parameters<typeof createDci>[0] = {}, script = () => reply('Hi')) {
  const f = mountFixture(FIXTURE);
  const fake = fakeTransport(script);
  const dci = createDci({ transport: fake.transport, root: f.root, ...config });
  instances.push(dci);
  return { f, dci, requests: fake.requests };
}

/** Hold `key`, click `el` with it, release. */
function modClick(el: Element, key: 'Alt' | 'Control' = 'Alt') {
  const mods = key === 'Alt' ? { altKey: true } : { ctrlKey: true };
  fakeKey(key, mods);
  fakePointer(el, mods);
  fakeKey(key, { type: 'keyup' });
}

const shadow = () => document.querySelector('dci-root')?.shadowRoot ?? null;

describe('config', () => {
  it('merges defaults: objects deep, everything else replaces', () => {
    const merged = mergeConfig(DEFAULTS as object, {
      chat: { mode: 'panel' },
      overlay: false,
      gestures: [],
    }) as typeof DEFAULTS & { gestures: unknown[] };
    expect(merged.chat.mode).toBe('panel');
    expect(merged.chat.autoOpen).toBe('onSelect');
    expect(merged.overlay).toBe(false);
    expect(merged.gestures).toEqual([]);
  });

  it('exposes the resolved config', () => {
    const { dci } = setup();
    expect(dci.config.modifier).toBe('Alt');
    expect(dci.config.chat?.mode).toBe('popover');
    expect(dci.config.maxSelection).toBe(50);
  });

  it('explains invalid values', () => {
    const { errors, warnings } = validateConfig({
      modifier: 'Ctrl' as 'Control',
      maxSelection: 0,
      chat: { mode: 'sidebar' as 'panel', modee: 1 } as never,
      modifer: 'Alt',
    } as never);
    expect(errors).toEqual([
      '`endpoint` or `transport` is required, e.g. `createDci({ endpoint: "/api/dci" })`.',
      '`modifier` must be one of "Alt", "Shift", "Control", "Meta" (got "Ctrl").',
      '`maxSelection` must be an integer ≥ 1 (got 0).',
      '`chat.mode` must be one of "popover", "panel" (got "sidebar").',
    ]);
    expect(warnings).toEqual([
      'Unknown option `modifer`. Did you mean `modifier`?',
      'Unknown option `chat.modee`. Did you mean `chat.mode`?',
    ]);
  });

  it('throws on errors and warns on unknown keys (development)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => createDci({})).toThrow('`endpoint` or `transport` is required');
    const { dci } = setup({ themee: 'dark' } as never);
    expect(dci).toBeTruthy();
    expect(warn).toHaveBeenCalledWith('[dci] Unknown option `themee`. Did you mean `theme`?');
  });

  it('throws a clear error without a browser', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(() => createDci({ endpoint: '/x' })).toThrow('needs a browser');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('selection', () => {
  it('selects by element or id and emits payloads', async () => {
    const { f, dci } = setup();
    const changes: string[][] = [];
    dci.on('selectionchange', (e) => changes.push(e.nodes.map((n) => n.id ?? '')));
    dci.selection.set(['inv_1', f.get('#b')]);
    expect(dci.selection.elements()).toEqual([f.get('#a'), f.get('#b')]);
    expect(dci.selection.get().map((n) => n.id)).toEqual(['inv_1', 'inv_2']);
    expect(dci.selection.has('inv_2')).toBe(true);
    dci.selection.remove('inv_1');
    await tick();
    expect(changes).toEqual([['inv_2']]);
    dci.selection.clear();
    expect(dci.selection.get()).toEqual([]);
  });

  it('selects same-type siblings without a gesture', () => {
    const { dci } = setup();
    dci.selection.set('inv_1');
    expect(dci.selection.selectSameType().map((el) => el.id)).toEqual(['a', 'b']);
  });

  it('wires gestures: Alt+Click selects', () => {
    const { f, dci } = setup();
    modClick(f.get('#a'));
    expect(dci.selection.elements()).toEqual([f.get('#a')]);
  });
});

describe('chat and actions', () => {
  it('sends the selection, emits messages and runs client actions', async () => {
    const script = (): ReturnType<typeof reply> => [
      { type: 'client-action', name: 'markPaid', args: { id: 'inv_1' } },
      ...reply('Done'),
    ];
    const { dci, requests } = setup({ chat: { ui: false } }, script);
    const paid = vi.fn();
    const off = dci.onAction('markPaid', paid);
    const messages: string[] = [];
    dci.on('message', (m) => messages.push(`${m.role}:${m.text}`));
    dci.selection.set('inv_1');
    await tick();
    expect(await dci.chat.send('Pay it', { action: 'pay' })).toBe(true);
    expect(requests[0]).toMatchObject({ prompt: 'Pay it', action: 'pay' });
    expect(requests[0]!.context.map((n) => n.id)).toEqual(['inv_1']);
    expect(paid).toHaveBeenCalledWith({ id: 'inv_1' }, expect.anything());
    expect(messages).toEqual(['user:Pay it', 'assistant:Done']);
    off();
    await dci.chat.send('again');
    expect(paid).toHaveBeenCalledTimes(1);
  });

  it('applies beforeSend and previews the request', async () => {
    const { dci } = setup({
      beforeSend: (r: DciRequest) => ({ ...r, prompt: `${r.prompt}!` }),
    });
    expect(await dci.previewRequest('hey')).toMatchObject({ prompt: 'hey!' });
  });

  it('emits chatopen/chatclose and sessionchange', () => {
    const { dci } = setup();
    const seen: string[] = [];
    dci.on('chatopen', () => seen.push('open'));
    dci.on('chatclose', () => seen.push('close'));
    dci.on('sessionchange', () => seen.push('session'));
    dci.chat.open();
    dci.chat.close();
    dci.session.reset();
    expect(seen).toEqual(['open', 'close', 'session']);
  });

  it('headless (`chat.ui: false`) renders no chat but the controller works', async () => {
    const { dci } = setup({ chat: { ui: false } });
    expect(shadow()?.querySelector('.chat') ?? null).toBeNull();
    await dci.chat.send('hi');
    expect(dci.chat.state().messages).toHaveLength(2);
  });
});

describe('update', () => {
  it('switches chat mode in place', () => {
    const { dci } = setup();
    const el = shadow()!.querySelector('.chat')!;
    dci.update({ chat: { mode: 'panel' } });
    expect(shadow()!.querySelector('.chat')).toBe(el);
    expect(el.getAttribute('role')).toBe('complementary');
  });

  it('changes the modifier and keeps the selection', () => {
    const { f, dci } = setup();
    dci.selection.set('inv_2');
    dci.update({ modifier: 'Control' });
    expect(dci.selection.get().map((n) => n.id)).toEqual(['inv_2']);
    modClick(f.get('#a'), 'Alt');
    expect(dci.selection.get().map((n) => n.id)).toEqual(['inv_2']);
    modClick(f.get('#a'), 'Control');
    expect(dci.selection.get().map((n) => n.id)).toEqual(['inv_1']);
  });

  it('changes the theme', () => {
    const { dci } = setup({ theme: 'light' });
    expect(document.querySelector('dci-root')?.getAttribute('data-theme')).toBe('light');
    dci.update({ theme: 'dark' });
    expect(document.querySelector('dci-root')?.getAttribute('data-theme')).toBe('dark');
  });

  it('keeps chat history for live chat options and swaps the transport', async () => {
    const { dci, requests } = setup();
    await dci.chat.send('one');
    const other = fakeTransport(() => reply('Other'));
    dci.update({ transport: other.transport, chat: { concurrency: 'queue' } });
    await dci.chat.send('two');
    expect(requests).toHaveLength(1);
    expect(other.requests).toHaveLength(1);
    expect(dci.chat.state().messages).toHaveLength(4);
  });

  it('rebuilds selection options and carries the selection over', () => {
    const { dci } = setup();
    dci.selection.set(['inv_1', 'inv_2']);
    dci.update({ maxSelection: 1 });
    expect(dci.selection.get().map((n) => n.id)).toEqual(['inv_1']);
  });
});

describe('lifecycle', () => {
  it('disable detaches gestures and the chat; enable restores them', () => {
    const { f, dci } = setup();
    dci.disable();
    expect(dci.isEnabled()).toBe(false);
    expect(shadow()?.querySelector('.chat') ?? null).toBeNull();
    modClick(f.get('#a'));
    expect(dci.selection.elements()).toEqual([]);
    dci.enable();
    modClick(f.get('#a'));
    expect(dci.selection.elements()).toEqual([f.get('#a')]);
    expect(shadow()?.querySelector('.chat')).not.toBeNull();
  });

  it('destroy removes the UI and every listener', async () => {
    const { f, dci } = setup();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const events = vi.fn();
    dci.on('selectionchange', events);
    dci.destroy();
    expect(document.querySelector('dci-root')).toBeNull();
    modClick(f.get('#a'));
    await tick();
    expect(events).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(remove.mock.calls.length).toBeGreaterThan(0);
    dci.destroy(); // idempotent
  });

  it('supports two instances with separate roots and one UI host', () => {
    const one = setup();
    const two = setup();
    expect(document.querySelectorAll('dci-root')).toHaveLength(1);
    modClick(two.f.get('#b'));
    expect(two.dci.selection.get().map((n) => n.id)).toEqual(['inv_2']);
    expect(one.dci.selection.get()).toEqual([]);
    one.dci.destroy();
    expect(document.querySelectorAll('dci-root')).toHaveLength(1);
    two.dci.destroy();
    expect(document.querySelector('dci-root')).toBeNull();
  });
});

describe('dciAttr', () => {
  it('is stable and round-trips through the parser', () => {
    const a = dciAttr({
      label: 'Invoice 1',
      id: 'inv_1',
      type: 'invoice',
      amount: 5,
      meta: { z: 1, a: 2 },
    });
    const b = dciAttr({
      meta: { a: 2, z: 1 },
      amount: 5,
      type: 'invoice',
      id: 'inv_1',
      label: 'Invoice 1',
    });
    expect(a).toEqual(b);
    expect(stableStringify({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}');
    const el = document.createElement('div');
    el.setAttribute('data-dci', a['data-dci']);
    expect(readDci(el)).toMatchObject({ id: 'inv_1', type: 'invoice', label: 'Invoice 1' });
    expect(dciAttr({ id: 'x' }, 'data-ai')).toEqual({ 'data-ai': '{"id":"x"}' });
  });
});
