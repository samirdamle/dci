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

/** Where DCI stands in a tab: shown on the toolbar badge (and later the popup). */
export type TabState = 'on' | 'off' | 'page-has-dci';

/** Content script → worker, whenever the tab's state changes. */
export interface StateMessage {
  type: 'dci:state';
  state: TabState;
}

export function isStateMessage(msg: unknown): msg is StateMessage {
  return (msg as StateMessage | undefined)?.type === 'dci:state';
}
