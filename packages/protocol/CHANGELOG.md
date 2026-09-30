# @samirdamle/dci-protocol

## 1.0.0

### Major Changes

- [#82](https://github.com/samirdamle/dci/pull/82) [`a061084`](https://github.com/samirdamle/dci/commit/a061084a35b8d15fcac199fc1bdd28e05b3a47c5) Thanks [@samirdamle](https://github.com/samirdamle)! - First stable release. Users select parts of your app with Alt+Click, drag or the keyboard, and
  ask an AI about exactly those things: the backend receives structured, developer-controlled
  context (ids, types, data, ancestors) instead of a description.

  - `@samirdamle/dci-core`: `createDci()` with annotations (`data-dci`), every selection gesture, the Shadow
    DOM highlight overlay, the chat UI (popover or panel) and its headless controller, the SSE
    transport, client actions, and runtime `update()`.
  - `@samirdamle/dci-react`: `DciProvider`, `useSelection`, `useChat`, `useDciAction`, `<DciChat>` and the
    `dci()` annotation helper.
  - `@samirdamle/dci-server`: `dciHandler` for Web-standard runtimes, `toNodeHandler` for Node and Express, and
    `formatContextForPrompt`.
  - `@samirdamle/dci-protocol`: the v1 wire protocol's types, validation, and SSE encoder and decoder.
