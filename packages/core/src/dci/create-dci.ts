import type { DciContextNode, DciRequest } from '@samirdamle/dci-protocol';
import {
  createActionRegistry,
  type ActionError,
  type ActionHandler,
  type ActionRegistry,
} from '../actions';
import { createChatController, type ChatController, type SendOptions } from '../chat/controller';
import { createChatUi, type ChatMode, type ChatUi } from '../chat/ui/chat-ui';
import type { ChatMessage, ChatState } from '../chat/types';
import type { ContextOptions } from '../context';
import { createEmitter } from '../emitter';
import { devWarn, isDev } from '../env';
import { createInteractions, type InteractionEvents, type Interactions } from '../interactions';
import { readDci } from '../parse';
import { selectSameType, type SelectSameTypeOptions } from '../same-type';
import {
  createSelectionStore,
  type SelectionLimit,
  type SelectionOptions,
  type SelectionStore,
} from '../selection';
import { createSession, type Session, type SessionChange } from '../session';
import { createSSETransport, type Transport } from '../transport';
import { createDciTree, type DciTree } from '../tree';
import {
  DEFAULTS,
  mergeConfig,
  sameValue,
  validateConfig,
  type DciChatConfig,
  type DciConfig,
} from './config';

/** A node to act on: the element itself, or its `data-dci` id. */
export type DciTarget = Element | string;

export interface DciSelectionChange {
  /** The selection as payloads (what the backend would receive). */
  nodes: DciContextNode[];
  elements: Element[];
  added: Element[];
  removed: Element[];
  primary: Element | null;
}

/** Events for `dci.on(name, fn)`. */
export interface DciEvents {
  selectionchange: DciSelectionChange;
  selectionlimit: SelectionLimit;
  hover: InteractionEvents['hover'];
  chatopen: undefined;
  chatclose: undefined;
  /** A user message was sent, or an assistant reply finished (done, error or stop). */
  message: ChatMessage;
  actionerror: ActionError;
  sessionchange: SessionChange;
}

export interface DciSelectionApi {
  /** The selection as payloads, in selection order. */
  get(): DciContextNode[];
  elements(): Element[];
  primary(): Element | null;
  set(targets: DciTarget | Iterable<DciTarget>): void;
  add(targets: DciTarget | Iterable<DciTarget>): void;
  remove(targets: DciTarget | Iterable<DciTarget>): void;
  toggle(target: DciTarget): void;
  has(target: DciTarget): boolean;
  clear(): void;
  /** Select every same-type sibling of `node` (default: the primary node). */
  selectSameType(node?: DciTarget | null, options?: SelectSameTypeOptions): Element[];
  /** Same as `get()`. */
  toContext(): DciContextNode[];
}

export interface DciChatApi {
  open(): void;
  close(): void;
  /** Send `prompt` (default: the draft). Resolves `false` when nothing was sent. */
  send(prompt?: string, options?: SendOptions): Promise<boolean>;
  stop(): void;
  retry(): Promise<boolean>;
  state(): ChatState;
  subscribe(fn: (state: ChatState) => void): () => void;
  /** The headless controller, for custom UIs. */
  readonly controller: ChatController;
}

export interface DciInstance {
  readonly selection: DciSelectionApi;
  readonly chat: DciChatApi;
  readonly session: Session;
  /** The resolved config (defaults merged in). */
  readonly config: Readonly<DciConfig>;
  readonly tree: DciTree;
  /** Handle a `client-action` from the backend. Returns an unsubscribe function. */
  onAction(name: string, handler: ActionHandler): () => void;
  on<K extends keyof DciEvents>(type: K, fn: (event: DciEvents[K]) => void): () => void;
  /** Change options at runtime; only the affected parts are rebuilt. */
  update(patch: DciConfig): void;
  /** Detach gestures and the chat UI (the selection and conversation are kept). */
  disable(): void;
  enable(): void;
  isEnabled(): boolean;
  /** The exact request the next send would make (after `beforeSend`), or `false`. */
  previewRequest(prompt?: string, options?: SendOptions): Promise<DciRequest | false>;
  destroy(): void;
}

// What each option affects when it changes in `update()`.
const SELECTION_KEYS = [
  'root',
  'attribute',
  'infer',
  'maxSelection',
  'includeAncestors',
  'ancestorData',
  'fallback',
  'maxTextLength',
] as const;
const TRANSPORT_KEYS = ['endpoint', 'headers', 'fetch', 'credentials', 'transport'] as const;
const INTERACTION_KEYS = [
  'modifier',
  'bindings',
  'overlay',
  'clearOnEmptyClick',
  'passthroughClicks',
  'windowSelectLevel',
  'gestures',
  'theme',
  'container',
] as const;
/** Chat options the controller reads per send: changing them rebuilds nothing. */
const LIVE_CHAT_KEYS: Array<keyof DciChatConfig> = [
  'contextMode',
  'concurrency',
  'confirmBeforeSend',
];

function check(config: DciConfig) {
  if (!isDev()) return;
  const { errors, warnings } = validateConfig(config);
  warnings.forEach((w) => devWarn(w));
  if (errors.length) throw new Error(`[dci] Invalid config:\n- ${errors.join('\n- ')}`);
}

/**
 * One call that wires everything together: parser, tree, selection,
 * gestures, overlay, chat controller and UI, transport, session and client
 * actions. Every piece is also exported on its own for custom setups.
 */
export function createDci(input: DciConfig): DciInstance {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    throw new Error(
      '[dci] createDci() needs a browser (window is undefined). Call it on the client, e.g. in useEffect.',
    );
  let config = mergeConfig(DEFAULTS as DciConfig, input);
  check(config);

  const events = createEmitter<DciEvents>();
  const bus = createEmitter<InteractionEvents>();
  const offHover = bus.on('hover', (e) => events.emit('hover', e));
  const session = createSession(config.session);
  const offSession = session.onChange((c) => events.emit('sessionchange', c));
  /** Chat subscribers live here, so they survive a controller rebuild. */
  const chatListeners = new Set<(state: ChatState) => void>();
  const handlers: Array<{ name: string; handler: ActionHandler; off?: () => void }> = [];

  let enabled = true;
  let destroyed = false;
  let cachedTransport: Transport | null = null;
  let selection!: SelectionStore;
  let registry!: ActionRegistry;
  let controller!: ChatController;
  let interactions: Interactions | null = null;
  let chatUi: ChatUi | null = null;
  let tree!: DciTree;
  const cleanups = { selection: [] as Array<() => void>, controller: [] as Array<() => void> };

  const chatConfig = () => config.chat ?? {};

  function contextOptions(): ContextOptions {
    const { root, attribute, infer, includeAncestors, ancestorData, fallback, maxTextLength } =
      config;
    return {
      ...(root ? { root } : {}),
      ...(attribute ? { attribute } : {}),
      ...(infer ? { infer } : {}),
      ...(includeAncestors !== undefined ? { includeAncestors } : {}),
      ...(ancestorData ? { ancestorData } : {}),
      ...(fallback !== undefined ? { fallback } : {}),
      ...(maxTextLength !== undefined ? { maxTextLength } : {}),
    };
  }
  const selectionOptions = (): SelectionOptions => ({
    ...contextOptions(),
    ...(config.maxSelection !== undefined ? { maxSelection: config.maxSelection } : {}),
  });

  // Requests always go through the current config, so `update()` can swap it.
  function currentTransport(): Transport {
    if (config.transport) return config.transport;
    if (!cachedTransport) {
      if (!config.endpoint) throw new Error('[dci] `endpoint` or `transport` is required.');
      cachedTransport = createSSETransport({
        endpoint: config.endpoint,
        ...(config.headers ? { headers: config.headers } : {}),
        ...(config.fetch ? { fetch: config.fetch } : {}),
        ...(config.credentials ? { credentials: config.credentials } : {}),
      });
    }
    return cachedTransport;
  }
  const transport: Transport = { send: (req, opts) => currentTransport().send(req, opts) };

  // ── layers ────────────────────────────────────────────────────────────
  function resolveTargets(targets: DciTarget | Iterable<DciTarget>): Element[] {
    const list: DciTarget[] =
      typeof targets === 'string' || targets instanceof Element ? [targets] : [...targets];
    const ids = list.filter((t): t is string => typeof t === 'string');
    const byId = new Map<string, Element[]>();
    if (ids.length) {
      const attribute = config.attribute ?? DEFAULTS.attribute;
      for (const el of (config.root ?? document.body).querySelectorAll(`[${attribute}]`)) {
        const id = readDci(el, { attribute })?.id;
        if (id !== undefined && ids.includes(id)) byId.set(id, [...(byId.get(id) ?? []), el]);
      }
    }
    return list.flatMap((t) => (typeof t === 'string' ? (byId.get(t) ?? []) : [t]));
  }

  function buildSelection(carry: Element[] = []) {
    cleanups.selection.forEach((off) => off());
    selection = createSelectionStore(selectionOptions());
    tree = createDciTree(contextOptions());
    const root = config.root ?? document.body;
    cleanups.selection = [
      selection.subscribe((change) =>
        events.emit('selectionchange', { ...change, nodes: selection.toContext() }),
      ),
      selection.on('selectionlimit', (e) => events.emit('selectionlimit', e)),
      () => selection.destroy(),
    ];
    const kept = carry.filter((el) => el.isConnected && root.contains(el) && tree.nearestNode(el));
    if (kept.length) selection.set(kept);
  }

  function buildRegistry() {
    registry = createActionRegistry({
      selection,
      ...(config.root ? { root: config.root } : {}),
      ...(config.attribute ? { attribute: config.attribute } : {}),
      overlay: { flash: (el) => bus.emit('flash', el) },
      builtins: config.builtinActions ?? true,
      onError: (e) => events.emit('actionerror', e),
    });
    for (const h of handlers) h.off = registry.on(h.name, h.handler);
  }

  function buildController() {
    cleanups.controller.forEach((off) => off());
    controller = createChatController({
      transport,
      selection,
      session,
      // A proxy, so the registry can be rebuilt under a live controller.
      actions: {
        on: (name, handler) => registry.on(name, handler),
        has: (name) => registry.has(name),
        dispatch: (name, args) => registry.dispatch(name, args),
      },
      contextOptions: contextOptions(),
      // Read at send time, so `update()` applies without a rebuild.
      get contextMode() {
        return chatConfig().contextMode ?? 'turn';
      },
      get concurrency() {
        return chatConfig().concurrency ?? 'block';
      },
      get confirmBeforeSend() {
        return chatConfig().confirmBeforeSend ?? false;
      },
      beforeSend: (request) => (config.beforeSend ? config.beforeSend(request) : request),
      page: () => config.page?.() ?? { url: location.href, title: document.title },
      onCustomEvent: (e) => config.onCustomEvent?.(e),
    });
    // `message`: user messages when sent, assistant replies when finished.
    const seen = new Set<string>();
    let wasOpen = controller.getState().open;
    cleanups.controller = [
      controller.subscribe((state) => {
        for (const fn of [...chatListeners]) fn(state);
        if (state.open !== wasOpen) {
          wasOpen = state.open;
          events.emit(state.open ? 'chatopen' : 'chatclose', undefined);
        }
        for (const m of state.messages) {
          if (seen.has(m.id) || (m.role === 'assistant' && !m.complete)) continue;
          seen.add(m.id);
          events.emit('message', m);
        }
      }),
      () => controller.destroy(),
    ];
  }

  function destroyInteractions() {
    chatUi?.destroy();
    chatUi = null;
    interactions?.destroy();
    interactions = null;
  }

  function buildInteractions() {
    destroyInteractions();
    if (!enabled) return;
    const overlay = config.overlay;
    interactions = createInteractions({
      ...selectionOptions(),
      selection,
      bus,
      ...(config.modifier ? { modifier: config.modifier } : {}),
      ...(config.bindings ? { bindings: config.bindings } : {}),
      overlay:
        overlay === false
          ? false
          : {
              ...overlay,
              ...(config.theme ? { theme: config.theme } : {}),
              ...(config.container ? { container: config.container } : {}),
            },
      ...(config.clearOnEmptyClick !== undefined
        ? { clearOnEmptyClick: config.clearOnEmptyClick }
        : {}),
      ...(config.passthroughClicks !== undefined
        ? { passthroughClicks: config.passthroughClicks }
        : {}),
      ...(config.windowSelectLevel ? { windowSelectLevel: config.windowSelectLevel } : {}),
      ...(config.gestures ? { gestures: config.gestures } : {}),
      // The first Esc closes the chat; the next clears the selection.
      onEscape: () => chatUi?.escape() ?? false,
    });
    buildChatUi();
  }

  function buildChatUi() {
    chatUi?.destroy();
    chatUi = null;
    const chat = chatConfig();
    if (!enabled || !interactions || chat.ui === false) return;
    // The rest of `chat` is controller or on/off state, not UI options.
    const uiOptions = Object.fromEntries(
      Object.entries(chat).filter(
        ([k]) => k !== 'ui' && !LIVE_CHAT_KEYS.includes(k as keyof DciChatConfig),
      ),
    ) as Omit<DciChatConfig, 'ui' | 'contextMode' | 'concurrency' | 'confirmBeforeSend'>;
    chatUi = createChatUi({
      ...uiOptions,
      controller,
      interactions: { selection, tree, bus },
      ...(config.actions ? { actions: config.actions } : {}),
      ...(config.attribute ? { attribute: config.attribute } : {}),
      ...(config.infer ? { infer: config.infer } : {}),
      ...(config.theme ? { theme: config.theme } : {}),
      ...(config.container ? { container: config.container } : {}),
    });
  }

  buildSelection();
  buildRegistry();
  buildController();
  buildInteractions();

  // ── update ────────────────────────────────────────────────────────────
  function update(patch: DciConfig) {
    if (destroyed) return;
    const prev = config;
    const next = mergeConfig(config, patch);
    check(next);
    config = next;
    const changed = (keys: readonly (keyof DciConfig)[]) =>
      keys.some((k) => !sameValue(prev[k], next[k]));

    if (changed(TRANSPORT_KEYS)) cachedTransport = null;
    if (changed(['session']))
      devWarn('`session` cannot change after createDci(); use dci.session.reset().');

    if (changed(SELECTION_KEYS)) {
      // Everything reads the selection: rebuild all but the session.
      const carry = selection.get();
      destroyInteractions();
      cleanups.controller.forEach((off) => off());
      buildSelection(carry);
      buildRegistry();
      buildController();
      buildInteractions();
      const fresh = controller.getState();
      for (const fn of [...chatListeners]) fn(fresh);
      return;
    }
    if (changed(['builtinActions'])) buildRegistry();
    if (changed(INTERACTION_KEYS)) {
      buildInteractions();
      return;
    }
    const prevChat = prev.chat ?? {};
    const nextChat = next.chat ?? {};
    const uiKeys = new Set([...Object.keys(prevChat), ...Object.keys(nextChat)]) as Set<
      keyof DciChatConfig
    >;
    const uiChanged = [...uiKeys].filter(
      (k) => !LIVE_CHAT_KEYS.includes(k) && !sameValue(prevChat[k], nextChat[k]),
    );
    if (uiChanged.length === 1 && uiChanged[0] === 'mode' && chatUi) {
      chatUi.setMode(nextChat.mode as ChatMode);
    } else if (uiChanged.length || !sameValue(prev.actions, next.actions)) {
      buildChatUi();
    }
  }

  // ── public API ────────────────────────────────────────────────────────
  const selectionApi: DciSelectionApi = {
    get: () => selection.toContext(),
    toContext: () => selection.toContext(),
    elements: () => selection.get(),
    primary: () => selection.primary(),
    set: (t) => selection.set(resolveTargets(t)),
    add: (t) => selection.add(resolveTargets(t)),
    remove: (t) => selection.remove(resolveTargets(t)),
    toggle(t) {
      for (const el of resolveTargets(t)) selection.toggle(el);
    },
    has: (t) => resolveTargets(t).some((el) => selection.has(el)),
    clear: () => selection.clear(),
    selectSameType(node, options) {
      const target =
        node === undefined || node === null ? selection.primary() : resolveTargets(node)[0];
      return selectSameType(
        { tree, selection, options: selectionOptions() },
        target ?? null,
        options,
      );
    },
  };

  const chatApi: DciChatApi = {
    open: () => controller.open(),
    close: () => controller.close(),
    send: (prompt, options) => controller.send(prompt, options),
    stop: () => controller.stop(),
    retry: () => controller.retry(),
    state: () => controller.getState(),
    subscribe(fn) {
      chatListeners.add(fn);
      return () => chatListeners.delete(fn);
    },
    get controller() {
      return controller;
    },
  };

  return {
    selection: selectionApi,
    chat: chatApi,
    session,
    get config() {
      return config;
    },
    get tree() {
      return tree;
    },
    onAction(name, handler) {
      const entry: (typeof handlers)[number] = { name, handler };
      entry.off = registry.on(name, handler);
      handlers.push(entry);
      return () => {
        entry.off?.();
        const i = handlers.indexOf(entry);
        if (i >= 0) handlers.splice(i, 1);
      };
    },
    on: (type, fn) => events.on(type, fn),
    update,
    disable() {
      if (!enabled || destroyed) return;
      enabled = false;
      destroyInteractions();
    },
    enable() {
      if (enabled || destroyed) return;
      enabled = true;
      buildInteractions();
    },
    isEnabled: () => enabled && !destroyed,
    previewRequest: (prompt, options) => controller.previewRequest(prompt, options),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      destroyInteractions();
      cleanups.controller.forEach((off) => off());
      cleanups.selection.forEach((off) => off());
      offHover();
      offSession();
      bus.clear();
      events.clear();
      chatListeners.clear();
    },
  };
}
