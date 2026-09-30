# DCI browser extension

DCI on any website: turn it on for a tab, hold **Alt** (Option on macOS), click what you mean (a
row, a price, a paragraph) and ask about it. Built on `@samirdamle/dci-core`, so it has the same
gestures, highlight and chat as an app that integrates DCI.

> Not in the browser stores yet: load it unpacked (below). The user guide, including the privacy
> review, is [docs/extension.md](../../docs/extension.md).

## Try it

```sh
pnpm install
pnpm --filter @dci/extension build   # dist/chrome and dist/firefox
```

- **Chrome / Edge:** open `chrome://extensions`, turn on Developer mode, **Load unpacked** and pick
  `apps/extension/dist/chrome`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on** and pick
  `apps/extension/dist/firefox/manifest.json`.

Then, on any page, open the DCI toolbar popup and choose **Turn on for this tab** (or press
**Alt+Shift+D**). The badge shows **ON**; hold Alt and click something, then ask. **Always on for
this site** starts DCI on every page of that site. A page that integrates DCI itself keeps its
own, and the badge shows **—**.

## Where answers come from

Choose in the extension's options (the popup's **Options** link):

| Backend             | Setup                                             | Notes                                                                                                 |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Offline placeholder | None (the default)                                | Canned replies, to try the gestures                                                                   |
| Claude              | Your Anthropic API key, and a model               | Called directly from the extension's background worker; follow-up questions keep the conversation     |
| Your DCI endpoint   | Its URL, and optionally an `Authorization` header | Any backend speaking [the DCI protocol](../../docs/protocol.md); the browser asks to allow its origin |

**Test connection** sends a short question through the chosen backend. Keys and headers stay in
the extension: the background worker reads them, web pages and the content script never do.

## How it works

| Piece             | Where               | What it does                                                                                                                                                           |
| ----------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content script    | `src/content.ts`    | Injected on demand; runs `createDci()` with the inference rules below, so unannotated pages work                                                                       |
| Inference rules   | `src/infer.ts`      | Turns table rows (one field per column), list items, articles, headings, links, buttons, images, form fields and landmarks into DCI nodes; never reads password values |
| Port transport    | `src/transport.ts`  | A DCI `Transport` that sends each request to the background worker over a runtime port; Stop disconnects it                                                            |
| Background worker | `src/background.ts` | Injects the content script (`activeTab`), keeps the badge in sync, answers requests with the configured backend (`src/worker.ts`)                                      |
| Backends          | `src/backends/`     | Where requests are answered: offline, Claude (your key) or your DCI endpoint                                                                                           |
| Manifests         | `src/manifest.ts`   | One source for Chrome (service worker) and Firefox (event page)                                                                                                        |

No host permissions are requested up front: DCI only runs on tabs where you turn it on. The
browser asks separately for each always-on site and for your endpoint's origin.

## Scripts

| Command                                 | What it does                                               |
| --------------------------------------- | ---------------------------------------------------------- |
| `pnpm --filter @dci/extension build`    | Build `dist/chrome` and `dist/firefox`                     |
| `pnpm --filter @dci/extension zip`      | Build and pack `dist/dci-<browser>-<version>.zip`          |
| `pnpm --filter @dci/extension test`     | Unit tests (transport, worker, settings, manifests)        |
| `pnpm e2e --project=extension`          | Load the extension into Chromium and drive it (Playwright) |
| `node apps/extension/scripts/icons.mjs` | Redraw the icons in `static/icons`                         |
| `pnpm extension:screenshots`            | Retake the store screenshots in `store/screenshots`        |

Store listing text, permission justifications and data disclosures are in
[`store/listing.md`](store/listing.md).
