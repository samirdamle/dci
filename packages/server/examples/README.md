# `@samirdamle/dci-server` examples

Each example serves a DCI endpoint at `/api/dci`. They answer with a canned reply so they run
without an API key; replace `answer()` with your LLM or agent call (the demo app in M7 shows Claude).

| File            | Framework                                    |
| --------------- | -------------------------------------------- |
| `node-http.ts`  | Node's built-in `http` server                |
| `express.ts`    | Express (mount **without** `express.json()`) |
| `hono.ts`       | Hono (Web-standard, also works on edge/Bun)  |
| `next-route.ts` | Next.js App Router route handler             |

The handler shape is the same everywhere:

```ts
import { dciHandler, formatContextForPrompt } from '@samirdamle/dci-server';

export const handler = dciHandler(async (req, stream, { signal }) => {
  const context = formatContextForPrompt(req.context); // XML block for the prompt
  stream.toolStart('lookup', 'search', 'Looking things up…');
  stream.toolEnd('lookup', true);
  stream.text('…streamed answer…');
  stream.clientAction('highlight', { ids: req.context.map((n) => n.id) });
  // `done` is sent for you, even if this function throws.
});
```

These files are documentation: they are not type-checked in CI, because their frameworks aren't
dependencies of `@samirdamle/dci-server`.
