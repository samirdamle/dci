# `@samirdamle/dci-server` examples

Each example serves a DCI endpoint at `/api/dci`. They share one handler in `shared.ts`, which
answers through a placeholder `callModel()` so they run without an API key. Replace its body with
your LLM or agent call; [getting started](../../../docs/getting-started.md#3-a-minimal-backend-with-claude)
shows one with Claude, and the demo app has a full agent.

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
  // Your model call goes here; stream each piece of its reply:
  stream.text('Context and prompt passed on to model. ');
  stream.text('Analysis of the context sent back from model.');
  stream.clientAction('highlight', { ids: req.context.map((n) => n.id) });
  // `done` is sent for you, even if this function throws.
});
```

These files are documentation: they are not type-checked in CI, because their frameworks aren't
dependencies of `@samirdamle/dci-server`.
