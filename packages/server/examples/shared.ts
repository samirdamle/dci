import { dciHandler, formatContextForPrompt } from '@samirdamle/dci-server';

/**
 * Placeholder model, so the examples run without an API key.
 *
 * Replace the body with a call to your LLM or agent (Anthropic, OpenAI, a
 * local model, an agent framework…) and yield its reply as it streams in.
 * Pass `signal` on to your SDK so the user's Stop button cancels the call.
 */
async function* callModel(prompt: string, context: string, signal: AbortSignal) {
  const replies = [
    `Context (${context.length} characters) and prompt ("${prompt}") passed on to model.\n\n`,
    'Analysis of the context sent back from model.',
  ];
  for (const reply of replies) {
    // Stream word by word, like a real model.
    for (const word of reply.split(/(\s+)/)) {
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, 20));
      yield word;
    }
  }
}

export const handler = dciHandler(async (req, stream, { signal }) => {
  // 1. The selected items, formatted as an XML block for the prompt.
  stream.toolStart('ctx', 'read_context', `Reading ${req.context.length} selected item(s)…`);
  const context = formatContextForPrompt(req.context);
  stream.toolEnd('ctx', true);

  // 2. Call your model here, and stream its reply back as it arrives.
  for await (const delta of callModel(req.prompt, context, signal)) stream.text(delta);

  // 3. Optional: point back at what the answer talked about.
  const ids = req.context.flatMap((n) => (n.id ? [n.id] : []));
  if (ids.length) stream.clientAction('highlight', { ids });
});
