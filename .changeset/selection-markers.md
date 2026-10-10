---
'@samirdamle/dci-protocol': minor
'@samirdamle/dci-server': minor
'@samirdamle/dci-core': minor
---

Selection markers: each selected node gets a short marker (A, B, C… by default) shown as a badge on the top-left corner of its selection box and on its chat chip, so users can say "Compare A and B".

- **Protocol:** context nodes carry an optional `marker`.
- **Server:** `formatContextForPrompt` includes markers and explains them to the model.
- **Core:** a new `markers` option: `'letters'` (default), `'numbers'`, a custom `(index) => string` series, or `false`. Markers follow selection order, are kept while a node stays selected, and start over with a new selection. A new theme token, `--dci-on-selected`, colours the badge text. `SelectionStore` gains `marker(el)`.
