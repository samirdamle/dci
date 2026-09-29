# Compatibility

What DCI supports, how each item is verified, and the known limitations.

## Browsers

| Browser | Supported versions | Engine tested in CI        | How                               |
| ------- | ------------------ | -------------------------- | --------------------------------- |
| Chrome  | latest 2           | Chromium (Playwright 1.56) | every PR (`pnpm e2e`) and nightly |
| Edge    | latest 2           | Chromium (same engine)     | covered by the Chromium runs      |
| Firefox | latest 2           | Firefox (Playwright 1.56)  | nightly (`PW_ALL_BROWSERS=1`)     |
| Safari  | latest 2 (16.4+)   | WebKit (Playwright 1.56)   | nightly (`PW_ALL_BROWSERS=1`)     |

The nightly workflow (`.github/workflows/nightly.yml`) runs the full e2e suite
in all three engines on Linux, macOS and Windows, plus the runtime perf budgets
in Chromium.

The core relies on these platform features, all available in the versions above:
ES2020, Pointer Events, `Event.composedPath()`, `ResizeObserver`, custom
elements with open shadow roots, and constructable stylesheets
(`adoptedStyleSheets`, Safari 16.4+). Where constructable stylesheets are
missing, DCI falls back to a `<style>` element in its shadow root, which needs
`style-src 'unsafe-inline'` under a CSP.

## Operating systems and the modifier key

| OS      | Default modifier | Notes                                                                                                                                                                                                                                      |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS   | Option (⌥)       | Option changes printable characters (⌥+A types `å`), so DCI reads `altKey`, never `event.key`. Option+Click on a link normally downloads it; DCI consumes the click on annotated elements, so no download starts.                          |
| Windows | Alt              | A bare Alt press and release focuses the browser menu bar (Firefox, and Chrome/Edge on some setups). DCI calls `preventDefault()` on that `keyup` **only** when a DCI gesture used the press, so a plain Alt tap still opens the menu bar. |
| Linux   | Alt              | Some window managers bind Alt+Drag to move windows, so Alt+Drag never reaches the page. Use another modifier (`modifier: 'Control'`) or Alt+Click to add items one by one.                                                                 |

Any of `Alt`, `Control`, `Meta` or `Shift` can be the modifier (`createDci({ modifier })`).
Held modifiers are re-checked on every event, so a modifier released while the
window lost focus disarms DCI instead of sticking.

## Content Security Policy

DCI works under a strict policy such as:

```
default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'
```

- No `eval`, `new Function` or inline scripts.
- Styles are applied with constructable stylesheets inside DCI's shadow root, so
  `'unsafe-inline'` is not needed. Positions are set through the CSSOM
  (`element.style.left = …`), which CSP allows.
- Chat Markdown is rendered by building DOM nodes, never `innerHTML`, so pages
  enforcing Trusted Types (`require-trusted-types-for 'script'`) also work.
- `connect-src` must allow your chat endpoint (the SSE transport uses `fetch`).

Verified by `e2e/compat.spec.ts` against `apps/demo/compat.html`, which sets
the policy above and fails on any `securitypolicyviolation` event.

## Shadow DOM

Annotated nodes inside **open** shadow roots of your own web components are
found, highlighted and selected like light-DOM nodes: hit-testing uses
`composedPath()` and the tree walk descends into `shadowRoot`. The DCI tree
crosses shadow boundaries, so `ArrowUp` from a node in a component's shadow
root reaches its annotated host. Verified by `e2e/compat.spec.ts`.

DCI's own UI (overlay, chat, live region) renders inside a shadow root on
`<dci-root>`, so it neither inherits nor leaks page styles.

## Performance budgets

Bundle sizes (min+gzip), enforced in CI by `pnpm size` (`.size-limit.json`):

| Package                                                                | Budget | Measured |
| ---------------------------------------------------------------------- | ------ | -------- |
| `@dci/protocol`                                                        | 2 KB   | 1.47 KB  |
| `@dci/core` headless (gestures, selection, chat controller, transport) | 15 KB  | 14.01 KB |
| `@dci/core` full (`createDci` with overlay, floating-ui, chat UI)      | 40 KB  | 31.34 KB |
| `@dci/react` on top of core                                            | 2 KB   | 1.13 KB  |
| `@dci/server`                                                          | 4 KB   | 2.03 KB  |

The headless budget was raised from the 12 KB target to 15 KB after measuring:
it includes the chat controller, SSE parser and action registry as well as the
gestures.

Runtime budgets, measured in Chromium with CDP by `pnpm e2e:perf`
(`e2e/perf/runtime.perf.ts`, nightly):

| Budget                                                            | Result                           |
| ----------------------------------------------------------------- | -------------------------------- |
| Idle: only `keydown`, `keyup` and `blur` listeners; no long tasks | pass                             |
| Hover at 60 fps on a 10,000-node page                             | p95 frame 16.7 ms, no long tasks |
| Window select at 60 fps with 1,000 candidates                     | p95 frame 16.8 ms, no long tasks |
| 200 selected boxes follow scrolling at 60 fps                     | p95 frame 16.8 ms, no long tasks |
| 50 create/destroy cycles                                          | no retained nodes or listeners   |

"60 fps" means a p95 `requestAnimationFrame` delta under 20 ms with no long
tasks. Tracing is disabled in the perf project because it skews frame times.

## Known limitations

- **Closed shadow roots** are opaque: annotated nodes inside them can't be
  found. Annotate the host element instead.
- **iframes** are not traversed. Run a separate DCI instance inside a
  same-origin frame if you need it there; cross-origin frames are out of reach.
- **Touch** devices have no gesture yet (planned: long-press or a toggle mode).
  Programmatic selection (`dci.selection.set()`) works everywhere.
- **Alt+Drag on Linux** can be taken by the window manager (see above).
- **No constructable stylesheets** (Safari before 16.4): styles fall back to
  `<style>`, which a strict CSP blocks unless it allows `'unsafe-inline'`.
- The Firefox and WebKit rows are verified by the nightly matrix, not on every
  PR; check the latest Nightly run for their current status.
