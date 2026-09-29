# Configuration and API

Hand-written explanations of the options and APIs you'll use most. The complete, generated
reference for every export is built from the TSDoc comments with `pnpm docs:api` (TypeDoc, output in
`docs/api/`), and published with the demo at <https://samirdamle.github.io/dci/api/>.

- [`createDci()` options](#createdci-options)
- [Chat options](#chat-options)
- [Suggested actions](#suggested-actions)
- [The instance API](#the-instance-api)
- [Client actions (write-back)](#client-actions-write-back)
- [React](#react)
- [Theming](#theming)
- [Building blocks](#building-blocks)

## `createDci()` options

Only `endpoint` (or your own `transport`) is required. Defaults live in the exported `DEFAULTS`
object.

```ts
import { createDci } from '@dci/core';

const dci = createDci({
  endpoint: '/api/dci',
  headers: () => ({ Authorization: `Bearer ${token}` }), // called on every request
  modifier: 'Alt',
  maxSelection: 50,
  chat: { mode: 'popover' },
  actions: {
    invoice: [{ id: 'remind', label: 'Draft reminder', prompt: 'Draft a payment reminder' }],
    '*': [{ id: 'summarize', label: 'Summarize' }],
  },
  beforeSend: (request) => request, // redact or enrich; return false to cancel
});
```

| Option              | Default             | Description                                                                                          |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `endpoint`          | —                   | Backend URL (`POST`, answered with the [SSE protocol](protocol.md))                                  |
| `headers`           | —                   | Request headers, or a (possibly async) function called on every request                              |
| `fetch`             | global `fetch`      | Custom `fetch` (auth wrapper, test double)                                                           |
| `credentials`       | `'same-origin'`     | Request credentials mode                                                                             |
| `transport`         | SSE over fetch      | Your own transport instead of `endpoint` ([recipe](recipes.md#custom-transport-vercel-ai-sdk))       |
| `root`              | `document.body`     | Only nodes inside this element count                                                                 |
| `attribute`         | `'data-dci'`        | The attribute that marks DCI nodes                                                                   |
| `modifier`          | `'Alt'`             | The key that arms DCI: `'Alt'`, `'Control'`, `'Meta'` or `'Shift'`                                   |
| `bindings`          | all on              | Remap or disable gestures and keys ([interactions](interactions.md#remapping-or-disabling-gestures)) |
| `gestures`          | built-ins           | Replace the gesture modules ([custom gestures](interactions.md#custom-gestures))                     |
| `maxSelection`      | `50`                | Cap on selected nodes; the chat shows a notice and `selectionlimit` fires                            |
| `includeAncestors`  | `true`              | Send each node's annotated ancestor chain                                                            |
| `ancestorData`      | `'compact'`         | `'full'` also sends ancestors' data                                                                  |
| `fallback`          | `true`              | Allow selecting unannotated elements                                                                 |
| `maxTextLength`     | `500`               | Truncation for fallback text                                                                         |
| `windowSelectLevel` | `'leaf'`            | Window select picks innermost (`'leaf'`) or outermost (`'top'`) nodes                                |
| `clearOnEmptyClick` | `true`              | Mod+Click on empty space clears the selection                                                        |
| `passthroughClicks` | `false`             | Let DCI clicks reach your app's handlers too                                                         |
| `overlay`           | boxes, hover labels | `{ mode: 'boxes' \| 'outline', labels: 'hover' \| 'all' \| 'none' }`, or `false` to draw your own    |
| `theme`             | `'auto'`            | `'light'`, `'dark'` or `'auto'` (follows the OS)                                                     |
| `container`         | `document.body`     | Where the `<dci-root>` UI host is appended                                                           |
| `chat`              | see below           | Chat UI and controller options                                                                       |
| `actions`           | —                   | [Suggested actions](#suggested-actions) per `type`                                                   |
| `builtinActions`    | `true`              | Built-in client actions: `true`, `false` or a list                                                   |
| `beforeSend`        | —                   | Redact or enrich each request; return `false` to cancel                                              |
| `session`           | per page load       | `{ scope: 'page' }` or `{ scope: 'manual', id }` for your own ids                                    |
| `page`              | location, title     | Page info sent with each request                                                                     |
| `onCustomEvent`     | —                   | Receives custom `x-…` stream events                                                                  |

**Merging and updates.** Plain objects merge deeply, so `dci.update({ chat: { mode: 'panel' } })`
keeps the other chat options; arrays, functions and elements replace. `update()` does the least
work it can:

- A chat mode switch happens in place.
- Modifier, bindings, overlay and theme rebuild only the gestures; the selection is kept.
- Endpoint, headers, `beforeSend` and the chat's `contextMode`/`concurrency` apply to the next
  request with nothing rebuilt.
- `root`, `attribute` and selection limits rebuild the rest too. The selection carries over, but
  the on-screen chat history starts fresh (the backend session is kept).

**Development help.** Invalid values throw with a fix-it message ("`modifier` must be one of …")
and typos warn ("Unknown option `modifer`. Did you mean `modifier`?"). Validation is skipped in
production builds.

**SSR and multiple instances.** Importing has no side effects; call `createDci()` in the browser
(for example in `useEffect`). Several instances can share a page, each with its own `root`.

## Chat options

`chat` configures both the built-in UI and the headless controller behind it:

| Option              | Default      | Description                                                                          |
| ------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `ui`                | `true`       | `false` = headless: drive `dci.chat` from your own UI                                |
| `mode`              | `'popover'`  | `'popover'` (anchored to the selection) or `'panel'` (docked)                        |
| `side`              | `'right'`    | Panel side                                                                           |
| `anchor`            | `'primary'`  | Popover anchor: the primary node or the whole selection's box                        |
| `autoOpen`          | `'onSelect'` | Open after a selection, when a message is sent (`'onAction'`), or never (`false`)    |
| `pushContent`       | `false`      | The panel sets `--dci-chat-inset` on `<html>` so your layout can make room           |
| `panelWidth`        | `380`        | Initial panel width (the user can resize it)                                         |
| `maxChips`          | `6`          | Context chips shown before "+N more"                                                 |
| `maxActions`        | `4`          | Suggested actions shown before the overflow menu                                     |
| `contextMode`       | `'turn'`     | `'turn'` sends only context added since the last message; `'cumulative'` resends all |
| `concurrency`       | `'block'`    | Sending while a reply streams: `'block'` ignores it, `'queue'` waits                 |
| `confirmBeforeSend` | `false`      | Ask before each send: `true`, or a function deciding per request                     |
| `strings`           | English      | Override any UI text (i18n)                                                          |
| `render`            | —            | Replace a section: `header`, `breadcrumb`, `chips`, `actions`, `input`, `message`    |
| `renderMarkdown`    | built-in     | Your own renderer (model output is untrusted: sanitize it)                           |
| `highlightCode`     | —            | Syntax-highlighting hook for code blocks                                             |

The popover flips and shifts to stay on screen, follows its anchor as the page scrolls, and can be
dragged by its header. The panel is resizable. Both are accessible: a non-modal `dialog` or a
`complementary` landmark, a `log` that announces finished replies, keyboard-reachable chips,
breadcrumb and actions, and focus returned on close.

## Suggested actions

```ts
import type { ActionsConfig } from '@dci/core';

export const actions: ActionsConfig = {
  invoice: [
    { id: 'explain', label: 'Explain' },
    { id: 'remind', label: 'Draft reminder', prompt: 'Draft a payment reminder', multi: false },
  ],
  campaign: [
    {
      id: 'compare',
      label: 'Compare with selected',
      when: (nodes) => nodes.length > 1, // only offered for several campaigns
    },
  ],
  '*': [{ id: 'summarize', label: 'Summarize' }],
};
```

One selected type offers its own actions, then `'*'`. Mixed types offer the actions they share,
then `'*'`. Clicking an action sends its `prompt` (or `label`) with its `id` as the request's
`action`, so your backend can special-case it or just read the text. `actions` can also be a
function of the selected nodes.

## The instance API

| API                           | What it does                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `dci.selection`               | `get()` (payloads), `elements()`, `set/add/remove/toggle(elementOrId)`, `has()`, `clear()`, `selectSameType()`   |
| `dci.chat`                    | `open()`, `close()`, `send(prompt?, { action })`, `stop()`, `retry()`, `state()`, `subscribe()`                  |
| `dci.session`                 | `id`, `reset()` (start a new conversation)                                                                       |
| `dci.onAction(name, fn)`      | Handle a `client-action` from the backend; returns an unsubscribe function                                       |
| `dci.on(event, fn)`           | `selectionchange`, `selectionlimit`, `hover`, `chatopen`, `chatclose`, `message`, `actionerror`, `sessionchange` |
| `dci.update(patch)`           | Change options at runtime                                                                                        |
| `dci.disable()` / `enable()`  | Detach and reattach gestures and the chat (state is kept)                                                        |
| `dci.previewRequest(prompt?)` | The exact request the next send would make (after `beforeSend`), or `false`                                      |
| `dci.destroy()`               | Remove every listener and all DCI UI                                                                             |

```ts
import { createDci } from '@dci/core';

const dci = createDci({ endpoint: '/api/dci' });

dci.on('selectionchange', ({ nodes }) => console.log('selected', nodes.length));
dci.selection.set(['inv_123', 'inv_124']); // by id, or pass elements
await dci.chat.send('Which of these is most overdue?');
console.log(await dci.previewRequest('And the next one?'));
```

## Client actions (write-back)

The backend can ask the page to act by streaming a `client-action` event. Register a handler per
name:

```ts
import { createDci } from '@dci/core';

const dci = createDci({ endpoint: '/api/dci' });

const off = dci.onAction('updateInvoice', ({ id, patch }, { resolve }) => {
  store.update(String(id), patch as Record<string, unknown>);
  console.log('elements for it:', resolve(String(id)));
});
off(); // unregister
```

Built-in actions, on by default (`builtinActions`):

| Name        | Args                | What it does                              |
| ----------- | ------------------- | ----------------------------------------- |
| `highlight` | `{ ids: string[] }` | Flash the elements with those ids         |
| `select`    | `{ ids: string[] }` | Replace the selection with those elements |
| `scrollTo`  | `{ id: string }`    | Scroll that element into view             |

A failing or unknown action fires `actionerror` instead of breaking the stream.

## React

`@dci/react` wraps `createDci()` in a provider and exposes live state as hooks (built on
`useSyncExternalStore`, so there's no tearing):

```tsx
import type { DciConfig } from '@dci/core';
import { dci, DciProvider, useChat, useDciAction, useSelection } from '@dci/react';

const config: DciConfig = { endpoint: '/api/dci', chat: { mode: 'panel' } }; // keep it stable

export function App() {
  return (
    <DciProvider config={config}>
      <Invoices />
    </DciProvider>
  );
}

function Invoices() {
  const { nodes, clear } = useSelection();
  const { status } = useChat();
  useDciAction('markPaid', ({ id }) => store.markPaid(String(id))); // removed on unmount
  return (
    <section>
      <p>
        {nodes.length} selected · {status}
        <button onClick={clear}>Clear</button>
      </p>
      <table>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              {...dci({ id: inv.id, type: 'invoice', label: `Invoice ${inv.number}` })}
            >
              <td>{inv.number}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

| Export                           | What it is                                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<DciProvider config root?>`     | Creates the instance in an effect (SSR and StrictMode safe). Config changes go through `update()`; only a new `endpoint` or `transport` recreates it. `root={ref}` scopes DCI to an element inside. |
| `useDci()`                       | The instance, or `null` until mounted                                                                                                                                                               |
| `useSelection()`                 | `{ nodes, elements, primary }` plus `set`, `add`, `remove`, `toggle`, `has`, `clear`, `selectSameType`                                                                                              |
| `useChat()`                      | The chat state (`messages`, `status`, `pendingContext`, `draft`, `confirm`, `limit`, `open`) plus `send`, `stop`, `retry`, `setOpen`, `setDraft`, `removeContext`, `confirmSend`                    |
| `useDciAction(name, handler)`    | A client-action handler for the component's lifetime                                                                                                                                                |
| `<DciChat render={(chat) => …}>` | Replaces the built-in chat with your React UI while mounted ([recipe](recipes.md#headless-mode-with-a-custom-react-chat))                                                                           |
| `dci(value)`                     | `{ 'data-dci': '…' }` with sorted keys, ready to spread                                                                                                                                             |

The package is marked `"use client"`, so it works in the Next.js App Router.

## Theming

Colors, radius, font and stacking are CSS custom properties on `<dci-root>`:

```css
dci-root {
  --dci-accent: #0ea5e9; /* labels, marquee */
  --dci-hover: #0ea5e9; /* hover box */
  --dci-selected: #0ea5e9; /* selected boxes */
  --dci-preview: #a855f7; /* window-select preview */
  --dci-radius: 4px;
  --dci-bg: #fff; /* chat surface; also --dci-fg, --dci-muted, --dci-border, --dci-surface */
  --dci-on-accent: #fff; /* text on accent (send button, your messages) */
  --dci-chat-border: #0f172a; /* 2px popover border; defaults to --dci-fg (inverse of --dci-bg) */
  --dci-font: 'Inter', sans-serif;
  --dci-z: 1000;
}
```

`theme: 'light' | 'dark' | 'auto'` switches the built-in palettes. Animations respect
`prefers-reduced-motion`.

## Building blocks

`createDci()` is assembled from smaller pieces, all exported from `@dci/core` for custom setups:

| Piece                                                               | What it does                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `createInteractions(options)`                                       | Modifier, gestures, DCI tree, selection store and overlay, with no chat or transport |
| `createChatController(options)`                                     | Headless chat: snapshots context, streams replies, tracks tools, runs client actions |
| `createChatUi(options)`                                             | The default chat shell on top of a controller                                        |
| `createSSETransport({ endpoint })`                                  | The default transport (`POST` + SSE)                                                 |
| `createActionRegistry({ selection })`                               | Client-action handlers, with the built-ins                                           |
| `createSession(options)`                                            | Conversation ids                                                                     |
| `readDci`, `createDciTree`, `toContextNode`, `createSelectionStore` | Parsing, the tree, payload building and the selection store                          |

```ts
import {
  createActionRegistry,
  createChatController,
  createChatUi,
  createInteractions,
  createSSETransport,
  type ChatUi,
} from '@dci/core';

let chat: ChatUi | undefined;
const interactions = createInteractions({ onEscape: () => chat?.escape() ?? false });
const controller = createChatController({
  transport: createSSETransport({ endpoint: '/api/dci' }),
  selection: interactions.selection,
  actions: createActionRegistry({ selection: interactions.selection }),
});
chat = createChatUi({ controller, interactions, mode: 'panel' });
```
