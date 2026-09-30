import type { DciEvent, DciRequest } from '@samirdamle/dci-protocol';

/** Name of the runtime port a content script opens for each chat request. */
export const PORT_NAME = 'dci';

/** Content script → worker, once per port. */
export interface RequestMessage {
  type: 'request';
  request: DciRequest;
}

/** Worker → content script, one per event; the worker disconnects after `done`. */
export interface EventMessage {
  type: 'event';
  event: DciEvent;
}

/** Where DCI stands in a tab: shown on the toolbar badge and in the popup. */
export type TabState = 'on' | 'off' | 'page-has-dci';

/** Content script → worker, whenever the tab's state changes. */
export interface StateMessage {
  type: 'dci:state';
  state: TabState;
}

/** Popup → worker: turn DCI on or off in a tab. */
export interface ToggleMessage {
  type: 'dci:toggle';
  tabId: number;
}

/** Options page → worker: send a test question through the chosen backend. */
export interface TestMessage {
  type: 'dci:test';
}

export type TestResult = { ok: true; text: string } | { ok: false; error: string };

export type WorkerMessage = StateMessage | ToggleMessage | TestMessage;

const has = (msg: unknown, type: string) => (msg as { type?: unknown } | null)?.type === type;

export const isStateMessage = (msg: unknown): msg is StateMessage => has(msg, 'dci:state');
export const isToggleMessage = (msg: unknown): msg is ToggleMessage => has(msg, 'dci:toggle');
export const isTestMessage = (msg: unknown): msg is TestMessage => has(msg, 'dci:test');

/** `storage.session` key holding a tab's `TabState` (for the popup). */
export const tabStateKey = (tabId: number) => `tab:${tabId}`;
