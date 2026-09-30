# Recipes

- [Custom transport (Vercel AI SDK)](#custom-transport-vercel-ai-sdk)
- [Headless mode with a custom React chat](#headless-mode-with-a-custom-react-chat)
- [Redaction with `beforeSend`](#redaction-with-beforesend)
- [Agent frameworks behind the endpoint](#agent-frameworks-behind-the-endpoint)

## Custom transport (Vercel AI SDK)

A **transport** is how DCI reaches your backend: `send(request, { signal })` returns an async
iterable of [protocol events](protocol.md#response-the-event-stream). The default is SSE over
`fetch`; pass `transport` instead of `endpoint` to use anything else: WebSockets, an existing
chat route, an in-browser mock.

### Option A: the AI SDK behind a DCI endpoint (recommended)

Keep DCI's protocol and use the AI SDK to call the model. You get tool progress and client
actions for free:

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { dciHandler, formatContextForPrompt } from '@samirdamle/dci-server';
import { streamText } from 'ai';

export const POST = dciHandler(async (req, stream, { signal }) => {
  const result = streamText({
    model: anthropic('claude-sonnet-5-5'),
    system: 'Answer questions about the items the user selected on screen.',
    prompt: `${formatContextForPrompt(req.context)}\n\n${req.prompt}`,
    abortSignal: signal,
  });
  for await (const text of result.textStream) stream.text(text);
});
```

### Option B: a transport for an existing AI SDK route

Already have a route that returns `result.toTextStreamResponse()`? Adapt it on the client with a
small transport:

```ts
import { createDci, type Transport } from '@samirdamle/dci-core';
import type { DciContextNode } from '@samirdamle/dci-protocol';

const describe = (nodes: DciContextNode[]) =>
  nodes
    .map((n) => `- ${n.type ?? 'item'} ${n.label ?? n.id ?? ''}: ${JSON.stringify(n.data)}`)
    .join('\n');

const aiSdkTransport: Transport = {
  async *send(request, { signal }) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `${describe(request.context)}\n\n${request.prompt}` }),
      signal,
    });
    if (!response.ok || !response.body) {
      yield { type: 'error', message: `HTTP ${response.status}` };
      return;
    }
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      yield { type: 'text-delta', text: decoder.decode(chunk, { stream: true }) };
    }
    yield { type: 'done' };
  },
};

createDci({ transport: aiSdkTransport });
```

The matching route:

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt: string };
  const result = streamText({
    model: anthropic('claude-sonnet-5-5'),
    prompt,
    abortSignal: req.signal,
  });
  return result.toTextStreamResponse();
}
```

A text stream has no tool events or client actions; Option A keeps them.

## Headless mode with a custom React chat

Build the chat from your own components and keep DCI's selection, context and streaming.
`<DciChat>` switches the built-in UI off while it's mounted and hands you the live chat state:

```tsx
import { DciChat, type UseChatResult } from '@samirdamle/dci-react';

function MyChat({ chat }: { chat: UseChatResult }) {
  if (!chat.open) return null;
  return (
    <aside aria-label="Assistant">
      <ul aria-label="Context">
        {chat.pendingContext.map((node) => (
          <li key={node.id ?? node.label}>
            {node.label ?? node.id}
            <button onClick={() => chat.removeContext(node)}>Remove</button>
          </li>
        ))}
      </ul>
      <div role="log">
        {chat.messages.map((m) => (
          <p key={m.id} className={m.role}>
            {m.text}
            {m.error && <button onClick={() => void chat.retry()}>Retry</button>}
          </p>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void chat.send();
        }}
      >
        <input value={chat.draft} onChange={(e) => chat.setDraft(e.target.value)} />
        {chat.status === 'streaming' ? (
          <button type="button" onClick={chat.stop}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </aside>
  );
}

export const AssistantPanel = () => <DciChat render={(chat) => <MyChat chat={chat} />} />;
```

Put `<AssistantPanel />` anywhere inside `<DciProvider>`. `useChat()` gives the same state to any
component, and `useSelection()` gives the live selection. Without React, set `chat: { ui: false }`
and render from `dci.chat.subscribe(state => …)`. The demo's Playground has a full shadcn/ui
version (`apps/demo/src/playground/custom-chat.tsx`).

To restyle rather than rebuild, replace single sections of the built-in UI with `chat.render`
(`header`, `breadcrumb`, `chips`, `actions`, `input`, `message`), or theme it with
[CSS variables](configuration.md#theming).

## Redaction with `beforeSend`

`beforeSend` receives each request just before it's sent. Return it (changed or not), or `false`
to cancel the send; the chat then shows "Message not sent."

```ts
import { createDci } from '@samirdamle/dci-core';
import type { DciContextNode, DciRequest } from '@samirdamle/dci-protocol';

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;

function redact(node: DciContextNode): DciContextNode {
  const data = Object.fromEntries(
    Object.entries(node.data).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.replace(EMAIL, '[email]') : value,
    ]),
  );
  return { ...node, data };
}

createDci({
  endpoint: '/api/dci',
  beforeSend(request: DciRequest) {
    // Refuse to send very large selections.
    if (request.context.length > 20) return false;
    return {
      ...request,
      prompt: request.prompt.replace(EMAIL, '[email]'),
      context: request.context.map(redact),
    };
  },
});
```

`beforeSend` can be async, for example to fetch extra data from your API and add it to the
context. Prefer `private` annotations for fields that should never leave the page:
`beforeSend` is for rules that depend on the content. Whatever it returns, a node that was
annotated `private` never goes out (DCI throws in development and strips it in production).

To confirm with the user instead, set `chat: { confirmBeforeSend: true }`, or pass a function
that decides per request.

## Agent frameworks behind the endpoint

DCI doesn't care what answers the request. Whatever framework you use (the Anthropic SDK's tool
use, the Claude Agent SDK, LangGraph, Mastra, your own loop), the mapping is the same:

| Your agent                    | DCI stream                                                      |
| ----------------------------- | --------------------------------------------------------------- |
| Text tokens                   | `stream.text(delta)`                                            |
| A tool call starts / finishes | `stream.toolStart(id, name, label)` / `stream.toolEnd(id, ok)`  |
| A change the page should show | `stream.clientAction(name, args)`                               |
| A failure                     | `stream.error(message, code)` (or just throw)                   |
| Conversation memory           | Keyed by `req.sessionId`                                        |
| The selection                 | `formatContextForPrompt(req.context)`, or the raw `req.context` |

Most agent frameworks emit a stream of events. A small adapter turns them into DCI events:

```ts
import { dciHandler, formatContextForPrompt, type DciStream } from '@samirdamle/dci-server';

/** The events a typical agent loop yields (adapt to your framework's names). */
type AgentEvent =
  | { kind: 'token'; text: string }
  | { kind: 'tool-call'; id: string; tool: string; input: unknown }
  | { kind: 'tool-result'; id: string; ok: boolean; changed?: { id: string; patch: object } };

/** Your agent: anything that yields AgentEvents for a prompt. */
declare function runAgent(
  sessionId: string,
  prompt: string,
  signal: AbortSignal,
): AsyncIterable<AgentEvent>;

function forward(event: AgentEvent, stream: DciStream) {
  switch (event.kind) {
    case 'token':
      return stream.text(event.text);
    case 'tool-call':
      return stream.toolStart(event.id, event.tool, `Running ${event.tool}…`);
    case 'tool-result':
      stream.toolEnd(event.id, event.ok);
      if (event.changed) stream.clientAction('recordChanged', event.changed);
  }
}

export const POST = dciHandler(async (req, stream, { signal }) => {
  const prompt = `${formatContextForPrompt(req.context)}\n\n${req.prompt}`;
  for await (const event of runAgent(req.sessionId, prompt, signal)) forward(event, stream);
});
```

Tips:

- **Resolve ids server-side.** Annotation ids are your app's ids, so give the agent a tool that
  loads a record by id rather than trusting the payload's copy of the data.
- **Write, then tell the page.** Change your data in the tool, then send a `client-action` so the
  page updates without a reload (the demo's `updateRecord` does this).
- **Pass `signal` down** so pressing Stop cancels model calls and tools.
- **Label tools for people:** `toolStart`'s label is what the user sees ("Moving 3 deals to
  Negotiation…").

The demo backend (`apps/demo/server/claude-agent.ts`) is a complete example: a Claude tool-use
loop with CRM tools, per-session memory and client actions.
