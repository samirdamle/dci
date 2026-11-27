---
'@samirdamle/dci-core': minor
'@samirdamle/dci-protocol': minor
'@samirdamle/dci-server': minor
---

Select text, not just elements, and ask about exactly those words. Drag over prose and capture the range as a first-class context item: it gets a marker (A, B, C…), counts toward the same selection limits as element selections, and travels as a `source: 'text'` context node with the excerpt and its serialized range endpoints.

- **Protocol:** `DciContextNode` gains an optional `text` (`DciTextInfo`: excerpt, truncation flag, start/end endpoints) and `source: 'text'`; `validateRequest` accepts it and rejects a text node with a missing or malformed `text` object.
- **Server:** `formatContextForPrompt` renders a text item as a quoted block (XML gets a `<text>` child, Markdown the `Selected text A ("…" in <path>):` block with a `> excerpt` quote), surfaces truncation, and never includes the serialized range endpoints.
- **Core:** a new `text-selection` module (`captureTextRange`, `serializeRange` / `deserializeRange`, `validateTextRange`, `textNodeKey`) plus a unified selection store — `textItems()`, `items()`, `addText()` / `removeText()` / `hasText()` / `markerForText()`, mixed markers across kinds, and pruning of ranges that no longer resolve or match. New options: `textSelection` (default `true`), `maxTextSelectionLength` (default `2000`), `textSelectionAction` (default `'Ask about this'`), and `bindings.textSelect` (default `'Alt+Enter'`).
