---
'@dci/core': major
'@dci/react': major
'@dci/server': major
'@dci/protocol': major
---

First stable release. Users select parts of your app with Alt+Click, drag or the keyboard, and
ask an AI about exactly those things: the backend receives structured, developer-controlled
context (ids, types, data, ancestors) instead of a description.

- `@dci/core`: `createDci()` with annotations (`data-dci`), every selection gesture, the Shadow
  DOM highlight overlay, the chat UI (popover or panel) and its headless controller, the SSE
  transport, client actions, and runtime `update()`.
- `@dci/react`: `DciProvider`, `useSelection`, `useChat`, `useDciAction`, `<DciChat>` and the
  `dci()` annotation helper.
- `@dci/server`: `dciHandler` for Web-standard runtimes, `toNodeHandler` for Node and Express, and
  `formatContextForPrompt`.
- `@dci/protocol`: the v1 wire protocol's types, validation, and SSE encoder and decoder.
