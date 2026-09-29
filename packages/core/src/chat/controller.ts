import {
  PROTOCOL_VERSION,
  type DciContextNode,
  type DciEvent,
  type DciRequest,
} from '@dci/protocol';
import type { ActionRegistry } from '../actions';
import { toContextNode, type ContextOptions } from '../context';
import { isDev } from '../env';
import { DEFAULT_ATTRIBUTE, readDci } from '../parse';
import type { SelectionStore } from '../selection';
import { createSession, type Session } from '../session';
import type { Transport } from '../transport';
import type { ChatMessage, ChatState, ToolStatus } from './types';

type MaybePromise<T> = T | Promise<T>;

export interface ChatControllerOptions {
  transport: Transport;
  selection: SelectionStore;
  /** Default: a new page-scoped session. */
  session?: Session;
  /** Runs `client-action` events. */
  actions?: ActionRegistry;
  /** How selected elements become context (match the selection store's options). */
  contextOptions?: ContextOptions;
  /**
   * `'turn'` (default) sends only context added since the last message (the
   * backend keeps history via `sessionId`); `'cumulative'` resends all of it.
   */
  contextMode?: 'turn' | 'cumulative';
  /** Sending while a reply streams: `'block'` (default) ignores it, `'queue'` waits. */
  concurrency?: 'block' | 'queue';
  /** Redact or enrich a request; return `false` to cancel it. */
  beforeSend?: (request: DciRequest) => MaybePromise<DciRequest | false>;
  /** Ask the user before sending: `true`, or decide per request. */
  confirmBeforeSend?: boolean | ((request: DciRequest) => boolean);
  /** Page info sent with each request. Default: `location.href` and `document.title`. */
  page?: () => { url: string; title: string };
  /** Receives custom `x-…` events. */
  onCustomEvent?: (event: DciEvent) => void;
}

export interface SendOptions {
  action?: string;
}

export interface ChatController {
  getState(): ChatState;
  /** Called with each new state snapshot; returns an unsubscribe function. */
  subscribe(fn: (state: ChatState) => void): () => void;
  open(): void;
  close(): void;
  setDraft(text: string): void;
  /** Send `prompt` (default: the draft). Resolves `false` when nothing was sent. */
  send(prompt?: string, options?: SendOptions): Promise<boolean>;
  /** Abort the reply that is streaming. */
  stop(): void;
  /** Resend the last user message with the same context. */
  retry(): Promise<boolean>;
  /** Drop one context item (and deselect its element). */
  removeContext(node: DciContextNode): void;
  /** The page element behind a pending context item, or `null`. */
  elementFor(node: DciContextNode): Element | null;
  /** Answer a pending `confirmBeforeSend` prompt. */
  confirm(accept: boolean, options?: { dontAskAgain?: boolean }): void;
  /** The exact request `send` would make next, after `beforeSend` (or `false`). */
  previewRequest(prompt?: string, options?: SendOptions): Promise<DciRequest | false>;
  readonly session: Session;
  destroy(): void;
}

const INITIAL: ChatState = {
  status: 'idle',
  open: false,
  messages: [],
  pendingContext: [],
  draft: '',
  confirm: null,
  notice: null,
  limit: null,
};

const nodeKey = (n: DciContextNode) =>
  n.id !== undefined ? `id:${n.id}` : `el:${n.fallback?.path ?? JSON.stringify(n)}`;

/**
 * Framework-agnostic chat state machine. It snapshots the selection into
 * each user message, streams the reply through the transport, and exposes
 * immutable state (structurally shared), so any UI, or React's
 * `useSyncExternalStore`, can render it.
 */
export function createChatController(options: ChatControllerOptions): ChatController {
  const { transport, selection } = options;
  const session = options.session ?? createSession();
  const contextOptions = options.contextOptions ?? {};
  const attribute = contextOptions.attribute ?? DEFAULT_ATTRIBUTE;
  const mode = options.contextMode ?? 'turn';

  let state: ChatState = INITIAL;
  const listeners = new Set<(s: ChatState) => void>();
  let nextId = 1;
  let inflight: AbortController | null = null;
  let skipConfirm = false;
  let resolveConfirm: ((accept: boolean) => void) | null = null;
  const queue: Array<[string | undefined, SendOptions | undefined]> = [];
  /** Elements selected since the last send (turn mode). */
  let pendingEls: Element[] = selection.get();
  /** Everything sent so far (cumulative mode). */
  let sentContext: DciContextNode[] = [];

  function set(patch: Partial<ChatState>) {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn(state);
  }

  const toNodes = (els: Element[]) =>
    els.flatMap((el) => {
      const node = toContextNode(el, contextOptions);
      return node ? [{ el, node }] : [];
    });

  function refreshPending() {
    set({ pendingContext: toNodes(pendingEls).map((p) => p.node) });
  }
  refreshPending();

  // The store flushes `selectionlimit` just before `selectionchange`, so the
  // change handler keeps a limit reported in the same flush and clears stale ones.
  let freshLimit: ChatState['limit'] = null;
  const offChange = selection.subscribe(({ elements, added }) => {
    const current = new Set(elements);
    pendingEls = [
      ...pendingEls.filter((el) => current.has(el)),
      ...added.filter((el) => !pendingEls.includes(el)),
    ];
    set({ limit: freshLimit });
    freshLimit = null;
    refreshPending();
  });
  const offLimit = selection.on('selectionlimit', ({ dropped, max }) => {
    freshLimit = { shown: max, total: max + dropped };
    set({ limit: freshLimit });
  });

  function updateAssistant(id: string, fn: (m: ChatMessage) => ChatMessage) {
    set({ messages: state.messages.map((m) => (m.id === id ? fn(m) : m)) });
  }

  function page() {
    if (options.page) return options.page();
    return typeof location !== 'undefined'
      ? { url: location.href, title: typeof document !== 'undefined' ? document.title : '' }
      : { url: '', title: '' };
  }

  function buildRequest(
    prompt: string,
    action: string | undefined,
    context: DciContextNode[],
  ): DciRequest {
    return {
      v: PROTOCOL_VERSION,
      sessionId: session.id,
      prompt,
      ...(action !== undefined ? { action } : {}),
      context,
      page: page(),
    };
  }

  function nextContext(): DciContextNode[] {
    const fresh = toNodes(pendingEls).map((p) => p.node);
    if (mode === 'turn') return fresh;
    const byKey = new Map(sentContext.map((n) => [nodeKey(n), n]));
    for (const n of fresh) byKey.set(nodeKey(n), n);
    return [...byKey.values()];
  }

  /** Ids of `private` nodes under the root, for the last-line privacy check. */
  function privateIds(): Set<string> {
    const ids = new Set<string>();
    const root = contextOptions.root ?? (typeof document !== 'undefined' ? document.body : null);
    root?.querySelectorAll(`[${attribute}]`).forEach((el) => {
      const parsed = readDci(el, { attribute });
      if (parsed?.private && parsed.id !== undefined) ids.add(parsed.id);
    });
    return ids;
  }

  /**
   * Defense in depth: the parser, tree and extractor already exclude private
   * nodes. If one still reaches the outgoing payload (e.g. added by
   * `beforeSend`), fail loudly in development and strip it in production.
   */
  function enforcePrivacy(request: DciRequest): DciRequest {
    const ids = privateIds();
    const leaks = (n: { id?: string; private?: true }) =>
      (n.id !== undefined && ids.has(n.id)) || (n.private === true && Object.keys(n).length > 1);
    const bad = request.context.filter((n) => leaks(n) || (n.ancestors ?? []).some(leaks));
    if (!bad.length) return request;
    if (isDev()) throw new Error('[dci] A private node reached the outgoing request.');
    return { ...request, context: request.context.filter((n) => !bad.includes(n)) };
  }

  async function prepare(prompt: string, action?: string): Promise<DciRequest | false> {
    let request: DciRequest | false = buildRequest(prompt, action, nextContext());
    if (options.beforeSend) request = await options.beforeSend(request);
    if (!request) return false;
    return enforcePrivacy(request);
  }

  function needsConfirm(request: DciRequest) {
    const c = options.confirmBeforeSend;
    if (skipConfirm || !c) return false;
    return typeof c === 'function' ? c(request) : true;
  }

  async function stream(request: DciRequest, assistantId: string) {
    const controller = new AbortController();
    inflight = controller;
    set({ status: 'sending' });
    let failed = false;
    try {
      for await (const event of transport.send(request, { signal: controller.signal })) {
        if (state.status === 'sending') set({ status: 'streaming' });
        switch (event.type) {
          case 'text-delta':
            updateAssistant(assistantId, (m) => ({ ...m, text: m.text + event.text }));
            break;
          case 'tool-start': {
            const tool: ToolStatus = {
              id: event.id,
              name: event.name,
              ...(event.label !== undefined ? { label: event.label } : {}),
              state: 'running',
            };
            updateAssistant(assistantId, (m) => ({ ...m, tools: [...m.tools, tool] }));
            break;
          }
          case 'tool-end':
            updateAssistant(assistantId, (m) => ({
              ...m,
              tools: m.tools.map((t) =>
                t.id === event.id
                  ? {
                      ...t,
                      state: event.ok ? 'ok' : 'failed',
                      ...(event.label ? { label: event.label } : {}),
                    }
                  : t,
              ),
            }));
            break;
          case 'client-action':
            void options.actions?.dispatch(event.name, event.args);
            break;
          case 'error':
            failed = true;
            updateAssistant(assistantId, (m) => ({
              ...m,
              error: { message: event.message, ...(event.code ? { code: event.code } : {}) },
            }));
            break;
          case 'done':
            break;
          default:
            options.onCustomEvent?.(event);
        }
      }
    } finally {
      const stopped = controller.signal.aborted;
      updateAssistant(assistantId, (m) => ({
        ...m,
        complete: true,
        ...(stopped ? { stopped: true } : {}),
        // A reply that ended mid-tool can't finish that tool any more.
        tools: m.tools.map((t) => (t.state === 'running' ? { ...t, state: 'failed' as const } : t)),
      }));
      inflight = null;
      set({ status: failed && !stopped ? 'error' : 'idle' });
    }
    const next = queue.shift();
    if (next) await send(...next);
  }

  function addAssistant(): string {
    const id = `m${nextId++}`;
    set({ messages: [...state.messages, { id, role: 'assistant', text: '', tools: [] }] });
    return id;
  }

  const busy = () => state.status === 'sending' || state.status === 'streaming' || !!state.confirm;

  async function send(prompt?: string, sendOptions: SendOptions = {}): Promise<boolean> {
    if (busy()) {
      if (options.concurrency === 'queue') {
        queue.push([prompt, sendOptions]);
        return true;
      }
      return false;
    }
    const text = (prompt ?? state.draft).trim();
    if (!text) return false;
    set({ notice: null });

    const request = await prepare(text, sendOptions.action);
    if (!request) {
      set({ notice: 'cancelled' });
      return false;
    }
    if (needsConfirm(request)) {
      set({ confirm: { request } });
      const accepted = await new Promise<boolean>((resolve) => (resolveConfirm = resolve));
      set({ confirm: null });
      if (!accepted) {
        set({ notice: 'cancelled' });
        return false;
      }
    }

    const user: ChatMessage = {
      id: `m${nextId++}`,
      role: 'user',
      text,
      context: request.context,
      ...(sendOptions.action !== undefined ? { action: sendOptions.action } : {}),
      tools: [],
    };
    sentContext = mode === 'cumulative' ? request.context : sentContext;
    pendingEls = [];
    set({
      messages: [...state.messages, user],
      draft: prompt === undefined ? '' : state.draft,
      pendingContext: [],
    });
    await stream(request, addAssistant());
    return true;
  }

  return {
    session,
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    open: () => set({ open: true }),
    close: () => set({ open: false }),
    setDraft: (draft) => set({ draft }),
    send,
    stop: () => inflight?.abort(),
    async retry() {
      if (busy()) return false;
      const lastUser = [...state.messages].reverse().find((m) => m.role === 'user');
      if (!lastUser) return false;
      // Drop the failed or stopped reply that followed it.
      const i = state.messages.indexOf(lastUser);
      set({ messages: state.messages.slice(0, i + 1), notice: null });
      let request: DciRequest | false = buildRequest(
        lastUser.text,
        lastUser.action,
        lastUser.context ?? [],
      );
      if (options.beforeSend) request = await options.beforeSend(request);
      if (!request) {
        set({ notice: 'cancelled' });
        return false;
      }
      await stream(enforcePrivacy(request), addAssistant());
      return true;
    },
    removeContext(node) {
      const match = toNodes(pendingEls).find((p) => nodeKey(p.node) === nodeKey(node));
      if (!match) return;
      pendingEls = pendingEls.filter((el) => el !== match.el);
      selection.remove(match.el);
      refreshPending();
    },
    elementFor: (node) =>
      toNodes(pendingEls).find((p) => nodeKey(p.node) === nodeKey(node))?.el ?? null,
    confirm(accept, { dontAskAgain = false } = {}) {
      if (accept && dontAskAgain) skipConfirm = true;
      resolveConfirm?.(accept);
      resolveConfirm = null;
    },
    previewRequest: (prompt, sendOptions = {}) =>
      prepare((prompt ?? state.draft).trim(), sendOptions.action),
    destroy() {
      inflight?.abort();
      resolveConfirm?.(false);
      offChange();
      offLimit();
      listeners.clear();
    },
  };
}
