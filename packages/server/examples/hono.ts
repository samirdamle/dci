import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { handler } from './shared';

const app = new Hono();

// Hono uses Web-standard Request/Response, so the handler plugs in directly.
app.post('/api/dci', (c) => handler(c.req.raw));

serve({ fetch: app.fetch, port: 3001 });
