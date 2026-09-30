/**
 * React bindings for DCI: `DciProvider`, hooks and the `dci()` annotation helper.
 *
 * @packageDocumentation
 * @module @samirdamle/dci-react
 */

import { dciAttr, type DciAttrValue } from '@samirdamle/dci-core';

/** Package version. */
export const VERSION = '1.0.0';

export { DciProvider, useDci, type DciProviderProps } from './provider';
export {
  IDLE_CHAT_STATE,
  useChat,
  useDciAction,
  useSelection,
  type SelectionSnapshot,
  type UseChatResult,
  type UseSelectionResult,
} from './hooks';
export { DciChat, type DciChatProps } from './dci-chat';

/**
 * Annotation props for JSX: `<tr {...dci({ id, type: 'invoice', label, amount })}>`.
 * Keys are sorted, so the attribute only changes when the data does.
 */
export const dci = (value: DciAttrValue): { 'data-dci': string } => dciAttr(value);

export type { DciAttrValue, DciConfig, DciInstance } from '@samirdamle/dci-core';
