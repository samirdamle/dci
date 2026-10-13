# @samirdamle/dci-core

## 1.1.0

### Minor Changes

- [#99](https://github.com/samirdamle/dci/pull/99) [`650a24e`](https://github.com/samirdamle/dci/commit/650a24e0f4e3a8714f98748805106824a0451450) Thanks [@samirdamle](https://github.com/samirdamle)! - Add the `infer` option: a function `(el) => annotation | null` that gives elements without `data-dci` an annotation, so pages without annotations (or with only a few) still get structure. Real annotations always win, inferred nodes are sent as `source: 'annotated'`, and DCI's own UI is never inferred. Call `refreshInferred()` after the page changes if you need fresh results before the next arm or send.

- [#102](https://github.com/samirdamle/dci/pull/102) [`879f4a3`](https://github.com/samirdamle/dci/commit/879f4a313ccefafba29680fc791e2fb6283d6bcb) Thanks [@samirdamle](https://github.com/samirdamle)! - Selection markers: each selected node gets a short marker (A, B, C… by default) shown as a badge on the top-left corner of its selection box and on its chat chip, so users can say "Compare A and B".

  - **Protocol:** context nodes carry an optional `marker`.
  - **Server:** `formatContextForPrompt` includes markers and explains them to the model.
  - **Core:** a new `markers` option: `'letters'` (default), `'numbers'`, a custom `(index) => string` series, or `false`. Markers follow selection order, are kept while a node stays selected, and start over with a new selection. A new theme token, `--dci-on-selected`, colours the badge text. `SelectionStore` gains `marker(el)`.

- [#106](https://github.com/samirdamle/dci/pull/106) [`558231f`](https://github.com/samirdamle/dci/commit/558231fae4886334ee3fbcb5a9eb85afa9fdf6bc) Thanks [@samirdamle](https://github.com/samirdamle)! - Select mode for touch screens. `dci.setSelectMode(true)` keeps the gestures armed without the modifier: a tap toggles a node, a drag window-selects (adding), and a double tap selects all of the same type. A long press on an annotated node turns it on and selects that node (`bindings.longPress`, default `true`). New: `dci.isSelectMode()`, the `selectmodechange` event, `InputManager.setLocked()`, and `useSelectMode()` in React.

### Patch Changes

- [#87](https://github.com/samirdamle/dci/pull/87) [`cd6bea9`](https://github.com/samirdamle/dci/commit/cd6bea93cdb3160fe23311df7917f3c1e3da49fc) Thanks [@samirdamle](https://github.com/samirdamle)! - Cross-browser fixes found by the nightly Firefox and WebKit runs:

  - Window select applies the box where the pointer was released. It used the last per-frame preview, so a fast drag released before the next frame could select nothing (seen in WebKit on Linux).
  - The chat popover shrinks to the space on the side it flips to when it doesn't fit above or below its targets, instead of shifting over them or off screen.

- [#97](https://github.com/samirdamle/dci/pull/97) [`851c47c`](https://github.com/samirdamle/dci/commit/851c47c167d2ff97d6bfceb413e8ad1361f642da) Thanks [@samirdamle](https://github.com/samirdamle)! - Groundwork for the DCI browser extension:

  - DCI runs in browser-extension content scripts, where `customElements` is `null`; its `<dci-root>` host now works without a custom element registry.
  - Chips for unannotated (fallback) nodes are named by what the user sees (ARIA label, alt text, title or the first 40 characters of text) instead of the tag name.

- [#103](https://github.com/samirdamle/dci/pull/103) [`161687f`](https://github.com/samirdamle/dci/commit/161687fd422075d1cb5800cb60c62c8ea232edc0) Thanks [@samirdamle](https://github.com/samirdamle)! - Selection markers in the chat: the title shows the selection's markers ("Ask about [A] [B]"), and each chip's marker now sits inside its chip. Before, the overlay's badge style also applied to chat chips, pinning their marker to the chat's top-left corner. New string: `titleMarkers` (default "Ask about").

- [#84](https://github.com/samirdamle/dci/pull/84) [`111922f`](https://github.com/samirdamle/dci/commit/111922fdafa60520df12a3b18aa3bb0497693879) Thanks [@samirdamle](https://github.com/samirdamle)! - `VERSION` is typed as `string` instead of a literal type, so it no longer changes the type
  declarations on every release.
- Updated dependencies [[`879f4a3`](https://github.com/samirdamle/dci/commit/879f4a313ccefafba29680fc791e2fb6283d6bcb), [`111922f`](https://github.com/samirdamle/dci/commit/111922fdafa60520df12a3b18aa3bb0497693879)]:
  - @samirdamle/dci-protocol@1.1.0

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

### Patch Changes

- Updated dependencies [[`a061084`](https://github.com/samirdamle/dci/commit/a061084a35b8d15fcac199fc1bdd28e05b3a47c5)]:
  - @samirdamle/dci-protocol@1.0.0
