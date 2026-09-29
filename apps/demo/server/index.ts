import { createServer } from 'node:http';
import { dciHandler, type DciHandlerFn } from '@dci/server';
import { toNodeHandler } from '@dci/server/node';
import { createMockResponder } from '../src/agent/mock-responder';
import { createClaudeAgent, DEFAULT_MODEL } from './claude-agent';
import { createSessionStore } from './sessions';

/**
 * The demo backend: `POST /api/dci` (the DCI protocol) and `GET /api/mode`.
 * Claude mode when `ANTHROPIC_API_KEY` is set; mock mode otherwise, or with
 * `DCI_DEMO_MOCK=1`. Vite proxies `/api` here in development.
 */
const env = process.env;
const mode = env.ANTHROPIC_API_KEY && env.DCI_DEMO_MOCK !== '1' ? 'claude' : 'mock';
const model = env.DCI_DEMO_MODEL || DEFAULT_MODEL;
const port = Number(env.DCI_DEMO_PORT ?? 8787);
const sessions = createSessionStore();

const mockHandler: DciHandlerFn = async (req, stream, { signal }) => {
  const respond = createMockResponder({
    store: sessions.get(req.sessionId).store,
    delayMs: Number(env.DCI_DEMO_MOCK_DELAY ?? 12),
  });
  for await (const event of respond(req, signal)) stream.send(event);
};

const handle = toNodeHandler(
  dciHandler(mode === 'claude' ? createClaudeAgent({ sessions, model }) : mockHandler),
);

createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/api/mode' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ mode, ...(mode === 'claude' ? { model } : {}) }));
    return;
  }
  if (path === '/api/dci') {
    void handle(req, res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}).listen(port, () => {
  console.log(
    `[dci-demo] backend on http://localhost:${port} in ${mode} mode${mode === 'claude' ? ` (${model})` : ''}`,
  );
});
