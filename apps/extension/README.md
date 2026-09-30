# DCI browser extension

DCI on any website: turn it on for a tab, hold **Alt** (Option on macOS), click what you mean (a
row, a price, a paragraph) and ask about it. Built on `@samirdamle/dci-core`, so it has the same
gestures, highlight and chat as an app that integrates DCI.

> **Status:** early work in progress, tracked in [#88](https://github.com/samirdamle/dci/issues/88).
> Answers come from an offline placeholder for now; real backends (your DCI endpoint, or Claude
> with your API key) are next.

## Try it

```sh
pnpm install
pnpm --filter @dci/extension build   # dist/chrome and dist/firefox
```

- **Chrome / Edge:** open `chrome://extensions`, turn on Developer mode, **Load unpacked** and pick
  `apps/extension/dist/chrome`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on** and pick
  `apps/extension/dist/firefox/manifest.json`.

Then, on any page, click the DCI toolbar button (or press **Alt+Shift+D**). The badge shows
**ON**; hold Alt and click something. Click the button again to turn DCI off. A page that
integrates DCI itself keeps its own, and the badge shows **—**.

## How it works

| Piece             | Where               | What it does                                                                                                                      |
| ----------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Content script    | `src/content.ts`    | Injected on demand; runs `createDci()` in fallback mode, so unannotated pages work                                                |
| Port transport    | `src/transport.ts`  | A DCI `Transport` that sends each request to the background worker over a runtime port; Stop disconnects it                       |
| Background worker | `src/background.ts` | Injects the content script (`activeTab`), keeps the badge in sync, answers requests with the configured backend (`src/worker.ts`) |
| Backends          | `src/backends/`     | Where requests are answered; keys will live here, never in the page                                                               |
| Manifests         | `src/manifest.ts`   | One source for Chrome (service worker) and Firefox (event page)                                                                   |

No host permissions are requested: DCI only runs on tabs where you turn it on.

## Scripts

| Command                                 | What it does                                               |
| --------------------------------------- | ---------------------------------------------------------- |
| `pnpm --filter @dci/extension build`    | Build `dist/chrome` and `dist/firefox`                     |
| `pnpm --filter @dci/extension zip`      | Build and pack `dist/dci-<browser>-<version>.zip`          |
| `pnpm --filter @dci/extension test`     | Unit tests (transport, worker, settings, manifests)        |
| `pnpm e2e --project=extension`          | Load the extension into Chromium and drive it (Playwright) |
| `node apps/extension/scripts/icons.mjs` | Redraw the icons in `static/icons`                         |
