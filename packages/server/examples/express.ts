import express from 'express';
import { toNodeHandler } from '@samirdamle/dci-server/node';
import { handler } from './shared';

const app = express();

// Don't put express.json() in front of this route: the handler reads the body itself.
app.post('/api/dci', toNodeHandler(handler));

app.listen(3001, () => console.log('DCI endpoint on http://localhost:3001/api/dci'));
