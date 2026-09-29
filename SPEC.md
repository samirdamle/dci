# DCI — Direct Contextual Intelligence: Specification (v1)

> **Status:** v1, implemented. Agreed in a requirements interview; items marked **(default)** were not discussed in detail and use the recommended default. Where the implementation refined the original draft, this document has been updated to match (see the notes marked **Implementation:**). The user-facing guides are in [`docs/`](docs/README.md).

## 1. Vision

AI chats make users *describe* what they want to talk about ("the third row in the invoices table, the one for Acme…"). That is slow and often wrong. DCI lets users **point at it**: they Alt+Click elements on the screen to select them as context, then ask the AI about exactly that.

**Primary users (v1):** developers who embed DCI in their web apps.
**Later:** a browser extension that brings DCI to any website for everyday users.

## 2. Deliverables (v1)

| Package | Purpose |
|---|---|
| `@dci/protocol` | Shared wire-protocol types and the SSE encoder/decoder (§7). No dependencies; used by both client and server. |
| `@dci/core` | Framework-agnostic TypeScript library: selection engine, overlay, chat UI, transport. No framework dependency. |
| `@dci/react` | Thin React bindings (`<DciProvider>`, `useDci`, `useSelection`, `useChat`, `useDciAction`, `<DciChat>`, and the `dci()` annotation helper). |
| `@dci/server` | Small Node helpers for the endpoint protocol (parse the request, stream events). |
| `apps/demo` | Demo app with a Node/TS backend that uses Claude. |

**Out of scope for v1 (default):** browser extension, Vue/Svelte bindings, MCP exposure, voice input, touch support, benchmark suite. See §11.

## 3. Annotating elements: `data-dci`

A single attribute marks an element as selectable context. The attribute name is configurable (`attribute: 'data-dci'`).

```html
<!-- Short form: the string is the id -->
<tr data-dci="inv_123">

<!-- Full form: a JSON object -->
<tr data-dci='{"id":"inv_123","type":"invoice","label":"Invoice #123","amount":420,"status":"overdue"}'>
```

**Reserved keys:**

| Key | Meaning |
|---|---|
| `id` | Stable identifier sent to the backend. |
| `type` | Kind of node. Drives "select all of the same type" and per-type suggested actions. |
| `label` | Human-readable name for chips and breadcrumbs. |
| `private` | If `true`, the element can't be selected and its payload is never sent **(default)**. |

All other keys are free-form data and are passed through to the backend as-is.

**Parse rules:** if the value parses as a JSON object, use it. Otherwise treat the string as `{ id: value }`. Invalid JSON logs a dev-mode warning and falls back to the string form.

## 4. Selection interaction

### 4.1 What gets selected
Alt+Click selects the **nearest ancestor-or-self carrying `data-dci`**. The DCI tree is the DOM tree reduced to annotated nodes; parent, child and sibling moves happen in this tree.

**Unannotated fallback:** if nothing annotated is found, select the clicked element and capture what's available (§5.2). Config: `fallback: true | false`.

### 4.2 Mouse

| Gesture | Action |
|---|---|
| Hold **Alt** | Hover preview: highlight the DCI node under the cursor. |
| **Alt+Click** | Select that node, replacing the selection. |
| **Alt+Shift+Click** | Toggle that node in or out of the selection. |
| **Alt+Wheel** (while hovering) | Move the hover target up or down the DCI tree before clicking. |
| **Alt+Drag** | Window select. Left→right: fully contained nodes only. Right→left: nodes the box touches. Shift adds, Ctrl/Cmd subtracts (whichever of the two isn't the modifier). Esc cancels. |
| **Alt+Double-click** | Select all siblings with the same `type`. |

**Implementation:** window select picks the innermost matches by default, or the outermost with `windowSelectLevel: 'top'` (whole rows rather than their cells). In touch mode, a node that encloses the whole box counts only when nothing inside it is hit, so dragging inside a table selects rows, not the table. Mod+Click on empty space inside the root clears the selection (`clearOnEmptyClick`).

### 4.3 Keyboard (while a selection is active)

| Key | Action |
|---|---|
| **↑** | Parent |
| **↓** | First child |
| **← / →** | Previous / next sibling |
| **Shift + arrow** | Extend the selection instead of moving it |
| **Esc** | Clear the selection (if the chat is open, the first Esc closes it) |

These keys are captured only while DCI selection is active, never globally. Alt+arrows are avoided because Alt+← is the browser Back shortcut.

**Keyboard-only selection (default):** focus an element and press a configurable hotkey (default `Alt+Enter`) to select its DCI node.

### 4.4 Breadcrumb
The chat popover or panel shows the path of the primary selection, e.g. `Dashboard › Invoices › Invoice #123`. Clicking a segment selects that node.

### 4.5 Customization
Every binding is configurable: modifier key, gestures, keyboard map. Features can be disabled one by one.

### 4.6 Highlight rendering
An **overlay layer** in a Shadow DOM root draws absolutely positioned boxes that track targets (`getBoundingClientRect` with `ResizeObserver` and scroll/resize listeners). It never mutates host styles, isn't clipped by `overflow: hidden`, shows distinct hover and selected states, and can carry small labels. A lightweight `outline` mode is available as an option.

## 5. Context payload

### 5.1 Annotated node
```ts
interface DciContextNode {
  id?: string;
  type?: string;
  label?: string;
  data: Record<string, unknown>;      // the parsed data-dci payload (reserved keys removed)
  ancestors?: Array<{ id?: string; type?: string; label?: string; data?: Record<string, unknown>; private?: true }>;
  source: 'annotated' | 'fallback';
  fallback?: DciFallbackInfo;          // only for fallback nodes (§5.2)
}
```
`ancestors` holds the `data-dci` chain from the root down. It's on by default (`includeAncestors: true`), so a selected cell still carries its row and table. Ancestors are compact (`id`, `type`, `label`) unless `ancestorData: 'full'`; a private ancestor appears only as `{ private: true }`.

### 5.2 Fallback node
For unannotated elements: `tagName`, truncated `innerText`, `aria-label`, `alt`/`title`, `href`, form values (never from password inputs), a short CSS path, and ancestors as above. Unannotated content inside a private node is never described.

### 5.3 Limits and hooks
- `maxSelection`: maximum number of nodes. Selection is capped with a visible notice.
- `maxTextLength`: truncation length for fallback text.
- `beforeSend(request) => request | false`: a hook for redaction or enrichment; returning `false` cancels the send **(default)**. **Implementation:** it receives the whole request (prompt and context), may be async, and a `private` node that still reaches a request throws in development and is stripped in production.
- `confirmBeforeSend`: optional "Sending N items" confirmation, off by default **(default)**.

## 6. Chat UI

- **Modes:** `popover` (anchored to the selection; **default**) or `panel` (docked). Set in config.
- Selected nodes appear as **removable chips**; removing a chip deselects the element. Alt+Clicking during a conversation adds context to the next message. **Implementation:** by default each message carries only the context added since the previous one (`contextMode: 'turn'`); `'cumulative'` resends everything selected so far.
- **Suggested actions** are defined in config per `type`:
  ```ts
  actions: {
    invoice: [{ id: 'explain', label: 'Explain' }, { id: 'remind', label: 'Draft reminder', prompt: 'Draft a payment reminder' }],
    '*':     [{ id: 'summarize', label: 'Summarize' }],
  }
  ```
  Clicking one sends the named `action` together with its `prompt` text, so the backend can either treat it specially or just use the text.
- Responses stream in. Tool progress ("Updating invoice…") appears inline.
- **Headless first:** the default UI is built on a public headless API, so developers can replace any part of it (chips, input, message list, the whole shell).

## 7. Backend protocol

DCI doesn't care what's behind the endpoint: a plain LLM chat, or an agent with tools, memory and skills.

### 7.1 Request
`POST {endpoint}`
```json
{
  "v": 1,
  "sessionId": "string",
  "prompt": "string",
  "action": "string | undefined",
  "context": [ /* DciContextNode[] */ ],
  "page": { "url": "string", "title": "string" }
}
```

### 7.2 Response: an SSE stream
| Event | Payload |
|---|---|
| `text-delta` | `{ text }` |
| `tool-start` | `{ id, name, label? }` |
| `tool-end` | `{ id, ok, label? }` |
| `client-action` | `{ name, args }`: the agent asks the page to do something. |
| `error` | `{ message, code? }` |
| `done` | `{}` |
| `x-…` | Custom events, passed to the page untouched |

**Implementation:** `v` is the protocol's major version. Additive changes (optional fields, new event types) happen within a version: servers accept unknown request fields and clients ignore unknown events. A server that doesn't speak the requested `v` answers with an `error` event (code `unsupported_version`) and `done`. The full wire format, including SSE framing and a Python backend, is in [`docs/protocol.md`](docs/protocol.md).

### 7.3 Client actions (write-back)
Developers register handlers. DCI includes a few built-ins (`highlight`, `select`, `scrollTo`); everything else, such as updating app state, is up to the developer.
```ts
dci.onAction('updateInvoice', ({ id, patch }) => store.update(id, patch));
```

### 7.4 Principles
- **No API keys in the browser.** Auth goes through `headers` or a custom `fetch` supplied by the host.
- **Sessions:** the developer controls `sessionId`. The default is one session per page load. Memory lives on the backend.
- **Pluggable transport:** a `Transport` interface. The SSE protocol above is the default, and adapters (Vercel AI SDK, AG-UI, WebSocket) can be added.

## 8. Public API sketch

```ts
import { createDci } from '@dci/core';

const dci = createDci({
  endpoint: '/api/dci',
  headers: () => ({ Authorization: `Bearer ${token}` }),
  attribute: 'data-dci',
  modifier: 'Alt',
  chat: { mode: 'popover' },
  maxSelection: 50,
  includeAncestors: true,
  fallback: true,
  actions: { /* per type */ },
  beforeSend: (request) => request,    // or false to cancel
});

dci.selection.get();                   // DciContextNode[]
dci.selection.set(['inv_123']); dci.selection.clear();
dci.on('selectionchange', ({ nodes }) => {});
dci.chat.send('Why is this overdue?');
dci.onAction('name', handler);
dci.update({ chat: { mode: 'panel' } });
dci.destroy();
```

React:
```tsx
<DciProvider config={config}><App /></DciProvider>
const dci = useDci();                          // the instance, or null before mount
const { nodes, clear } = useSelection();
const { messages, status, send } = useChat();  // everything for a custom chat
useDciAction('markPaid', handler);
<tr {...dci({ id, type: 'invoice', label })}>
```

The complete reference is [`docs/configuration.md`](docs/configuration.md).

## 9. Tech stack **(default)**

- A pnpm workspaces monorepo: `packages/protocol`, `packages/core`, `packages/react`, `packages/server`, `apps/demo`.
- TypeScript (strict), tsup for library builds, Vite + React + shadcn/ui (Tailwind) for the demo.
- Vitest for unit tests (the selection tree, parsing, protocol) and Playwright for interaction tests (Alt+Click, drag, keyboard).
- The demo backend is Node/TS, calling Claude through the Anthropic SDK and streaming the §7 protocol. A mock backend mode lets the demo run without an API key.

## 10. Demo app

A mock CRM for a **fictional Salesforce org**, "Summit Gear Co.", with two apps you switch between: **Sales Cloud** and **Marketing Cloud**. It is built with **React + shadcn/ui** (Tailwind CSS, with shadcn Charts on Recharts). All data is mock data from a deterministic seeded generator. It uses Salesforce-style objects and ID prefixes, but no Salesforce logos or trademarks, and it is clearly labelled as a fictional demo.

**Sales Cloud**
- **Home dashboard:** KPI cards (pipeline, closed won, win rate, average deal size) and a pipeline-by-stage chart
- **Opportunities:** a list view (table › row › cell) and a Kanban board by stage
- **Account record page:** account › contacts, opportunities, activities
- **Leads:** list view

**Marketing Cloud**
- **Campaigns:** table with budget, spend, leads and ROI
- **Email sends:** metrics for sends, opens, clicks and unsubscribes
- **Journeys:** Journey Builder-style canvas made of nested step nodes
- **Channel performance:** chart

The demo shows:
- selection, multi-select, window select, parent/child/sibling moves, and select-same-type
- suggested actions per type
- an agent with tools that change CRM records, with a `client-action` updating the UI
- `private` fields and the fallback for unannotated elements
- headless mode: an optional chat UI built with shadcn on top of `useChat()`

**Implementation:** the demo runs in three modes: Claude (with `ANTHROPIC_API_KEY` on the demo server), a deterministic mock backend (no key), and the same mock running in the browser for the static GitHub Pages build. A Playground drawer changes DCI options live and shows the exact request and the raw response events.

## 11. Roadmap after v1

1. Browser extension, built on `@dci/core` with fallback mode.
2. A query or command palette to select by metadata ("all overdue invoices"), with voice as a speech-to-text front end for it.
3. Touch support (long-press or a toggle mode).
4. Vue and Svelte bindings.
5. Exposing host tools over MCP.
6. A benchmark comparing DCI context with typed descriptions (accuracy, keystrokes, tokens).
7. AI-assisted expansion of a selection ("also include related items").

## 12. Non-functional requirements

- **Isolation:** all DCI UI renders in Shadow DOM and must not leak or inherit host styles.
- **Performance:** no work happens until the modifier is pressed. Overlay updates are batched with `requestAnimationFrame`. Bundle-size and runtime budgets are enforced in CI; see [`docs/compatibility.md`](docs/compatibility.md).
- **Compatibility:** the latest two versions of Chrome, Edge, Firefox and Safari on macOS, Windows and Linux; pages with a strict CSP; annotated nodes inside open shadow roots.
- **Accessibility:** keyboard navigation (§4.3), ARIA roles on the chat UI, visible focus.
- **Privacy:** only `data-dci` payloads (plus fallback info when enabled) are sent; `private` nodes are excluded; `beforeSend` hook.
- **License:** MIT. Published to npm as a polished open-source package with docs **(default)**.
