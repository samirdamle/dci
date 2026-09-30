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

/**
 * Placeholder model. Replace the body with a call to your LLM or agent
 * (Anthropic, OpenAI, a local model, an agent framework…) and yield its reply
 * as it streams in. Pass `signal` on so Stop cancels the model call.
 */
async function* callModel(
  prompt: string,
  context: string,
  signal: AbortSignal,
): AsyncIterable<string> {
  if (signal.aborted) return;
  yield `Context (${context.length} characters) and prompt ("${prompt}") passed on to model.\n\n`;
  yield 'Analysis of the context sent back from model.';
}

export const POST = dciHandler(async (req, stream, { signal }) => {
  const context = formatContextForPrompt(req.context); // the selected items, for your prompt
  stream.toolStart('t1', 'lookup', 'Looking it up…'); // optional: show progress
  stream.toolEnd('t1', true);
  // Call your model here, and stream its reply back as it arrives.
  for await (const text of callModel(req.prompt, context, signal)) stream.text(text);
  if (signal.aborted) return; // the user pressed Stop
  stream.clientAction('highlight', { ids: req.context.flatMap((n) => (n.id ? [n.id] : [])) });
});
```

For Node's `http` module or Express, wrap it with `toNodeHandler` from `@samirdamle/dci-server/node`.

- [A backend with Claude in ~30 lines](https://github.com/samirdamle/dci/blob/main/docs/getting-started.md#3-a-minimal-backend-with-claude)
- [The protocol](https://github.com/samirdamle/dci/blob/main/docs/protocol.md)
- [Examples](https://github.com/samirdamle/dci/tree/main/packages/server/examples)

MIT licensed.
