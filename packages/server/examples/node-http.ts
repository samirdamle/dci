import { createServer } from 'node:http';
import { toNodeHandler } from '@samirdamle/dci-server/node';
import { handler } from './shared';

const serve = toNodeHandler(handler);

createServer((req, res) => {
  if (req.url === '/api/dci') return void serve(req, res);
  res.writeHead(404).end();
}).listen(3001, () => console.log('DCI endpoint on http://localhost:3001/api/dci'));
