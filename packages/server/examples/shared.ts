import { dciHandler, formatContextForPrompt } from '@dci/server';

/** Stand-in for your LLM call: yields a reply word by word. */
async function* answer(prompt: string, context: string, signal: AbortSignal) {
  const reply = `You asked "${prompt}" about:\n${context}`;
  for (const word of reply.split(/(\s+)/)) {
    if (signal.aborted) return;
    await new Promise((r) => setTimeout(r, 20));
    yield word;
  }
}

export const handler = dciHandler(async (req, stream, { signal }) => {
  stream.toolStart('ctx', 'read_context', `Reading ${req.context.length} selected item(s)…`);
  const context = formatContextForPrompt(req.context);
  stream.toolEnd('ctx', true);

  for await (const delta of answer(req.prompt, context, signal)) stream.text(delta);

  // Point back at what we talked about.
  const ids = req.context.flatMap((n) => (n.id ? [n.id] : []));
  if (ids.length) stream.clientAction('highlight', { ids });
});
