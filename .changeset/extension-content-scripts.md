---
'@samirdamle/dci-core': patch
---

Groundwork for the DCI browser extension:

- DCI runs in browser-extension content scripts, where `customElements` is `null`; its `<dci-root>` host now works without a custom element registry.
- Chips for unannotated (fallback) nodes are named by what the user sees (ARIA label, alt text, title or the first 40 characters of text) instead of the tag name.
