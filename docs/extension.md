# Browser extension

The DCI extension brings DCI to any website, including sites that were never annotated. Turn it
on for a tab, hold **Alt** (Option on macOS), click what you mean (a table row, a price, a
paragraph) and ask about it. It uses `@samirdamle/dci-core`, so the gestures, highlights and chat
are the same as in an app that integrates DCI.

- [Install](#install)
- [Use it](#use-it)
- [Where answers come from](#where-answers-come-from)
- [How unannotated pages get structure](#how-unannotated-pages-get-structure)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Build, test and package](#build-test-and-package)

## Install

The extension isn't in the Chrome Web Store or on Firefox Add-ons yet. Until it is, build it and
load it unpacked:

```sh
pnpm install
pnpm --filter @dci/extension build   # apps/extension/dist/chrome and dist/firefox
```

- **Chrome, Edge, Brave, Arc (Chromium 121+):**
  1. Open `chrome://extensions` and turn on **Developer mode**.
  2. Click **Load unpacked** and pick `apps/extension/dist/chrome`.
- **Firefox 128+:**
  1. Open `about:debugging#/runtime/this-firefox`.
  2. Click **Load Temporary Add-on** and pick `apps/extension/dist/firefox/manifest.json`.
  3. Temporary add-ons are removed when Firefox restarts.

Pin the DCI icon to the toolbar so the popup is one click away.

## Use it

1. **Turn it on for a tab.** Use the popup's **Turn on for this tab**, or press **Alt+Shift+D**.
   The toolbar badge shows **ON**. The same action turns it off again.
2. **Point.** Hold **Alt** and click something. Every DCI gesture works, from Alt+Shift+Click to
   add, Alt+Drag to window-select and Alt+Double-click to select everything of the same kind, to
   the arrow keys to move through the page's structure. See
   [Interactions](interactions.md) for the full list.
3. **Ask.** Type a question in the chat next to the selection and press Enter.

Other things to know:

- **Always on for this site** in the popup starts DCI on every page of that site. The browser
  asks to allow that one site first.
- **Pages with their own DCI:** a page that already integrates DCI keeps its own, and the badge
  shows **—**.
- **Navigation:** navigating to a new page turns DCI off in that tab, unless the site is always
  on.
- **Settings:** the options page sets the modifier key, where the chat opens (next to the
  selection, or docked as a side panel) and the selection limit.

## Where answers come from

Choose a backend on the options page, then use **Test connection** to check it:

| Backend                 | Setup                                             | What happens                                                                                                                                        |
| ----------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Offline placeholder** | None (the default)                                | Canned replies, so you can try the gestures. Nothing leaves the browser.                                                                            |
| **Claude**              | An Anthropic API key and a model                  | The extension's background worker calls the Claude API directly with your key. Follow-up questions keep the conversation (the last 40 messages).    |
| **Your DCI endpoint**   | Its URL, and optionally an `Authorization` header | Any backend that speaks [the DCI protocol](protocol.md), for example one built with `@samirdamle/dci-server`. The browser asks to allow its origin. |

Notes on each backend:

- **Claude:**
  - The default model is `claude-opus-5-5`; Sonnet 5.5 (faster) and Haiku 4.5 (cheapest) are the
    alternatives.
  - Usage is billed to your Anthropic account.
- **Your DCI endpoint:**
  - An `Authorization` header is only ever sent over **https**; plain http is allowed for
    `localhost` only.
  - The endpoint can use DCI's client actions to highlight, select and scroll to nodes on the
    page, the same as in an app.

## How unannotated pages get structure

Apps that integrate DCI describe their data with `data-dci` annotations. Most websites have none,
so the extension infers structure from ordinary HTML, using core's
[`infer` option](annotations.md#inferred-annotations):

| On the page                  | Becomes                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Table rows                   | A `row` with one field per column, named after the header                           |
| Tables, list items, articles | `table` (caption or name), `list item`, `article` (title and text)                  |
| Headings, links, buttons     | `heading` (with its level), `link` (with its address), `button`                     |
| Images                       | `image` with its alt text (decorative images are skipped)                           |
| Form fields                  | `field` with its value; checkboxes and radios with their state; **never passwords** |
| Landmarks and ARIA roles     | Main content, navigation, sidebars, headers, footers, named forms and sections      |

So Alt+Click on a table cell selects its whole row, Alt+Double-click selects every row, and the ↑
key walks from a row to its table to the page's main content. Anything else is described by DCI's
[fallback](annotations.md#fallback-unannotated-elements): its tag, visible text and a short CSS
path.

## Privacy

This section is the privacy and security review of the extension
([#95](https://github.com/samirdamle/dci/issues/95)). It doubles as the privacy policy for the
store listings.

### In short

- The extension collects nothing on its own: no analytics, telemetry or tracking, and no remote
  code.
- Nothing leaves your browser until you send a question. When you do, it goes only to the backend
  you chose.
- Your API key and endpoint header are read only by the extension's background worker and options
  page. They are never given to web pages.

### What is sent, and when

Only when you send a question in the chat, and only to the backend you chose (nowhere, for the
offline placeholder):

- **Your question.**
- **The items you selected:**
  - their inferred or annotated fields;
  - for other elements, the tag, visible text (up to 500 characters), `aria-label`, `alt`,
    `title`, link address, a form field's value if you selected that field, and a short CSS path;
  - the chain of items they sit in (for example, the table and page region around a row).
- **The page's address and title.** Before sending, the address is cleaned:
  - the `#fragment` and any `user:password@` are removed;
  - query parameters that commonly carry credentials (`token`, `access_token`, `code`, `key`,
    `secret`, `password`, `session`, `sig`, `X-Amz-…` and similar) are replaced with `redacted`.

Password fields are never read: selecting one sends only its label.

Other form values are sent only if you select that field itself: the text of a row or section never
includes what's typed into its fields. Text shown elsewhere on the page is not sent unless you
select it. Hovering, selecting and browsing send nothing.

### What is stored

| What                                                 | Where                                    | How long                        |
| ---------------------------------------------------- | ---------------------------------------- | ------------------------------- |
| Settings (backend, model, modifier, always-on sites) | `storage.local`, in this browser profile | Until you change or uninstall   |
| API key and endpoint `Authorization` header          | `storage.local`, in this browser profile | Until you clear or uninstall    |
| Claude conversations (the last 40 messages each)     | `storage.session`                        | Until the browser closes        |
| Whether DCI is on in each tab                        | `storage.session`                        | Until the tab or browser closes |

Nothing uses `storage.sync`, so none of this is copied to other devices by the browser.

### Permissions

| Permission                                     | Why                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                    | Run DCI in the current tab when you turn it on. There is no access to other tabs.                                   |
| `scripting`                                    | Inject the DCI content script into that tab, and register it for the always-on sites you allowed.                   |
| `storage`                                      | Keep your settings, key and conversations (above).                                                                  |
| Optional host access, **one origin at a time** | Requested when you make a site always-on, or save an endpoint (to reach its origin). Nothing is granted at install. |

On Firefox, the manifest declares the data it transmits (`websiteContent` and `browsingActivity`:
the selected content and the page's address) under Firefox's data collection permissions.

### Protections

- **Keys stay out of pages:**
  - Web pages can't read extension storage.
  - The content script (the extension code that runs on the page) reads only the non-secret
    settings.
  - Requests go from the content script to the background worker, which adds the credentials and
    calls the backend. Responses come back as text.
- **Only the extension's own pages can make privileged requests.** The worker accepts "turn DCI on
  in a tab" and "test the connection" only from the popup and the options page, not from content
  scripts.
- **Credentials only over https.** An `Authorization` header is never sent to a plain-http
  endpoint, except on `localhost`.
- **Model output can't run code:**
  - Answers are rendered by DCI's Markdown renderer, which builds DOM nodes and never uses
    `innerHTML`.
  - Links open only `http`, `https` and `mailto` addresses, in a new tab with
    `rel="noopener noreferrer"`.
  - The chat lives in a shadow root, so the page's styles can't change it.
- **Page content is treated as untrusted:**
  - The Claude backend's system prompt tells the model that selected page content is data, not
    instructions.
  - The model has no tools, so a page that tries prompt injection can at worst produce a
    misleading answer.
  - Endpoint client actions can only highlight, select and scroll.
- **Strict extension CSP:** `script-src 'self'; object-src 'none'; base-uri 'none'`. The package
  contains no remote code and no `eval`.

### Known limitations

- **Content scripts can read local storage.** Browsers give an extension's content scripts access
  to `storage.local`, and the key lives there. DCI's content script never reads the `secrets`
  entry, and web pages can't reach it, but a browser bug that let a page take over a content
  script could. If that risk matters to you, use an endpoint you run instead of a key in the
  browser.
- **The page can see the chat.** The chat is drawn inside the page, so the page's own scripts can
  read the questions and answers shown in it, as they can read anything else on the page. They
  can't see your key or call your backend. Keep this in mind before typing something private
  while on a site you don't trust.
- **Visible data reaches the backend.** If you select something that shows personal data, that
  data goes to your backend. The extension can't tell what's sensitive on an arbitrary page.

## Troubleshooting

| Symptom                                        | Fix                                                                                                                                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing happens on **Turn on** or Alt+Shift+D  | Browser pages (`chrome://`, `about:`, the extension stores, the new-tab page) don't allow extensions. Try a normal website.                                                                                          |
| The badge shows **—**                          | The page runs its own DCI, which takes precedence.                                                                                                                                                                   |
| Alt+Click opens a menu or does something else  | Your OS or another extension uses Alt+Click. Choose another modifier key on the options page.                                                                                                                        |
| The chat says to set up a backend              | The chosen backend is missing its key or URL. Open the options, fill it in, then **Test connection**.                                                                                                                |
| "Your Anthropic API key was rejected"          | Check the key at [platform.claude.com](https://platform.claude.com/) and paste it again.                                                                                                                             |
| The endpoint test fails                        | Check the URL, that the browser was allowed to reach its origin (the options page asks when you save), and that the endpoint speaks [the DCI protocol](protocol.md). Use https if you set an `Authorization` header. |
| DCI turned off after I clicked a link          | A new page is loaded without DCI. Use **Always on for this site** to keep it on.                                                                                                                                     |
| Firefox: the extension is gone after a restart | Temporary add-ons are removed on restart; load it again (or install the signed build once it's listed).                                                                                                              |

## Build, test and package

From the repository root:

| Command                                                                 | What it does                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm --filter @dci/extension build`                                    | Build `apps/extension/dist/chrome` and `dist/firefox`                        |
| `pnpm --filter @dci/extension zip`                                      | Build, then pack reproducible store zips: `dist/dci-<browser>-<version>.zip` |
| `pnpm --filter @dci/extension test`                                     | Unit tests                                                                   |
| `pnpm e2e --project extension`                                          | Load the Chrome build into Chromium and run the extension's e2e tests        |
| `pnpm dlx web-ext@8.10.0 lint --source-dir apps/extension/dist/firefox` | Lint the Firefox build the way addons.mozilla.org does                       |
| `pnpm extension:screenshots`                                            | Retake the store screenshots in `apps/extension/store/screenshots`           |

CI builds both zips on every pull request, lints the Firefox build with `web-ext` and uploads the
zips as the `extension-zips` artifact. Store submission is done by hand, using the listing text in
[`apps/extension/store/listing.md`](../apps/extension/store/listing.md).
