---
'@samirdamle/dci-core': patch
---

Cross-browser fixes found by the nightly Firefox and WebKit runs:

- Window select applies the box where the pointer was released. It used the last per-frame preview, so a fast drag released before the next frame could select nothing (seen in WebKit on Linux).
- The chat popover shrinks to the space on the side it flips to when it doesn't fit above or below its targets, instead of shifting over them or off screen.
