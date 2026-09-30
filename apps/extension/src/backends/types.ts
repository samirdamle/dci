import type { DciEvent, DciRequest } from '@samirdamle/dci-protocol';

/**
 * Answers one chat request with a stream of DCI events. Runs in the background
 * worker, so it may hold keys and call any origin the extension may reach.
 * It doesn't need to send `done`: the worker always ends the stream with it.
 */
export type Backend = (request: DciRequest, signal: AbortSignal) => AsyncIterable<DciEvent>;
