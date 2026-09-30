---
'@samirdamle/dci-core': minor
---

Add the `infer` option: a function `(el) => annotation | null` that gives elements without `data-dci` an annotation, so pages without annotations (or with only a few) still get structure. Real annotations always win, inferred nodes are sent as `source: 'annotated'`, and DCI's own UI is never inferred. Call `refreshInferred()` after the page changes if you need fresh results before the next arm or send.
