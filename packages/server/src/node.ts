/**
 * Adapters for Node's `http` module, Express and Connect.
 *
 * @packageDocumentation
 * @module @dci/server/node
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { WebHandler } from './handler';

/**
 * Serve a Web-standard handler from Node's `http` server, Express or
 * Connect. Mount it without a JSON body parser: the handler reads the body.
 */
export function toNodeHandler(handler: WebHandler) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else if (value !== undefined) headers.set(key, value);
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(url, {
      method: req.method ?? 'GET',
      headers,
      signal: controller.signal,
      ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}),
    } as RequestInit);

    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.flushHeaders();
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    controller.signal.addEventListener('abort', () => void reader.cancel().catch(() => {}));
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch {
      // The client went away; nothing left to write.
    } finally {
      res.end();
    }
  };
}
