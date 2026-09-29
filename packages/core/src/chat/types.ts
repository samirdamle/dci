import type { DciContextNode, DciRequest } from '@dci/protocol';

export type ChatStatus = 'idle' | 'sending' | 'streaming' | 'error';

export interface ToolStatus {
  id: string;
  name: string;
  label?: string;
  state: 'running' | 'ok' | 'failed';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Context sent with a user message. */
  context?: DciContextNode[];
  /** Suggested-action id, when the message came from an action. */
  action?: string;
  tools: ToolStatus[];
  error?: { message: string; code?: string };
  /** The user pressed Stop before the answer finished. */
  stopped?: boolean;
  /** The assistant finished (done, error or stop). */
  complete?: boolean;
}

export interface ChatState {
  status: ChatStatus;
  open: boolean;
  messages: readonly ChatMessage[];
  /** Context that will go with the next message (shown as chips). */
  pendingContext: readonly DciContextNode[];
  draft: string;
  /** Waiting for the user to confirm sending (see `confirmBeforeSend`). */
  confirm: { request: DciRequest } | null;
  /** Transient notice, e.g. a send cancelled by `beforeSend`. */
  notice: 'cancelled' | null;
  /** Set when the last selection hit `maxSelection`. */
  limit: { shown: number; total: number } | null;
}
