import type { DciRequest } from '@dci/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActionRegistry } from '../src/actions';
import { createChatController, type ChatControllerOptions } from '../src/chat/controller';
import { resolveActions, type ActionsConfig } from '../src/chat/suggested-actions';
import { createSelectionStore } from '../src/selection';
import { createSession } from '../src/session';
import { fakeTransport, reply, tick } from './chat-utils';
import { mountFixture } from './test-utils';

const FIXTURE = `
  <section data-dci='{"id":"page","type":"page","label":"Dashboard"}'>
    <div id="a" data-dci='{"id":"inv_1","type":"invoice","label":"Invoice 1","amount":5}'></div>
    <div id="b" data-dci='{"id":"inv_2","type":"invoice","label":"Invoice 2"}'></div>
    <div id="secret" data-dci='{"id":"ssn","private":true}'>
      <div id="inner" data-dci='{"id":"note","type":"note"}'></div>
    </div>
  </section>`;

let destroy: (() => void) | undefined;
afterEach(() => {
  destroy?.();
  destroy = undefined;
});

function setup(
  options: Partial<ChatControllerOptions> = {},
  script = (_r: DciRequest) => reply('Hello!'),
) {
  const f = mountFixture(FIXTURE);
  const selection = createSelectionStore({ root: f.root, includeAncestors: true });
  const fake = fakeTransport(script);
  const chat = createChatController({
    transport: fake.transport,
    selection,
    session: createSession({ scope: 'manual', id: 's1' }),
    contextOptions: { root: f.root },
    page: () => ({ url: 'https://x.test/', title: 'X' }),
    ...options,
  });
  destroy = () => chat.destroy();
  return { f, selection, chat, ...fake };
}

describe('chat controller', () => {
  it('streams a full reply and snapshots context into the user message', async () => {
    const { f, selection, chat, requests } = setup();
    const states: string[] = [];
    chat.subscribe((s) => states.push(s.status));
    selection.set([f.get('#a')]);
    await tick();
    expect(chat.getState().pendingContext.map((n) => n.id)).toEqual(['inv_1']);

    chat.open();
    chat.setDraft('  Why overdue?  ');
    expect(await chat.send()).toBe(true);

    const s = chat.getState();
    expect(s.open).toBe(true);
    expect(s.status).toBe('idle');
    expect(s.draft).toBe('');
    expect(s.pendingContext).toEqual([]);
    expect(s.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'Why overdue?'],
      ['assistant', 'Hello!'],
    ]);
    expect(s.messages[0]!.context!.map((n) => n.id)).toEqual(['inv_1']);
    expect(s.messages[1]!.complete).toBe(true);
    expect(states).toContain('sending');
    expect(states).toContain('streaming');
    expect(requests[0]).toMatchObject({
      v: 1,
      sessionId: 's1',
      prompt: 'Why overdue?',
      page: { url: 'https://x.test/', title: 'X' },
    });
  });

  it('produces immutable, structurally shared snapshots', async () => {
    const { f, selection, chat } = setup();
    selection.set([f.get('#a')]);
    await tick();
    const before = chat.getState();
    await chat.send('hi');
    const after = chat.getState();
    expect(after).not.toBe(before);
    expect(before.messages).toEqual([]);
    expect(after.messages[0]).toBe(chat.getState().messages[0]);
  });

  it('tracks tool progress and dispatches client actions', async () => {
    const f = mountFixture(FIXTURE);
    const selection = createSelectionStore({ root: f.root });
    const actions = createActionRegistry({ selection, root: f.root, builtins: false });
    const handler = vi.fn();
    actions.on('highlight', handler);
    const custom = vi.fn();
    const { transport } = fakeTransport(() => [
      { type: 'tool-start', id: 't1', name: 'lookup', label: 'Looking up…' },
      { type: 'tool-start', id: 't2', name: 'update' },
      { type: 'tool-end', id: 't1', ok: true, label: 'Found it' },
      { type: 'tool-end', id: 't2', ok: false },
      { type: 'tool-start', id: 't3', name: 'never_ends' },
      { type: 'client-action', name: 'highlight', args: { ids: ['inv_1'] } },
      { type: 'x-usage', tokens: 3 },
      { type: 'done' },
    ]);
    const chat = createChatController({ transport, selection, actions, onCustomEvent: custom });
    destroy = () => chat.destroy();
    await chat.send('go');
    expect(chat.getState().messages[1]!.tools).toEqual([
      { id: 't1', name: 'lookup', label: 'Found it', state: 'ok' },
      { id: 't2', name: 'update', state: 'failed' },
      { id: 't3', name: 'never_ends', state: 'failed' },
    ]);
    await tick();
    expect(handler).toHaveBeenCalledWith({ ids: ['inv_1'] }, expect.any(Object));
    expect(custom).toHaveBeenCalledWith({ type: 'x-usage', tokens: 3 });
  });

  it('records errors and retries with the same context', async () => {
    let attempt = 0;
    const { f, selection, chat, requests } = setup({}, () =>
      ++attempt === 1
        ? [
            { type: 'text-delta', text: 'par' },
            { type: 'error', message: 'boom', code: 'x' },
            { type: 'done' },
          ]
        : reply('Recovered'),
    );
    selection.set([f.get('#a')]);
    await tick();
    await chat.send('why?', { action: 'explain' });
    expect(chat.getState().status).toBe('error');
    expect(chat.getState().messages[1]!.error).toEqual({ message: 'boom', code: 'x' });

    expect(await chat.retry()).toBe(true);
    const s = chat.getState();
    expect(s.status).toBe('idle');
    expect(s.messages.map((m) => m.text)).toEqual(['why?', 'Recovered']);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[1]!.action).toBe('explain');
  });

  it('stops mid-stream', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const f = mountFixture(FIXTURE);
    const selection = createSelectionStore({ root: f.root });
    const { transport } = fakeTransport(() => reply('Hello there'), gate);
    const chat = createChatController({ transport, selection });
    destroy = () => chat.destroy();
    const sending = chat.send('hi');
    await tick();
    expect(chat.getState().status).toBe('streaming');
    chat.stop();
    await sending;
    open();
    const last = chat.getState().messages[1]!;
    expect(last).toMatchObject({ text: 'He', stopped: true, complete: true });
    expect(chat.getState().status).toBe('idle');
  });

  describe('mid-chat context', () => {
    it("'turn' mode sends only context added since the last message", async () => {
      const { f, selection, chat, requests } = setup();
      selection.set([f.get('#a')]);
      await tick();
      await chat.send('first');
      await chat.send('follow-up with no new selection');
      selection.add(f.get('#b'));
      await tick();
      expect(chat.getState().pendingContext.map((n) => n.id)).toEqual(['inv_2']);
      await chat.send('about b');
      expect(requests.map((r) => r.context.map((n) => n.id))).toEqual([['inv_1'], [], ['inv_2']]);
      expect(
        chat
          .getState()
          .messages.filter((m) => m.role === 'user')
          .map((m) => m.context!.length),
      ).toEqual([1, 0, 1]);
    });

    it("'cumulative' mode resends everything selected so far", async () => {
      const { f, selection, chat, requests } = setup({ contextMode: 'cumulative' });
      selection.set([f.get('#a')]);
      await tick();
      await chat.send('first');
      selection.set([f.get('#b')]);
      await tick();
      await chat.send('second');
      await chat.send('third');
      expect(requests.map((r) => r.context.map((n) => n.id))).toEqual([
        ['inv_1'],
        ['inv_1', 'inv_2'],
        ['inv_1', 'inv_2'],
      ]);
    });

    it('removeContext drops a chip and deselects its element', async () => {
      const { f, selection, chat } = setup();
      selection.set([f.get('#a'), f.get('#b')]);
      await tick();
      chat.removeContext(chat.getState().pendingContext[0]!);
      expect(chat.getState().pendingContext.map((n) => n.id)).toEqual(['inv_2']);
      expect(selection.get().map((e) => e.id)).toEqual(['b']);
      chat.removeContext({ id: 'nope', data: {}, source: 'annotated' });
    });

    it('reports the selection limit', async () => {
      const f = mountFixture(FIXTURE);
      const selection = createSelectionStore({ root: f.root, maxSelection: 1 });
      const chat = createChatController({
        transport: fakeTransport(() => reply('')).transport,
        selection,
      });
      destroy = () => chat.destroy();
      selection.set([f.get('#a'), f.get('#b')]);
      await tick();
      expect(chat.getState().limit).toEqual({ shown: 1, total: 2 });
      selection.set([f.get('#b')]);
      await tick();
      expect(chat.getState().limit).toBeNull();
    });
  });

  describe('concurrency', () => {
    it("'block' ignores a send while streaming", async () => {
      let open!: () => void;
      const gate = new Promise<void>((r) => (open = r));
      const f = mountFixture(FIXTURE);
      const { transport, requests } = fakeTransport(() => reply('One'), gate);
      const chat = createChatController({
        transport,
        selection: createSelectionStore({ root: f.root }),
      });
      destroy = () => chat.destroy();
      const first = chat.send('one');
      await tick();
      expect(await chat.send('two')).toBe(false);
      open();
      await first;
      expect(requests.map((r) => r.prompt)).toEqual(['one']);
    });

    it("'queue' sends it after the current reply", async () => {
      let open!: () => void;
      const gate = new Promise<void>((r) => (open = r));
      const f = mountFixture(FIXTURE);
      const { transport, requests } = fakeTransport(() => reply('One'), gate);
      const chat = createChatController({
        transport,
        selection: createSelectionStore({ root: f.root }),
        concurrency: 'queue',
      });
      destroy = () => chat.destroy();
      const first = chat.send('one');
      await tick();
      expect(await chat.send('two')).toBe(true);
      open();
      await first;
      expect(requests.map((r) => r.prompt)).toEqual(['one', 'two']);
      expect(chat.getState().messages.map((m) => m.text)).toEqual(['one', 'One', 'two', 'One']);
    });
  });

  it('ignores empty prompts', async () => {
    const { chat, requests } = setup();
    expect(await chat.send('   ')).toBe(false);
    expect(await chat.retry()).toBe(false);
    expect(requests).toEqual([]);
  });
});

describe('privacy', () => {
  it('beforeSend can redact the request (async)', async () => {
    const { f, selection, chat, requests } = setup({
      beforeSend: async (req) => ({
        ...req,
        prompt: req.prompt.replace(/\d{3}-\d{2}-\d{4}/, '[redacted]'),
        context: req.context.map((n) => ({ ...n, data: {} })),
      }),
    });
    selection.set([f.get('#a')]);
    await tick();
    await chat.send('my ssn is 123-45-6789');
    expect(requests[0]!.prompt).toBe('my ssn is [redacted]');
    expect(requests[0]!.context[0]!.data).toEqual({});
  });

  it('beforeSend returning false cancels with a notice', async () => {
    const { chat, requests } = setup({ beforeSend: () => false });
    expect(await chat.send('hi')).toBe(false);
    expect(requests).toEqual([]);
    expect(chat.getState().notice).toBe('cancelled');
    expect(chat.getState().messages).toEqual([]);
  });

  it('asks for confirmation, supports cancel, and "don\'t ask again"', async () => {
    const { f, selection, chat, requests } = setup({ confirmBeforeSend: true });
    selection.set([f.get('#a'), f.get('#b')]);
    await tick();
    const first = chat.send('one');
    await tick();
    expect(chat.getState().confirm?.request.context).toHaveLength(2);
    chat.confirm(false);
    expect(await first).toBe(false);
    expect(chat.getState()).toMatchObject({ confirm: null, notice: 'cancelled' });

    const second = chat.send('two');
    await tick();
    chat.confirm(true, { dontAskAgain: true });
    expect(await second).toBe(true);
    await chat.send('three');
    expect(chat.getState().confirm).toBeNull();
    expect(requests.map((r) => r.prompt)).toEqual(['two', 'three']);
  });

  it('confirmBeforeSend can decide per request', async () => {
    const { chat, requests } = setup({ confirmBeforeSend: (req) => req.context.length > 5 });
    await chat.send('no context, no confirm');
    expect(requests).toHaveLength(1);
  });

  it('never sends a private node, even selected directly or through ancestors', async () => {
    const { f, selection, chat, requests } = setup();
    selection.set([f.get('#secret'), f.get('#inner')]);
    await tick();
    await chat.send('hi');
    const sent = JSON.stringify(requests[0]);
    expect(requests[0]!.context.map((n) => n.id)).toEqual(['note']);
    expect(requests[0]!.context[0]!.ancestors).toContainEqual({ private: true });
    expect(sent).not.toContain('ssn');
  });

  it('fails loudly in development if beforeSend adds a private node', async () => {
    const { chat, requests } = setup({
      beforeSend: (req) => ({ ...req, context: [{ id: 'ssn', data: {}, source: 'annotated' }] }),
    });
    await expect(chat.send('hi')).rejects.toThrow(/private node/);
    expect(requests).toEqual([]);
  });

  it('strips leaked private nodes in production', async () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { chat, requests } = setup({
        beforeSend: (req) => ({
          ...req,
          context: [
            { id: 'ok', data: {}, source: 'annotated' },
            { id: 'x', data: {}, source: 'annotated', ancestors: [{ private: true, id: 'ssn' }] },
          ],
        }),
      });
      await chat.send('hi');
      expect(requests[0]!.context.map((n) => n.id)).toEqual(['ok']);
    } finally {
      process.env.NODE_ENV = env;
    }
  });

  it('previewRequest returns exactly what would be sent', async () => {
    const { f, selection, chat, requests } = setup({
      beforeSend: (req) => ({ ...req, prompt: req.prompt.toUpperCase() }),
    });
    selection.set([f.get('#a')]);
    await tick();
    chat.setDraft('explain');
    const preview = await chat.previewRequest(undefined, { action: 'explain' });
    await chat.send(undefined, { action: 'explain' });
    expect(preview).toEqual(requests[0]);
  });
});

describe('resolveActions', () => {
  const explain = { id: 'explain', label: 'Explain' };
  const remind = { id: 'remind', label: 'Draft reminder', prompt: 'Draft a payment reminder' };
  const summarize = { id: 'summarize', label: 'Summarize' };
  const config: ActionsConfig = {
    invoice: [explain, remind, { id: 'pay', label: 'Pay', multi: false }],
    quote: [explain, { id: 'convert', label: 'Convert' }],
    '*': [summarize, explain],
  };
  const node = (type?: string) => ({
    ...(type ? { type } : {}),
    data: {},
    source: 'annotated' as const,
  });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it('single type: its actions, then *', () => {
    expect(ids(resolveActions(config, [node('invoice')]))).toEqual([
      'explain',
      'remind',
      'pay',
      'summarize',
    ]);
  });

  it('mixed types: the shared actions, then *', () => {
    expect(ids(resolveActions(config, [node('invoice'), node('quote')]))).toEqual([
      'explain',
      'summarize',
    ]);
  });

  it('untyped nodes and unknown types fall back to *', () => {
    expect(ids(resolveActions(config, [node()]))).toEqual(['summarize', 'explain']);
  });

  it('filters with multi and when', () => {
    expect(ids(resolveActions(config, [node('invoice'), node('invoice')]))).toEqual([
      'explain',
      'remind',
      'summarize',
    ]);
    const withWhen: ActionsConfig = {
      '*': [{ id: 'big', label: 'Big', when: (n) => n.length > 2 }],
    };
    expect(resolveActions(withWhen, [node()])).toEqual([]);
  });

  it('supports the function form and nothing selected', () => {
    expect(
      ids(resolveActions((nodes) => [{ id: `n${nodes.length}`, label: 'x' }], [node()])),
    ).toEqual(['n1']);
    expect(resolveActions(config, [])).toEqual([]);
    expect(resolveActions(undefined, [node()])).toEqual([]);
  });

  it('an action click sends its prompt and id', async () => {
    const { chat, requests } = setup();
    await chat.send(remind.prompt ?? remind.label, { action: remind.id });
    expect(requests[0]).toMatchObject({ prompt: 'Draft a payment reminder', action: 'remind' });
  });
});
