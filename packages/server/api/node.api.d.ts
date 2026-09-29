import { IncomingMessage, ServerResponse } from 'node:http';
import { W as WebHandler } from './handler-abNagw90.js';
import '@dci/protocol';

/**
 * Adapters for Node's `http` module, Express and Connect.
 *
 * @packageDocumentation
 * @module @dci/server/node
 */

/**
 * Serve a Web-standard handler from Node's `http` server, Express or
 * Connect. Mount it without a JSON body parser: the handler reads the body.
 */
declare function toNodeHandler(handler: WebHandler): (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export { toNodeHandler };
