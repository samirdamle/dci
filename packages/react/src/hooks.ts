import type {
  ActionHandler,
  ChatState,
  DciContextNode,
  DciInstance,
  DciSelectionApi,
  DciTarget,
  SendOptions,
} from '@dci/core';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useDci } from './provider';

export interface SelectionSnapshot {
  /** The selection as payloads (what the backend receives). */
  nodes: readonly DciContextNode[];
  elements: readonly Element[];
  primary: Element | null;
}

const EMPTY_SELECTION: SelectionSnapshot = { nodes: [], elements: [], primary: null };

/** One cached snapshot per instance, replaced on each `selectionchange`. */
const selectionStores = new WeakMap<
  DciInstance,
  { snapshot: SelectionSnapshot; subscribe: (fn: () => void) => () => void }
>();

function selectionStore(dci: DciInstance) {
  let store = selectionStores.get(dci);
  if (!store) {
    const read = (): SelectionSnapshot => ({
      nodes: dci.selection.get(),
      elements: dci.selection.elements(),
      primary: dci.selection.primary(),
    });
    const entry = {
      snapshot: read(),
      subscribe: (fn: () => void) =>
        dci.on('selectionchange', () => {
          entry.snapshot = read();
          fn();
        }),
    };
    selectionStores.set(dci, entry);
    store = entry;
  }
  return store;
}

const noop = () => {};
const noSubscribe = () => noop;

export type UseSelectionResult = SelectionSnapshot &
  Pick<DciSelectionApi, 'set' | 'add' | 'remove' | 'toggle' | 'has' | 'clear' | 'selectSameType'>;

/** The live selection plus methods to change it. Empty until the provider mounts. */
export function useSelection(): UseSelectionResult {
  const dci = useDci();
  const store = dci ? selectionStore(dci) : null;
  const snapshot = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => (store ? store.snapshot : EMPTY_SELECTION),
    () => EMPTY_SELECTION,
  );
  return useMemo(
    () => ({
      ...snapshot,
      set: (t: DciTarget | Iterable<DciTarget>) => dci?.selection.set(t),
      add: (t: DciTarget | Iterable<DciTarget>) => dci?.selection.add(t),
      remove: (t: DciTarget | Iterable<DciTarget>) => dci?.selection.remove(t),
      toggle: (t: DciTarget) => dci?.selection.toggle(t),
      has: (t: DciTarget) => dci?.selection.has(t) ?? false,
      clear: () => dci?.selection.clear(),
      selectSameType: (...args: Parameters<DciSelectionApi['selectSameType']>) =>
        dci?.selection.selectSameType(...args) ?? [],
    }),
    [dci, snapshot],
  );
}

/** Chat state before the provider mounts (and during SSR). */
export const IDLE_CHAT_STATE: ChatState = {
  status: 'idle',
  open: false,
  messages: [],
  pendingContext: [],
  draft: '',
  confirm: null,
  notice: null,
  limit: null,
};

export interface UseChatResult extends ChatState {
  /** Open or close the chat (`open` holds the current value). */
  setOpen(open: boolean): void;
  setDraft(text: string): void;
  send(prompt?: string, options?: SendOptions): Promise<boolean>;
  stop(): void;
  retry(): Promise<boolean>;
  removeContext(node: DciContextNode): void;
  confirmSend(accept: boolean, options?: { dontAskAgain?: boolean }): void;
}

/** Chat state and actions, for building your own chat UI in React. */
export function useChat(): UseChatResult {
  const dci = useDci();
  const subscribe = useCallback((fn: () => void) => (dci ? dci.chat.subscribe(fn) : noop), [dci]);
  const state = useSyncExternalStore(
    subscribe,
    () => (dci ? dci.chat.state() : IDLE_CHAT_STATE),
    () => IDLE_CHAT_STATE,
  );
  return useMemo(() => {
    const c = () => dci?.chat.controller;
    return {
      ...state,
      setOpen: (open: boolean) => (open ? c()?.open() : c()?.close()),
      setDraft: (text: string) => c()?.setDraft(text),
      send: (prompt?: string, options?: SendOptions) =>
        c()?.send(prompt, options) ?? Promise.resolve(false),
      stop: () => c()?.stop(),
      retry: () => c()?.retry() ?? Promise.resolve(false),
      removeContext: (node: DciContextNode) => c()?.removeContext(node),
      confirmSend: (accept: boolean, options?: { dontAskAgain?: boolean }) =>
        c()?.confirm(accept, options),
    };
  }, [dci, state]);
}

/**
 * Handle a `client-action` from the backend while the component is mounted.
 * The latest `handler` is always called, so it can close over fresh props.
 */
export function useDciAction(name: string, handler: ActionHandler): void {
  const dci = useDci();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!dci) return;
    return dci.onAction(name, (args, ctx) => latest.current(args, ctx));
  }, [dci, name]);
}
