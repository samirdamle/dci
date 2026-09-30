# Store listings

Text and answers for the Chrome Web Store and Firefox Add-ons (addons.mozilla.org). Submission is
done by hand. Upload the zips that `pnpm --filter @dci/extension zip` builds, or the
`extension-zips` artifact from CI.

| Store            | Upload                           | Screenshots (1280×800)                                                  |
| ---------------- | -------------------------------- | ----------------------------------------------------------------------- |
| Chrome Web Store | `dist/dci-chrome-<version>.zip`  | `screenshots/1-point-and-ask.png`, `2-whole-table.png`, `3-options.png` |
| Firefox Add-ons  | `dist/dci-firefox-<version>.zip` | The same three                                                          |

Firefox asks for the source code when a build is bundled. Upload a zip of the repository at the
release tag, with these build steps: `pnpm install --frozen-lockfile`, then
`pnpm --filter @dci/extension zip`.

The icon is `static/icons/128.png`. Retake the screenshots with `pnpm extension:screenshots`.

## Name

DCI: point, then ask

## Summary (132 characters max)

Hold Alt and click anything on a page (a row, a price, a paragraph) to ask an AI about exactly
that.

## Category

- Chrome: Productivity (Tools)
- Firefox: Productivity

## Description

Stop describing what's on your screen. Point at it.

DCI (Direct Contextual Intelligence) lets you ask an AI about exactly the part of a page you mean.
Turn it on for a tab, hold Alt (Option on a Mac) and click a table row, a price, a paragraph or a
form field. A chat opens next to it; ask your question, and the answer is about that item, with
its details, not a guess from a screenshot or a pasted blob of text.

**Point at anything**

- Alt+Click selects one thing: a whole table row, with every column as a field.
- Alt+Shift+Click adds more; Alt+Drag selects everything in a box.
- Alt+Double-click selects everything of the same kind, such as every row of a table.
- The arrow keys move to the surrounding item (row → table → page section) and back.

**Your choice of AI**

- Claude, with your own Anthropic API key (Opus 5.5, Sonnet 5.5 or Haiku 4.5).
- Any backend that speaks the open DCI protocol, such as your company's own.
- An offline placeholder to try the gestures, with no setup.

**Private by design**

- Nothing leaves your browser until you send a question, and then only to the backend you chose.
- No analytics, no tracking, no account.
- Your key is read only by the extension's background worker, never by web pages.
- Password fields are never read.
- No access to any site until you turn DCI on in a tab or allow one site to be always on.

DCI is open source (MIT): https://github.com/samirdamle/dci

## Privacy policy

https://github.com/samirdamle/dci/blob/main/docs/extension.md#privacy

## Chrome Web Store: privacy practices

**Single purpose:** Let the user select parts of the current web page and ask an AI backend of
their choice about the selected content.

**Permission justifications:**

| Permission       | Justification                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| activeTab        | Runs DCI only in the tab where the user turns it on, from the toolbar popup or keyboard shortcut.                                                        |
| scripting        | Injects the DCI content script into that tab, and registers it for sites the user chose to keep always on.                                               |
| storage          | Stores the user's settings, their API key or endpoint header, and the current conversation (session storage, cleared when the browser closes).           |
| Host permissions | Optional and requested one origin at a time: a site the user makes always-on, or the origin of the user's own DCI endpoint. None are granted at install. |

**Remote code:** No. All code is in the package.

**Data usage.** These data types are sent only when the user sends a question, and only to the AI
backend the user configured:

- **Website content:** the page elements the user selected.
- **Web history:** the current page's address (with credentials and fragments removed) and title.

Tick these certifications:

- The data is not sold to third parties.
- The data is not used or transferred for purposes unrelated to the item's single purpose.
- The data is not used or transferred to determine creditworthiness or for lending purposes.

## Firefox Add-ons: data collection

The manifest declares `data_collection_permissions.required`: `websiteContent` and
`browsingActivity`. They cover the selected content and the page's address, which are sent to the
user's chosen backend when they send a question.

## Notes for reviewers

- **Trying it without an API key:** turn DCI on for any web page (toolbar popup → **Turn on for
  this tab**), hold Alt and click a table row or paragraph, and ask a question. The default offline
  backend answers with placeholder text, so no key or network access is needed.
- **The Claude backend** calls `https://api.anthropic.com` from the background worker, with the
  key the user enters on the options page.
- **The endpoint backend** calls a URL the user enters, after the browser grants that one origin.
