import { DciConfig, DciInstance, ChatState, SendOptions, DciContextNode, DciSelectionApi, ActionHandler, DciAttrValue } from '@samirdamle/dci-core';
export { DciAttrValue, DciConfig, DciInstance } from '@samirdamle/dci-core';
import * as react from 'react';
import { RefObject, ReactNode } from 'react';

interface DciProviderProps {
    /**
     * Passed to `createDci()`. Later changes are applied with `dci.update()`;
     * only a new `endpoint` or `transport` recreates the instance. Keep it
     * stable (module scope or `useMemo`) so unchanged renders do no work.
     */
    config: DciConfig;
    /**
     * Scope DCI to an element rendered inside the provider (overrides
     * `config.root`); the ref is read when the instance is created.
     */
    root?: RefObject<Element | null>;
    children?: ReactNode;
}
/**
 * Creates the DCI instance in an effect, so it is SSR safe (nothing runs on
 * the server) and StrictMode safe (the double mount destroys the first).
 */
declare function DciProvider({ config, root, children }: DciProviderProps): react.JSX.Element;
/** The DCI instance, or `null` before it mounts (and during SSR). */
declare function useDci(): DciInstance | null;

interface SelectionSnapshot {
    /** The selection as payloads (what the backend receives). */
    nodes: readonly DciContextNode[];
    elements: readonly Element[];
    primary: Element | null;
}
type UseSelectionResult = SelectionSnapshot & Pick<DciSelectionApi, 'set' | 'add' | 'remove' | 'toggle' | 'has' | 'clear' | 'selectSameType'>;
/** The live selection plus methods to change it. Empty until the provider mounts. */
declare function useSelection(): UseSelectionResult;
/** Chat state before the provider mounts (and during SSR). */
declare const IDLE_CHAT_STATE: ChatState;
interface UseChatResult extends ChatState {
    /** Open or close the chat (`open` holds the current value). */
    setOpen(open: boolean): void;
    setDraft(text: string): void;
    send(prompt?: string, options?: SendOptions): Promise<boolean>;
    stop(): void;
    retry(): Promise<boolean>;
    removeContext(node: DciContextNode): void;
    confirmSend(accept: boolean, options?: {
        dontAskAgain?: boolean;
    }): void;
}
/** Chat state and actions, for building your own chat UI in React. */
declare function useChat(): UseChatResult;
/**
 * Handle a `client-action` from the backend while the component is mounted.
 * The latest `handler` is always called, so it can close over fresh props.
 */
declare function useDciAction(name: string, handler: ActionHandler): void;

interface DciChatProps {
    /** Render your own chat from the live chat state and actions. */
    render: (chat: UseChatResult) => ReactNode;
}
/**
 * Replace the built-in chat UI with your own React UI. While mounted it
 * switches the instance to headless (`chat.ui: false`); on unmount the
 * previous setting comes back.
 */
declare function DciChat({ render }: DciChatProps): react.JSX.Element;

/**
 * React bindings for DCI: `DciProvider`, hooks and the `dci()` annotation helper.
 *
 * @packageDocumentation
 * @module @samirdamle/dci-react
 */

/** Package version. */
declare const VERSION: string;

/**
 * Annotation props for JSX: `<tr {...dci({ id, type: 'invoice', label, amount })}>`.
 * Keys are sorted, so the attribute only changes when the data does.
 */
declare const dci: (value: DciAttrValue) => {
    "data-dci": string;
};

export { DciChat, type DciChatProps, DciProvider, type DciProviderProps, IDLE_CHAT_STATE, type SelectionSnapshot, type UseChatResult, type UseSelectionResult, VERSION, dci, useChat, useDci, useDciAction, useSelection };
