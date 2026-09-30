# @samirdamle/dci-server

Helpers for [DCI](https://github.com/samirdamle/dci) endpoints: parse and validate the request,
stream the answer as Server-Sent Events, and always finish the response. Web-standard, so it runs
on Node, Bun, Deno, Next.js route handlers and edge runtimes. No LLM SDK is bundled: calling a
model is your code.

```sh
npm install @samirdamle/dci-server
```

```ts
import { dciHandler, formatContextForPrompt } from '@samirdamle/dci-server';

export const POST = dciHandler(async (req, stream, { signal }) => {
  const context = formatContextForPrompt(req.context); // the selected items, for your prompt
  stream.toolStart('t1', 'lookup', 'Looking it up…');
  stream.toolEnd('t1', true);
  stream.text(`You asked "${req.prompt}" about:\n${context}`); // or stream your model's tokens
  if (signal.aborted) return; // the user pressed Stop
  stream.clientAction('highlight', { ids: req.context.flatMap((n) => (n.id ? [n.id] : [])) });
});
```

For Node's `http` module or Express, wrap it with `toNodeHandler` from `@samirdamle/dci-server/node`.

- [A backend with Claude in ~30 lines](https://github.com/samirdamle/dci/blob/main/docs/getting-started.md#3-a-minimal-backend-with-claude)
- [The protocol](https://github.com/samirdamle/dci/blob/main/docs/protocol.md)
- [Examples](https://github.com/samirdamle/dci/tree/main/packages/server/examples)

MIT licensed.
