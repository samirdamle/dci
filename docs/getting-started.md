# Getting started

This guide goes from nothing to a working integration: users Alt+Click things in your app, ask
about them, and an answer from Claude streams back. It takes three pieces:

1. **Annotations**: mark the elements users talk about with `data-dci`.
2. **The client**: `createDci()` (plain JavaScript) or `<DciProvider>` (React).
3. **An endpoint**: a small server route that calls your model and streams the answer.

## Install

```sh
npm install @samirdamle/dci-core            # plain JavaScript/TypeScript
npm install @samirdamle/dci-react           # React (also installs @samirdamle/dci-core)
npm install @samirdamle/dci-server          # your endpoint (Node, Bun, Deno, edge)
```

## 1. Annotate what users talk about

Add `data-dci` to records and the containers that give them meaning. The short form is just an ID;
the JSON form adds a `type`, a `label` and any data the model should see.

```html
<table data-dci='{"id":"invoices","type":"table","label":"Invoices"}'>
  <tr
    data-dci='{"id":"inv_123","type":"invoice","label":"Invoice #123","amount":420,"status":"overdue"}'
  >
    <td>#123</td>
    <td>Acme Corp</td>
    <td>$420</td>
  </tr>
</table>
```

That's enough to start. The [annotation guide](annotations.md) covers `type` naming, hierarchy and
`private` data.

## 2a. Plain JavaScript: `createDci()`

```ts
import { createDci } from '@samirdamle/dci-core';

const dci = createDci({ endpoint: '/api/dci' });

// Optional: let the backend change your page (see "client actions").
dci.onAction('markPaid', ({ id }) => store.markPaid(String(id)));
```

Hold **Alt** (Option on macOS) and click the invoice row: it's highlighted, a chat opens next to it
and your question goes to `/api/dci` with the row's data. `dci.destroy()` removes everything again.

Building the attribute by hand gets tedious; `dciAttr()` returns `{ 'data-dci': '…' }` with sorted
keys, ready to spread or set:

```ts
import { dciAttr } from '@samirdamle/dci-core';

const row = document.createElement('tr');
const attr = dciAttr({ id: 'inv_123', type: 'invoice', label: 'Invoice #123', amount: 420 });
row.setAttribute('data-dci', attr['data-dci']);
```

## 2b. React: `<DciProvider>` and `dci()`

```tsx
import type { DciConfig } from '@samirdamle/dci-core';
import { dci, DciProvider } from '@samirdamle/dci-react';

// Module scope (or useMemo), so re-renders don't reconfigure DCI.
const config: DciConfig = { endpoint: '/api/dci' };

export function App() {
  return (
    <DciProvider config={config}>
      <InvoiceTable />
    </DciProvider>
  );
}

function InvoiceTable() {
  return (
    <table {...dci({ id: 'invoices', type: 'table', label: 'Invoices' })}>
      <tbody>
        {invoices.map((inv) => (
          <tr
            key={inv.id}
            {...dci({
              id: inv.id,
              type: 'invoice',
              label: `Invoice ${inv.number}`,
              status: inv.status,
            })}
          >
            <td>{inv.number}</td>
            <td>{inv.customer}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

The provider creates DCI in an effect, so it works with SSR (including the Next.js App Router) and
StrictMode. Hooks such as `useSelection()` and `useChat()` are described in the
[configuration and API guide](configuration.md#react).

## 3. A minimal backend with Claude

`dciHandler` from `@samirdamle/dci-server` parses and validates the request, streams whatever you
send and always finishes the response. The model call is yours. To see the whole loop working before
you wire one up, start with a placeholder that streams a canned reply:

```ts
import { dciHandler, formatContextForPrompt } from '@samirdamle/dci-server';

/** Placeholder model: replace the body with a call to your LLM or agent. */
async function* callModel(prompt: string, context: string): AsyncIterable<string> {
  yield `Context (${context.length} characters) and prompt ("${prompt}") passed on to model.\n\n`;
  yield 'Analysis of the context sent back from model.';
}

export const handler = dciHandler(async (req, stream) => {
  // The selected items, as an XML block the model can read.
  const context = formatContextForPrompt(req.context);
  // Call your model here, and stream its reply back as it arrives.
  for await (const text of callModel(req.prompt, context)) stream.text(text);
});
```

Then swap the placeholder for a real model. Here it's Claude through the Anthropic SDK, with the
conversation kept per session:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { dciHandler, formatContextForPrompt } from '@samirdamle/dci-server';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const sessions = new Map<string, Anthropic.MessageParam[]>();

export const handler = dciHandler(async (req, stream, { signal }) => {
  const history = sessions.get(req.sessionId) ?? [];
  sessions.set(req.sessionId, history);
  // The selected items, as an XML block the model can read.
  const context = formatContextForPrompt(req.context);
  history.push({ role: 'user', content: `${context}\n\n${req.prompt}` });

  // The model call: send the conversation to Claude and stream its reply back.
  const response = client.messages.stream(
    {
      model: 'claude-sonnet-5-5',
      max_tokens: 4096,
      system: 'You help users of an invoicing app. Answer about the items they selected.',
      messages: history,
    },
    { signal }, // stops generating when the user presses Stop
  );
  response.on('text', (delta) => stream.text(delta)); // each piece of the answer, as it arrives
  const message = await response.finalMessage();
  history.push({ role: 'assistant', content: message.content });
});
```

`handler` is a Web-standard `(Request) => Promise<Response>`, so it drops into most servers:

```ts nocheck
// Next.js App Router: app/api/dci/route.ts
export const POST = handler;

// Hono / Bun / Deno
app.post('/api/dci', (c) => handler(c.req.raw));
```

For Node's `http` module or Express, wrap it with `toNodeHandler` (and don't put a JSON body parser
in front of it; the handler reads the body itself):

```ts
import { createServer } from 'node:http';
import { toNodeHandler } from '@samirdamle/dci-server/node';
import { dciHandler } from '@samirdamle/dci-server';

// An echo, to keep this short: call your model here, as in the handlers above.
const handler = dciHandler(async (req, stream) => stream.text(`You said: ${req.prompt}`));
const serve = toNodeHandler(handler);

createServer((req, res) => {
  if (req.url === '/api/dci') return void serve(req, res);
  res.writeHead(404).end();
}).listen(8787);
```

More runnable server examples (Express, Hono, Next.js, `node:http`) are in
[`packages/server/examples`](../packages/server/examples).

## Check it works

1. Start your app and the endpoint, then hold **Alt**: annotated elements highlight under the
   pointer.
2. **Alt+Click** a row. A chip with its label appears in the chat.
3. Ask "Why is this overdue?". The answer streams in, and the request your endpoint received
   contains the row's `id`, `type`, `label` and data.

If nothing highlights, check that the element (or an ancestor) has `data-dci` and sits inside
DCI's `root` (default `document.body`). In development, invalid options and malformed
annotations are reported in the console.

## Next steps

- [Annotation guide](annotations.md): designing types, hierarchy, `private` data, what gets sent.
- [Interactions](interactions.md): every gesture and key, and how to remap them.
- [Configuration and API](configuration.md): all options, the instance API and the React hooks.
- [Protocol](protocol.md): the wire format, for backends in any language.
- [Recipes](recipes.md): custom transports, a headless React chat, redaction, agent frameworks.
