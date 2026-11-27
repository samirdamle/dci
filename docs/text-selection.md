# Text selection — specification

> **Status:** Implemented (Phase 1, issue
> [#114](https://github.com/samirdamle/dci/issues/114)). The Phase 0 spike
> passed in all three browsers — see §12.
> Issue: [#112](https://github.com/samirdamle/dci/issues/112).
> Source: the strategy Samir approved 2026-11-26 ("Go. Good with your reco.").
> This document is the spec the implementation PR will follow. Where it
> refines the strategy, this document wins.

## 0. Decisions locked with the approval

| #   | Decision        | Value                                                                                                                          |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Primary flow    | Native drag (no modifier) → floating pill → tap to capture                                                                     |
| 2   | Secondary flows | Alt+Click on a live highlighted range; Alt+Enter when a text range exists                                                      |
| 3   | Rejected        | Alt+Click+Drag — direct conflict with Alt+Drag window select                                                                   |
| 4   | Pill behaviour  | Opens the chat immediately when closed; adds silently when a chat is already open                                              |
| 5   | Length cap      | `maxTextSelectionLength: 2000` characters by default, configurable                                                             |
| 6   | Alt+Click       | Stays in v1 subject to the Phase 0 spike (§12); if it cannot reliably preserve a range, drop it and ship pill + Alt+Enter only |
| 7   | Chip label      | Quoted excerpt (first ~80 characters); tooltip carries the fuller excerpt                                                      |
| 8   | Extension       | Phase 2, not Phase 1                                                                                                           |

## 1. Vision

DCI today lets people point at _things_ — a row, a card, a chart point — and ask
about exactly that thing. It has no answer for _words_: a sentence in a deal
note, a clause in an invoice, a paragraph in a report. The only way to talk
about words today is to Alt+Click the whole element that contains them, which
sends the element's full annotated payload or, for unannotated elements, a
fallback description of the whole element (up to 500 characters of its text).
The user cannot say "this sentence", only "this paragraph / row / card".

Text selection closes that gap with the gesture people already know: drag over
the words, then ask about exactly those words. The model receives the exact
text, not a description of the element that contains it.

**Primary users (this feature):** developers who embed DCI in their web apps,
and through them, end users reading prose inside those apps — deal notes,
comments, descriptions, email bodies, documents.

## 2. Goals and non-goals

### 2.1 Goals

1. Select text by click-and-drag, with no modifier key, and start a chat with
   that text in the context.
2. Add a text selection to the context of an _existing_ chat, without
   auto-sending and without disturbing the draft or the context already sent.
3. Treat a text selection as a first-class context item: it gets a marker
   (A, B, C…), a removable chip, a persistent highlight, and it counts toward
   the same selection limits as element selections.
4. Keep every existing gesture working unchanged: Alt+Click still selects a
   node, Alt+Drag still window-selects nodes and never selects text, and
   touch long-press still arms Select mode only on annotated nodes.
5. Work on touch, where there is no Alt key, via the native selection
   handles plus the floating pill.

### 2.2 Non-goals for v1

- Editing the page text from the model, or any other write-back to the
  selected text.
- Cross-iframe ranges.
- Multi-range (Firefox) selections: only the first range is used.
- Using a text selection to drive `selectSameType` or window select.
- Selections inside editable fields (`input`, `textarea`, `contenteditable`)
  as context. See §10.
- Sentence / paragraph expansion from a word (Phase 3).

## 3. User experience

### 3.1 Primary flow — native drag, then the pill

1. The user drags over text normally, with no modifier held. DCI does
   nothing during the drag. Native selection, native handles, and the host
   app's own behaviour are all untouched.
2. On mouseup / selection settle, if the selection is a valid text range
   (§4.1), DCI shows a small floating pill anchored to the range's bounding
   rect, in the Shadow DOM layer (`<dci-root>`), next to the selection: **Ask
   about this**. When a chat is already open the pill reads **+ Add to chat**.
   The pill shows no excerpt itself; its tooltip carries a short excerpt and
   the character count.
3. Tapping the pill captures the range (§5) and turns it into a context item:
   - If no chat is open, the chat popover opens with the text item as a
     pending chip, and focus moves to the chat input.
   - If a chat is already open, the item is added to the pending context for
     the next message. Nothing is sent, the draft is untouched, and context
     already sent in earlier turns is not resent (the existing
     `contextMode: 'turn'` behaviour).
4. The text stays visibly highlighted after the native selection is gone
   (§7). Removing the chip removes the highlight and the context item.

### 3.2 Secondary flow — Alt+Click on a highlighted range

If a non-collapsed text range is live and the user Alt+Clicks _inside_ that
range, DCI captures the range instead of selecting the node under the click.
This is a power-user shortcut, not the primary path: the click target is
small, and §12's spike must prove the range survives the click before this
ships. If the Alt+Click lands outside the live range, it behaves exactly as
today (select the nearest DCI node).

### 3.3 Secondary flow — Alt+Enter with a range

`Alt+Enter` today selects the focused element's DCI node. When a text range
is live, text takes precedence: Alt+Enter captures the range. When no range
is live, Alt+Enter behaves exactly as today. This is the keyboard-only path
and the screen-reader path.

### 3.4 Touch

There is no Alt key on touch, so the pill is the touch path. The user selects
text with the native long-press handles, and the pill appears by the
selection. DCI's own long-press gesture is unchanged: it fires only on
annotated nodes, so the host keeps its own long press (text selection, the
context menu) everywhere else. In Select mode, a drag draws the window-select
box instead of selecting text, as today; the pill does not appear from a
Select-mode drag.

### 3.5 What the user sees in the chat

A text item appears as a chip like any other context item, with three
differences:

- Its label is a quoted excerpt: the first ~80 characters of the selected
  text, wrapped in quotes in the chip's accessible name, truncated with an
  ellipsis. The tooltip shows the fuller excerpt (up to the sent length).
- It carries a marker (A, B, C…) like element nodes, so "what does A say
  about X?" resolves.
- It has no `#id` suffix. Instead its small tag reads `text` (the same slot
  that reads `unannotated` for fallback chips today).
- Clicking a text chip scrolls its range into view (nearest) and flashes its
  highlight. Removing the chip (×) removes the context item and clears the
  highlight.

The breadcrumb is unchanged: it shows the path of the primary _element_
selection, or nothing when only text is selected. A text item's ancestors are
still sent (§5.3) and still shown in the request inspector.

## 4. Interaction details

### 4.1 When a range counts

A range is captured only when **all** of these hold:

- It is non-collapsed (`range.toString().trim()` is non-empty).
- It lies inside DCI's `root` (default `document.body`).
- It is not inside DCI's own UI, and not inside an `input`, `textarea`,
  `select`, or `contenteditable` element.
- It does not intersect a `private` node (§10.1).
- It is not inside a password field (a range cannot be inside one in
  practice; this is defence in depth, matching the fallback rule).

Whitespace-only selections, collapsed carets, and selections that are only
punctuation are not valid. The minimum captured length is 1 non-whitespace
character; there is no minimum word count.

### 4.2 The pill

- **Position:** anchored to the range's bounding rect, 8px above the rect
  when there is room in the viewport, otherwise 8px below it. Clamped
  horizontally to the viewport. Re-positioned on scroll / resize while it is
  visible; if the range scrolls out of view, the pill hides until the range
  is visible again.
- **Lifetime:** the pill appears on selection settle (mouseup, or the
  `selectionchange` event settling after a keyboard selection such as
  Shift+Arrow). It dismisses on Esc, on a click / tap outside the pill and
  the selection, when the native selection collapses or moves, or when its
  range is captured (it is replaced by the chat). It never auto-sends.
- **Host conflicts:** if the host app shows its own selection toolbar, DCI's
  pill is offset below the host toolbar's rect when they would overlap; if
  the host toolbar cannot be detected, DCI's pill still appears — a second
  small pill is less harmful than a missing action. The pill must never
  appear for a selection made inside DCI's own chat input.
- **Accessibility:** the pill is a real `<button>` in the Shadow DOM, with
  an accessible name ("Ask about this selection" / "Add selection to chat"),
  keyboard-focusable, and operable with Enter / Space. Capturing a range is
  announced politely ("Selected text added to chat, marker A"), matching the
  existing announcement pattern for element selection.

### 4.3 Capture timing

Capture reads `window.getSelection()` at the moment of the triggering action
(pill tap, Alt+Click, Alt+Enter) and clones the range immediately. It must
not read the selection on a delay: a click collapses a range on mouseup in
most browsers, and the Alt+Click path must capture on pointerdown, before
the marquee gesture's `preventDefault()` and before the click handler run.
See §12 for the spike that proves this ordering.

### 4.4 What does not change

- Alt+Drag window select: unchanged. While Alt is held, pointerdown still
  `preventDefault()`s to stop text selection, and a drag still draws the
  marquee box and selects nodes. Alt+Drag never produces a text item.
- Alt+Click with no live range: unchanged (select the nearest DCI node).
- Alt+Shift+Click, Alt+Double-click, Alt+Wheel, arrow-key navigation, Esc:
  unchanged. Esc closes the chat first, then clears the selection; a visible
  pill is dismissed by the first Esc before either of those.
- Select mode: unchanged, except that the pill never appears from a
  Select-mode drag.

## 5. Data model

### 5.1 A text context node

A text selection is a new `source` value on `DciContextNode`, additive
within protocol v1 (§8.3). It has no stable `id` and no element to re-find,
so its identity is its serialized range.

```json
{
  "label": "Q3 focus: convert Proposal-stage tent deals before…",
  "marker": "A",
  "data": {},
  "ancestors": [{ "id": "home", "type": "page", "label": "Sales Home" }],
  "source": "text",
  "text": {
    "excerpt": "Q3 focus: convert Proposal-stage tent deals before the winter catalog ships.",
    "truncated": false,
    "start": { "path": "main > div.card > p:nth-child(2)", "offset": 0 },
    "end": { "path": "main > div.card > p:nth-child(2)", "offset": 74 }
  }
}
```

| Field                     | Meaning                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `source`                  | `"text"` — new value; see §8.3 for versioning                                                                           |
| `label`                   | Short excerpt: the first ~80 characters, whitespace-collapsed                                                           |
| `marker`                  | As for element nodes (§6)                                                                                               |
| `data`                    | Always `{}` for text nodes in v1                                                                                        |
| `ancestors`               | Annotated ancestors of the range's common ancestor, root first, compact by default (§5.3)                               |
| `text.excerpt`            | The selected text, whitespace-collapsed, capped at `maxTextSelectionLength` (§9)                                        |
| `text.truncated`          | `true` when the selection was longer than the cap                                                                       |
| `text.start` / `text.end` | Serialized range endpoints: the CSS path of the endpoint's container element (§5.2) plus the character offset within it |

### 5.2 Serializing a range

A range is serialized as two endpoints. Each endpoint records:

- `path`: the short CSS path of the endpoint's container element, using the
  same `cssPath` helper as the fallback (`main > div.card >
p:nth-child(2)`, at most 5 levels, stopping at an `#id`).
- `offset`: the character offset within that container's text, measured in
  the same collapsed-whitespace text the excerpt is taken from, so
  re-highlighting can find the same characters again.

Deserialization resolves each path to an element, walks its text nodes to
the recorded offset, and rebuilds the range. If either endpoint cannot be
resolved (the DOM changed underneath the selection), the text item is
pruned, exactly as the selection store already prunes detached elements.
Deserialization is best-effort: a range that resolves to a nearby but not
identical span must not be silently sent as if it were exact — if the
resolved text does not match the stored excerpt (after collapsing
whitespace), the item is pruned and the chip is removed with a notice.

### 5.3 Ancestors

Ancestors are the annotated ancestors of the range's _common ancestor
container_ — the deepest element containing the whole range — resolved
through the DCI tree, compact (`id` / `type` / `label`) by default and full
when `ancestorData: 'full'`. A private ancestor appears only as
`{ "private": true }`, as for element nodes. When the range spans several
annotated containers, the common ancestor is the container; the individual
containers inside the range are not listed separately.

### 5.4 Limits

- `maxTextSelectionLength` caps the _sent_ excerpt (§9). The locally stored
  range is the full range; the highlight covers the full range even when the
  sent excerpt is capped.
- Text items count toward `maxSelection` (default 50) alongside element
  items. The `selectionlimit` event fires the same way when the cap is hit.
- One native selection produces one text item. Accumulating several text
  items means selecting, capturing, selecting again, capturing again — each
  capture is a separate chip, in capture order.

## 6. Selection store — unifying elements and text

Today the store is `Element[]` only (`selection.ts`) and the chat
controller tracks `pendingEls: Element[]` (`chat/controller.ts`). A text
range is not an element, so the store must gain a second item kind. The
spec mandates the _behaviour_, not the internal type name; the
implementation may use a discriminated union or a parallel list, but it
must satisfy all of these:

- `selection.get()` / `toContext()` return elements and text items in
  selection order, and markers are assigned in that same order across both
  kinds. Removing B from A, B, C leaves A and C; the next item added gets D.
  A new selection (a plain Alt+Click, or clearing) restarts from A.
- `selection.set([element])` replaces _both_ kinds. `selection.add()` /
  `remove()` / `toggle()` / `clear()` apply to whichever kind the argument
  names. `selection.has()` works for a text item by its serialized range.
- `toContext()` merges both kinds into one `DciContextNode[]` in selection
  order, so `previewRequest()` and the Playground request inspector show
  text and element items together.
- The chat controller's pending list tracks text items the same way it
  tracks elements: an item added since the last send is pending for the
  next message (`contextMode: 'turn'`); in `'cumulative'` mode it is
  re-sent with everything else. `removeContext(node)` removes a text item
  and clears its highlight. `elementFor(node)` returns `null` for a text
  item; chip click handling must use the range instead (§3.5).
- Node identity for de-duplication uses `id:` for element nodes and
  `text:<start.path>@<start.offset>-<end.path>@<end.offset>` for text
  nodes. Capturing the identical range twice is a no-op (the existing item
  keeps its marker); capturing an overlapping but different range creates a
  second item.
- Pruning: a MutationObserver (or a check at send time, whichever the
  implementation already uses for detached elements) drops text items whose
  range no longer resolves or whose resolved text no longer matches the
  stored excerpt (§5.2). Pruning a text item removes its chip and its
  highlight.

## 7. Highlight persistence

The native selection highlight disappears when the user clicks elsewhere,
so a captured range needs its own highlight to stay visible while its chip
is pending.

- Use the **CSS Custom Highlight API** (`CSS.highlights`, `Highlight`,
  `HighlightRegistry`): register one named highlight per captured text
  item, styled through `::highlight(dci-text)` in the Shadow DOM
  stylesheet, in the theme accent colour.
- Do not wrap the text in `<mark>` or any other element: that mutates the
  host DOM, breaks on re-render, and can change layout.
- Removing the chip deletes that item's highlight entry. Clearing the whole
  selection deletes all of them. `scrollTo` / chip click scrolls the range
  into view and flashes its highlight (the same flash the overlay already
  does for elements).
- Fallback when the Highlight API is unavailable: keep the native selection
  alive for as long as possible (do not collapse it on capture), and accept
  that the highlight may be lost when the user clicks elsewhere. The chip
  and the context item remain valid regardless — the highlight is a visual
  aid, not the context itself. The spec does not require a `<mark>` fallback.

**Deviation from the spec as written (shipped):** the `::highlight()` rule
cannot live in the Shadow DOM stylesheet the spec names — a shadow
stylesheet can only highlight text inside that shadow root, never the host
page's text. The rule therefore lives in a document-level adopted
stylesheet (with an injected `<style>` fallback), in the theme accent
colour. The highlight itself is one named registry entry (`dci-text`)
shared by all captured ranges, not one named highlight per item.

## 8. Protocol and server

### 8.1 Request

The request shape is unchanged. A text item travels as one entry of the
existing `context` array, with `source: 'text'` and the `text` object from
§5.1. No new request field, no new endpoint, no new `v`.

```json
{
  "v": 1,
  "sessionId": "b5d0c1e2-…",
  "prompt": "What does this imply for the winter catalog?",
  "context": [
    {
      "label": "Q3 focus: convert Proposal-stage tent deals before…",
      "marker": "A",
      "data": {},
      "ancestors": [{ "id": "home", "type": "page", "label": "Sales Home" }],
      "source": "text",
      "text": {
        "excerpt": "Q3 focus: convert Proposal-stage tent deals before the winter catalog ships.",
        "truncated": false,
        "start": { "path": "main > div.card > p:nth-child(2)", "offset": 0 },
        "end": { "path": "main > div.card > p:nth-child(2)", "offset": 74 }
      }
    }
  ],
  "page": { "url": "https://app.example.com/sales", "title": "Sales Home" }
}
```

### 8.2 Server rendering

`formatContextForPrompt` in `@samirdamle/dci-server` must render a text
item as a quoted block, with its marker, its excerpt, and its ancestor path,
so a backend that just prints context still gets something readable. The
shipped Markdown rendering is:

```text
1. Selected text A ("Q3 focus: convert Proposal-stage tent deals before the winter catalog ships." in Sales Home):
   > Q3 focus: convert Proposal-stage tent deals before the winter catalog ships.
```

The `text.start` / `text.end` endpoints are transport detail for the
client's highlight; the prompt rendering uses the excerpt and the ancestors
only, and must not include the serialized paths. `truncated: true` must be
surfaced in the rendering ("excerpt truncated to 2000 characters") so the
model knows it is not seeing the whole selection.

### 8.3 Versioning

This is additive within protocol v1: a new `source` value and a new
optional `text` field on a context node. Servers must already accept
unknown request fields, and clients must already ignore unknown events, so
no `v` bump is needed. Consequences the implementation must respect:

- Old servers that switch on `source` must handle `'text'` — the server
  package's formatter is updated in the same PR, and the Python example in
  `docs/protocol.md` gains a text branch in the same PR.
- `validateRequest` in `@samirdamle/dci-protocol` must accept
  `source: 'text'` with a `text` object, and reject a text node with no
  `text` object, the same way it rejects a fallback node with no `fallback`
  object today.
- The `DciContextNode` type gains `text?: DciTextInfo`. `fallback` stays
  exactly as it is; a node is never both `source: 'text'` and
  `source: 'fallback'`.

## 9. Public API and configuration

Only `endpoint` (or `transport`) is required, as today. The new options
are:

```ts nocheck
createDci({
  endpoint: '/api/dci',
  // Text selection. Default true.
  textSelection: true,
  // Characters of selected text sent per item. Default 2000.
  maxTextSelectionLength: 2000,
  // Label for the floating pill. Default 'Ask about this' / '+ Add to chat'.
  textSelectionAction: 'Ask about this',
  bindings: {
    // Capture a live text range. Default 'Alt+Enter'.
    // false disables the keyboard path; the pill still works.
    textSelect: 'Alt+Enter',
  },
});
```

Behaviour of the options:

- `textSelection: false` disables everything in this spec: no pill, no
  Alt+Click-on-range, no Alt+Enter capture. Element selection is untouched.
- `maxTextSelectionLength` is an integer ≥ 1; `validateConfig` rejects
  anything else in development, as it does for `maxTextLength` today.
- `textSelectionAction` relabels the pill only. It does not change the
  chat's suggested actions.
- `bindings.textSelect: false` disables the keyboard path only. The pill
  still works, and Alt+Click-on-range still works (subject to §12).

Instance API additions (names are proposed; the implementation PR may
rename with a note in the PR body, but must keep the behaviour):

```ts nocheck
// The live native selection as a text context node, or null when there is none.
dci.textSelection.get(): DciContextNode | null;
// Capture the live range as a context item. Returns false when there is none.
dci.textSelection.capture(): boolean;
// The text items currently selected.
dci.textSelection.items(): DciContextNode[];
// Remove one text item (clears its highlight).
dci.textSelection.remove(node: DciContextNode): void;
```

React: no new provider is needed. `useSelection()` must include text
items in its snapshot, and `useChat()` must already see them through
`pendingContext` — the implementation must verify both, and add a
`useTextSelection()` hook only if the snapshot shape cannot carry text
items without it. The `dci()` annotation helper is unchanged.

**Shipped:** no `useTextSelection()` hook was needed — `useSelection()`
includes text items in its snapshot (`nodes`), and `useChat()` sees them
in `pendingContext`. The instance API is `dci.textSelection` with
`get()` / `capture()` / `items()` / `remove(node)`, exactly as proposed
above.

## 10. Privacy and safety

### 10.1 Private nodes

Text inside a `private` node is never captured — the same rule as the
fallback, which never describes unannotated content inside a private node.
**Decision (spec, not left open):** if any part of a range intersects a
private node or its subtree, the whole capture is refused and the user is
told why ("Selection includes private content and was not added."). Partial
capture of the non-private part is rejected: it would be surprising — the
user selected words they can see, and silently dropping some of them would
make the model answer about a different quote than the one on screen. The
pill does not appear for a range that intersects a private node; Alt+Click
and Alt+Enter on such a range do nothing (and do not select the node
either — the existing private transparency rule already handles that).

**Shipped deviation:** the refusal reason exists (`validateTextRange`
returns `"Selection includes private content and was not added."`), but no
visible notice is surfaced to the user — the pill simply never appears and
the capture silently refuses. Surfacing that reason as a notice is
follow-up work, not part of this implementation.

The last line of defence from SPEC §5.3 applies unchanged: if a text item
whose excerpt came from a private node still reaches an outgoing request
(for example through `beforeSend`), development throws and production
strips it. `enforcePrivacy` must therefore check text items as well as
element nodes.

### 10.2 What is never captured

- Password fields (defence in depth; a range cannot be inside one).
- `input`, `textarea`, `select`, `contenteditable` content (§4.1).
- Anything outside DCI's `root`.
- Anything inside DCI's own UI, including the chat input and the pill.

### 10.3 Sending

Only captured text is ever sent, and only when the user sends a message —
the same rule as for element payloads. Selecting text sends nothing. The
pill appearing sends nothing. `beforeSend` sees text items in the request
and may redact, enrich, or cancel them exactly as for element nodes, and
`confirmBeforeSend` counts them in its "Sending N items" prompt.

## 11. Edge cases

- **Range spans several elements** (e.g. two paragraphs): capture the whole
  range as one item; ancestors come from the common ancestor (§5.3).
- **Range spans a shadow boundary:** supported when the boundary is an open
  shadow root (the path resolves through it); closed shadow roots are
  opaque, as for element selection — a range that crosses into one is
  refused with the same notice as §10.1.
- **Range in an iframe:** out of scope; refused, no pill.
- **Overlapping text items:** allowed as separate chips (§6). The highlight
  API handles overlapping ranges; the later item's highlight wins where
  they overlap.
- **Identical range captured twice:** a no-op; the existing item keeps its
  marker (§6).
- **Selection while a reply is streaming:** capture is allowed (it only
  adds pending context); sending follows the existing `concurrency` rule
  (`block` / `queue`).
- **Selection in the demo's Playground drawer or onboarding tour:** the
  pill must not appear inside DCI's own UI; the tour's sample text is
  selectable prose on the page, so it _is_ a valid target when it is
  outside the tour overlay.
- **Long selections:** the highlight covers the full range; only the excerpt
  is capped (§5.4). A selection of 100,000 characters still highlights in
  full, but sends at most `maxTextSelectionLength` characters.
- **Right-to-left and multi-line text:** the pill anchors to the range's
  bounding rect, which already covers multi-line ranges; no special casing.
- **Host selection toolbars:** §4.2. The pill yields positionally but never
  silently disappears when a valid range exists.

## 12. Implementation plan

### Phase 0 — Browser spike (before the implementation PR is written)

Prove, in a real browser (Chromium, Firefox, WebKit), two facts the spec
depends on:

1. **Alt+Click preserves a range.** With a live native selection, hold Alt,
   pointerdown on the highlighted text, then click: does
   `window.getSelection()` still hold the range at pointerdown, at click,
   and after the marquee gesture's `preventDefault()`? Record the result
   per browser. **Pass bar:** the range is intact at pointerdown in all
   three browsers, so capture-on-pointerdown is viable. If it fails in any
   browser, Alt+Click is dropped from v1 (pill + Alt+Enter only) and this
   spec is amended to say so before implementation starts.
2. **CSS Custom Highlight API support.** `CSS.highlights` exists and a
   `::highlight()` rule renders, in the browsers in
   `docs/compatibility.md`. Record which browsers need the §7 fallback.

**Result — PASS in all three browsers (spike run 2026-11-26, real mouse
drags, DCI running from the built workspace sources):**

| Browser                | Range intact at pointerdown | Range intact after the click settles | `::highlight()` renders                                    |
| ---------------------- | --------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| Chromium 141.0.7390.37 | yes                         | yes (56 chars, `[12, 68)`)           | yes — 29.3% magenta px in the range clip, 0 in the control |
| Firefox 142.0.1        | yes                         | yes (56 chars, `[12, 68)`)           | yes — 32.1% magenta px, 0 in the control                   |
| WebKit 26.0            | yes                         | yes (56 chars, `[12, 68)`)           | yes — 32.4% magenta px, 0 in the control                   |

Without DCI the range collapses (at click dispatch in Firefox, by settle in
Chromium/WebKit); with DCI running, the marquee gesture's pointerdown
`preventDefault()` keeps it alive past the click in all three, so
capture-on-pointerdown is viable everywhere. **Alt+Click stays in v1; no
browser needs the §7 fallback on current versions** (the fallback is still
specified for older browsers). The highlight check is a real render check
(screenshot pixels), not API presence: ~30% of the two-line range box is
solid magenta, the control paragraph has zero.

The spike is a short note in the implementation PR body, not a code change.
No implementation code is written until the spike passes or the scope is
cut to match its result.

### Phase 1 — Core (the implementation PR)

New module `packages/core/src/text-selection.ts` (capture, serialize,
deserialize, validate a range), plus:

- `packages/core/src/selection.ts`: unify the store (§6).
- `packages/core/src/chat/controller.ts`: pending text items, `nodeKey`,
  `removeContext`, privacy enforcement for text.
- `packages/core/src/chat/ui/chat-ui.ts`: text chips (§3.5), pill UI (§4.2),
  highlight flashing.
- `packages/core/src/overlay.ts` / highlight module: CSS Highlight
  registration (§7).
- `packages/core/src/interactions.ts` + `pointer.ts` + `keyboard.ts`:
  Alt+Click-on-range (pointerdown capture) and Alt+Enter precedence.
- `packages/protocol/src/types.ts` + `validate.ts`: `source: 'text'`,
  `DciTextInfo`, validation (§8.3).
- `packages/server/src/format.ts`: prompt rendering (§8.2).
- `packages/core/src/dci/config.ts`: new options + validation (§9).
- Docs: this spec, `docs/interactions.md` (gestures table + pill),
  `docs/annotations.md` (what gets sent), `docs/protocol.md` (Python
  example text branch), `docs/configuration.md` (new options), and the
  README's feature list if it gains a text-selection line.

No changeset is needed for the spec PR itself (docs only). The
implementation PR adds a changeset for `core` (minor), `protocol`
(minor), and `server` (minor), per CONTRIBUTING.md.

### Phase 2 — Demo and extension

- Demo: a deal-notes / comment surface where quoting a sentence is the
  obvious demo, plus a Playground toggle for `textSelection` and a request
  inspector entry showing the text item.
- Extension: the same capture on unannotated pages, where text is the
  primary content. The extension's `infer` already turns rows into records;
  text selection is the complement for prose. Privacy review in
  `docs/extension.md` must be updated alongside it.

### Phase 3 — Polish (separate issues, not this PR)

- Sentence / paragraph expansion from a word or a tap.
- Multi-range (Firefox) selections.
- Select-by-query building on text items ("all mentions of Acme").

## 13. Testing

### 13.1 Unit (Vitest, happy-dom where possible)

- Range serialization round-trip: serialize → deserialize → same text.
- Truncation at `maxTextSelectionLength`, with `truncated: true`.
- Private intersection refuses the whole range (§10.1).
- Marker assignment across mixed element + text selections; identical
  range captured twice is a no-op.
- `validateRequest` accepts `source: 'text'` with `text`, rejects it
  without `text`.
- `formatContextForPrompt` renders a text item as a quoted block, marks
  truncation, and omits serialized paths.

### 13.2 End-to-end (Playwright, demo, deterministic mock mode)

- Drag text → pill appears → tap → chat opens with a text chip; ask; the
  mock responder receives the excerpt (assert on the request inspector).
- Add text to an already-open chat: chip appears in pending context, no
  auto-send, draft untouched.
- Alt+Click on a range captures it (or is absent with spike evidence).
- Alt+Enter with a range captures it; Alt+Enter without a range selects
  the focused node as today.
- Alt+Drag still window-selects nodes and never produces a text item.
- Remove a text chip → highlight gone, context gone.
- Esc dismisses the pill; Esc with no pill closes the chat first, then
  clears the selection.
- Private text: no pill, no capture, with the notice.
- Axe checks on the pill and on a chat containing a text chip.

**Shipped:** all of the above is covered by `e2e/text-selection.spec.ts`
(10 tests), run in Chromium, Firefox and WebKit against the Sales Home
"Org notes" prose (private case: the account record's Credit Limit field).
Two qualifications: the highlight is asserted at the DOM/CSS level
(`CSS.highlights` registry membership), not by pixels — pixel rendering is
spike-verified in §12; and the private case asserts no pill / no capture
only — the §10.1 notice is not surfaced by the shipped UI (see §10.1),
so there is no notice to assert.

Happy-dom has no layout engine, so anything geometric (pill position,
highlight rendering) is Playwright-only, matching the existing split in
CONTRIBUTING.md.

### 13.3 Performance and compatibility

- No new idle listeners: text selection is observed via
  `selectionchange` / mouseup only, and only while a selection exists.
  The existing perf budget ("no work until the modifier is pressed") needs
  a stated exception or a revised budget for the pill listener, decided in
  the implementation PR and recorded in `docs/compatibility.md`.
- CSS Highlight support is checked at runtime; the §7 fallback must not
  throw where the API is absent.

## 14. Documentation to update with the implementation

- This spec (`docs/text-selection.md`) — status Draft → Implemented, with
  the spike result recorded in §12.
- `docs/interactions.md` — pill, Alt+Click-on-range, Alt+Enter precedence.
- `docs/annotations.md` — "What gets sent" gains the text node.
- `docs/protocol.md` — request example with a text node, Python text
  branch.
- `docs/configuration.md` — `textSelection`, `maxTextSelectionLength`,
  `textSelectionAction`, `bindings.textSelect`.
- `SPEC.md` §11 — add text selection as a done post-v1 item, pointing at
  this spec.
- `docs/README.md` — add this spec to the guide table.

## 15. Open questions remaining

None that block writing the implementation PR, except the Phase 0 spike
(§12). If the spike cuts Alt+Click, this spec is amended before
implementation starts; the pill and Alt+Enter paths are unaffected by its
outcome.

**Follow-ups filed from the implementation (not blockers):** surfacing the
§10.1 private-refusal reason as a visible notice (the reason string exists
in `validateTextRange`, but the UI never shows it).
