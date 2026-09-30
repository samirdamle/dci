import type * as Core from '@samirdamle/dci-core';
import type { DciEvent, DciInstance, DciRequest, Transport } from '@samirdamle/dci-core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dci,
  DciChat,
  DciProvider,
  useChat,
  useDci,
  useDciAction,
  useSelection,
  type DciConfig,
} from '../src/index';

// Track live instances to check StrictMode and cleanup behaviour.
const live = vi.hoisted(() => new Set<unknown>());
vi.mock('@samirdamle/dci-core', async (importOriginal) => {
  const core: typeof Core = await importOriginal();
  return {
    ...core,
    createDci: (config: DciConfig) => {
      const instance = core.createDci(config);
      live.add(instance);
      const destroy = instance.destroy;
      instance.destroy = () => {
        live.delete(instance);
        destroy();
      };
      return instance;
    },
  };
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

/** Replays `events` for every request. */
function transportOf(events: (req: DciRequest) => DciEvent[]) {
  const requests: DciRequest[] = [];
  const transport: Transport = {
    async *send(req) {
      requests.push(req);
      yield* events(req);
    },
  };
  return { transport, requests };
}

const reply = (text: string): DciEvent[] => [{ type: 'text-delta', text }, { type: 'done' }];
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

function Items() {
  return (
    <section {...dci({ id: 'page', type: 'page', label: 'Dashboard' })}>
      <div id="a" {...dci({ id: 'inv_1', type: 'invoice', label: 'Invoice 1' })} />
      <div id="b" {...dci({ id: 'inv_2', type: 'invoice', label: 'Invoice 2' })} />
    </section>
  );
}

/** The latest instance seen by `<Capture />`. */
const seen: { instance: DciInstance | null } = { instance: null };
function Capture() {
  const dci = useDci();
  useEffect(() => {
    seen.instance = dci;
  });
  return null;
}
const current = () => seen.instance!;

function renderWith(ui: ReactNode, config: Partial<DciConfig> = {}) {
  const fake = transportOf(() => reply('Hi'));
  const cfg: DciConfig = { transport: fake.transport, chat: { autoOpen: false }, ...config };
  const utils = render(
    <DciProvider config={cfg}>
      <Items />
      <Capture />
      {ui}
    </DciProvider>,
  );
  return { ...utils, ...fake, cfg };
}

describe('DciProvider', () => {
  it('leaves exactly one live instance under StrictMode', () => {
    const fake = transportOf(() => reply('x'));
    const { unmount } = render(
      <StrictMode>
        <DciProvider config={{ transport: fake.transport }}>
          <Capture />
        </DciProvider>
      </StrictMode>,
    );
    expect(live.size).toBe(1);
    expect(live.has(seen.instance)).toBe(true);
    unmount();
    expect(live.size).toBe(0);
  });

  it('applies config changes with update() and recreates on a new transport', () => {
    const { rerender, cfg } = renderWith(null);
    const first = current();
    const shadow = () => document.querySelector('dci-root')!.shadowRoot!;
    rerender(
      <DciProvider config={{ ...cfg, chat: { autoOpen: false, mode: 'panel' } }}>
        <Capture />
      </DciProvider>,
    );
    expect(current()).toBe(first);
    expect(shadow().querySelector('.chat')?.getAttribute('role')).toBe('complementary');

    const other = transportOf(() => reply('y'));
    rerender(
      <DciProvider config={{ ...cfg, transport: other.transport }}>
        <Capture />
      </DciProvider>,
    );
    expect(current()).not.toBe(first);
    expect(live.size).toBe(1);
  });
});

describe('hooks', () => {
  it('useSelection follows the selection and can change it', async () => {
    function Selected() {
      const { nodes, set } = useSelection();
      return (
        <button type="button" onClick={() => set('inv_2')}>
          {nodes.map((n) => n.id).join(',') || 'none'}
        </button>
      );
    }
    renderWith(<Selected />);
    expect(screen.getByRole('button').textContent).toBe('none');
    act(() => current().selection.set('inv_1'));
    await tick();
    expect(screen.getByRole('button').textContent).toBe('inv_1');
    act(() => screen.getByRole('button').click());
    await tick();
    expect(screen.getByRole('button').textContent).toBe('inv_2');
  });

  it('useChat exposes state and sends', async () => {
    const ref: { chat?: ReturnType<typeof useChat> } = {};
    function Chat() {
      const chat = useChat();
      useEffect(() => {
        ref.chat = chat;
      });
      return <p data-testid="log">{chat.messages.map((m) => `${m.role}:${m.text}`).join('|')}</p>;
    }
    const { requests } = renderWith(<Chat />);
    act(() => ref.chat!.setOpen(true));
    expect(ref.chat!.open).toBe(true);
    await act(() => ref.chat!.send('Hello'));
    expect(requests[0]?.prompt).toBe('Hello');
    expect(screen.getByTestId('log').textContent).toBe('user:Hello|assistant:Hi');
  });

  it('useDciAction registers the latest handler and cleans up on unmount', async () => {
    const script = transportOf(() => [
      { type: 'client-action', name: 'markPaid', args: { id: 'inv_1' } },
      ...reply('ok'),
    ]);
    const calls: string[] = [];
    function Handler({ tag }: { tag: string }) {
      useDciAction('markPaid', (args) => void calls.push(`${tag}:${String(args.id)}`));
      return null;
    }
    function App() {
      const [tag, setTag] = useState('first');
      const [show, setShow] = useState(true);
      return (
        <>
          {show && <Handler tag={tag} />}
          <button type="button" onClick={() => setTag('second')}>
            rename
          </button>
          <button type="button" onClick={() => setShow(false)}>
            hide
          </button>
        </>
      );
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWith(<App />, { transport: script.transport });
    await act(() => current().chat.send('one'));
    act(() => screen.getByText('rename').click());
    await act(() => current().chat.send('two'));
    act(() => screen.getByText('hide').click());
    await act(() => current().chat.send('three'));
    expect(calls).toEqual(['first:inv_1', 'second:inv_1']);
    expect(warn).toHaveBeenCalledWith('[dci] No handler for client action "markPaid".');
    warn.mockRestore();
  });
});

describe('DciChat', () => {
  it('renders a custom chat and hides the built-in one while mounted', async () => {
    function Custom() {
      const [show, setShow] = useState(true);
      return (
        <>
          {show && (
            <DciChat
              render={(chat) => (
                <div data-testid="custom">
                  {chat.messages.length} messages
                  <button type="button" onClick={() => void chat.send('hey')}>
                    send
                  </button>
                </div>
              )}
            />
          )}
          <button type="button" onClick={() => setShow(false)}>
            unmount
          </button>
        </>
      );
    }
    renderWith(<Custom />);
    const builtIn = () => document.querySelector('dci-root')?.shadowRoot?.querySelector('.chat');
    expect(builtIn() ?? null).toBeNull();
    act(() => screen.getByText('send').click());
    await tick();
    expect(screen.getByTestId('custom').textContent).toContain('2 messages');
    act(() => screen.getByText('unmount').click());
    expect(builtIn()).toBeTruthy();
  });
});

describe('dci()', () => {
  it('returns stable, sorted data-dci props', () => {
    const a = dci({ label: 'Row', id: 'r1', amount: 5 });
    expect(a).toEqual({ 'data-dci': '{"amount":5,"id":"r1","label":"Row"}' });
    expect(dci({ amount: 5, id: 'r1', label: 'Row' })).toEqual(a);
  });
});
