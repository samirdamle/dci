# @dci/protocol

The [DCI](https://github.com/samirdamle/dci) wire protocol: request and event types, validation,
and an SSE encoder and streaming decoder. No dependencies; works in browsers, Node, Deno, Bun and
edge runtimes. `@dci/core` and `@dci/server` use it; you only need it directly to build your own
client or server.

```sh
npm install @dci/protocol
```

```ts
import { createSSEDecoder, encodeEvent, validateRequest } from '@dci/protocol';

const check = validateRequest({
  v: 1,
  sessionId: 's1',
  prompt: 'Hi',
  context: [],
  page: { url: '/', title: 'Home' },
});
if (!check.ok) throw new Error(check.issues.join('; '));

const frame = encodeEvent({ type: 'text-delta', text: 'Hello' }); // "event: text-delta\ndata: …\n\n"
const events = createSSEDecoder().push(frame); // [{ type: 'text-delta', text: 'Hello' }]
```

The full specification, including a backend in Python, is in
[docs/protocol.md](https://github.com/samirdamle/dci/blob/main/docs/protocol.md).

MIT licensed.
