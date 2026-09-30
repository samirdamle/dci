# Contributing to DCI

Thanks for helping! This guide covers setup, the scripts you'll use, and the conventions the CI
checks enforce. Please follow the [code of conduct](CODE_OF_CONDUCT.md).

## Setup

Requires Node 22.12+ (see `.nvmrc`) and pnpm (pinned via `packageManager`; `corepack enable` picks
it up).

```sh
nvm use
corepack enable
pnpm install
pnpm dev      # the demo at http://localhost:5173, plus its backend on :8787
```

Inside the workspace, `@samirdamle/dci-*` packages resolve to their TypeScript sources through the
`@dci/source` export condition, so the demo, tests and typechecking never need a prior build.

## Repository layout

| Path                | What it is                                                         |
| ------------------- | ------------------------------------------------------------------ |
| `packages/protocol` | Wire-protocol types, validation, SSE encoder/decoder (no deps)     |
| `packages/core`     | Selection engine, overlay, chat UI, transport, `createDci()`       |
| `packages/react`    | React bindings                                                     |
| `packages/server`   | Endpoint helpers (`dciHandler`, `toNodeHandler`)                   |
| `apps/demo`         | The CRM demo (Vite, React, Tailwind v4, shadcn/ui) and its backend |
| `apps/extension`    | The browser extension: DCI on any website (Manifest V3)            |
| `docs`              | Guides; its `package.json` type-checks every code sample           |
| `e2e`               | Playwright tests against the demo; page objects in `e2e/pages`     |
| `scripts`           | API report, doc-sample checker, dev runner                         |

Dependency graph: `core → protocol`, `server → protocol`, `react → core`,
`demo → react, server`.

## The demo

The demo is a mock CRM for **Summit Gear Co.**, a fictional Salesforce-style org (Sales Cloud and
Marketing Cloud). Alt+Click anything, ask, and the assistant can change records: its tool calls
update the backend's copy of the org, and a `client-action` updates the page.

| Mode        | When                                               | Answers                                                         |
| ----------- | -------------------------------------------------- | --------------------------------------------------------------- |
| **Claude**  | `ANTHROPIC_API_KEY` is set when you run `pnpm dev` | Claude via the Anthropic SDK, with CRM tools and session memory |
| **Mock**    | No key (or `DCI_DEMO_MOCK=1`)                      | A deterministic, context-aware responder; same tools and events |
| **Browser** | No backend at all (the static GitHub Pages build)  | The same mock responder, running in the page                    |

```sh
ANTHROPIC_API_KEY=sk-ant-… pnpm dev   # Claude mode; DCI_DEMO_MODEL overrides the model
```

The **Playground** drawer changes DCI options live, and the demo reads its starting options from
the URL, e.g. `/?modifier=Control&fallback=off#/sales`. `/#/classic` keeps the original
single-page playground.

## The browser extension

`apps/extension` builds with esbuild straight from the workspace sources, so a change in
`packages/core` shows up in the extension without building the packages first.

1. `pnpm --filter @dci/extension build` writes `dist/chrome` and `dist/firefox`.
2. Load `dist/chrome` with **Load unpacked** in `chrome://extensions` (Developer mode), or
   `dist/firefox/manifest.json` from `about:debugging` in Firefox.
3. After a rebuild, click the reload icon on the extension's card, then reload the page you're
   testing on.

The Playwright `extension` project (`pnpm e2e --project extension`) builds a test copy in
`dist/e2e`, loads it into Chromium and drives it on pages served from `http://dci.test`. The CI
`extension` job builds both store zips, lints the Firefox build with `web-ext` and uploads the
zips. Privacy-relevant changes (what's read, sent or stored, and permissions) must also update
the review in [docs/extension.md](docs/extension.md#privacy).

## Scripts

| Script                              | What it does                                                 |
| ----------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                          | Run the demo and its backend                                 |
| `pnpm build`                        | Build every package (tsup: ESM + CJS + `.d.ts`) and the demo |
| `pnpm lint`                         | ESLint                                                       |
| `pnpm format` / `pnpm format:check` | Prettier                                                     |
| `pnpm typecheck`                    | `tsc` across the workspace, including every doc sample       |
| `pnpm test` / `pnpm test:watch`     | Vitest unit tests                                            |
| `pnpm coverage`                     | Unit tests with V8 coverage (`coverage/`)                    |
| `pnpm e2e`                          | Playwright end-to-end tests against the demo                 |
| `pnpm e2e:perf`                     | Runtime performance budgets (Chromium, CDP)                  |
| `pnpm size`                         | Bundle-size budgets (`.size-limit.json`, after `pnpm build`) |
| `pnpm api:report` / `api:check`     | Write / verify the public API reports (`packages/*/api`)     |
| `pnpm docs:api`                     | Generate the API reference with TypeDoc (`docs/api/`)        |
| `pnpm docs:gif`                     | Re-record the README's demo GIF (`docs/assets/demo.gif`)     |
| `pnpm changeset`                    | Describe a change to a published package (see below)         |
| `pnpm check:packages`               | Pack every package and check it with publint and attw        |
| `pnpm smoke`                        | Install the packed tarballs in Node, Vite and Next.js apps   |

## Testing

- **Unit tests (Vitest)** live in `packages/*/test` and next to demo sources. `protocol` and
  `server` run in Node; `core` and `react` in happy-dom. `packages/core/test/test-utils.ts` has
  `mountFixture(html)`, `fakePointer(el, { altKey, … })` and `fakeKey(key, mods)`.
- **happy-dom has no layout engine**, so anything geometric (window select, overlay positions,
  the chat popover) is tested in Playwright.
- **End-to-end (Playwright)** runs against the demo in deterministic mock mode, which Playwright
  starts for you. Use the page objects in `e2e/pages` (`CrmApp`, `RecordTable`, `KanbanBoard`,
  `Chat`, `Overlay`). The selection suite runs twice: with Alt, and with Control
  (`chromium-ctrl`). Chromium runs on every PR; Firefox and WebKit run nightly
  (`PW_ALL_BROWSERS=1` locally, after `pnpm exec playwright install firefox webkit`).
- **Visual snapshots** (`e2e/overlay-crm.spec.ts`) are Chromium/Linux only. Update them with
  `pnpm exec playwright test e2e/overlay-crm.spec.ts --update-snapshots` and review the images.

## Conventions

- **TypeScript is strict** (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). Prefer small,
  composable functions and plain objects; the core has no framework dependency.
- **Public API changes are reviewed.** `pnpm api:check` fails when an export or its doc comment
  changes; run `pnpm build && pnpm api:report` and commit the updated report with your change.
- **Every exported symbol has a TSDoc comment.** The API reference is generated from them.
- **Docs samples compile.** Every ` ```ts ` / ` ```tsx ` block in `README.md`, `CONTRIBUTING.md`, the
  package READMEs and `docs/` is extracted and type-checked by `pnpm typecheck`. Mark a deliberate fragment
  ` ```ts nocheck `. Placeholders like `token` and `invoices` are declared in
  `docs/samples-env.d.ts`.
- **Size budgets** in `.size-limit.json` are enforced in CI. If a change needs more room, raise
  the budget in the same PR and say why.
- **No work until the modifier is pressed.** Idle listeners are limited to `keydown`, `keyup` and
  `blur`; the perf suite checks this.
- **Accessibility** is part of done: keyboard support, ARIA roles, and axe checks in e2e.

## Pull requests

1. Branch from `main`, keep the change focused, and add tests.
2. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm api:check && pnpm size`
   and `pnpm e2e` before pushing.
3. If a published package changed, add a changeset: `pnpm changeset`, pick the bump, and write
   the entry for users.
4. Describe what changed and why; link the issue (`Closes #123`).

CI runs lint, format, typecheck (with doc samples), unit tests, build, API report, size budgets,
package checks (publint, attw and an install smoke test) and e2e on every PR. A nightly workflow runs the performance budgets and the full e2e suite in
Chromium, Firefox and WebKit on Linux, macOS and Windows.

## Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets). The four
public packages share one version (a `fixed` group).

1. PRs that change a package include a changeset (`.changeset/*.md`).
2. On `main`, the **Release** workflow keeps a "Version packages" PR open. It bumps the versions,
   writes the changelogs and syncs each package's `VERSION` constant
   (`scripts/sync-versions.mjs`).
3. Merge that PR, then publish. CI publishing is opt-in (below); by default a maintainer
   publishes by hand.

Prereleases come from the `next` branch in pre mode (`pnpm changeset pre enter next`), published
under the `next` dist-tag. Before a release, `pnpm build && pnpm check:packages && pnpm smoke`
checks exactly what will be published. `pnpm -r --filter "./packages/**" publish --dry-run
--no-git-checks` shows the publish without doing it.

### Publishing by hand

After merging the "Version packages" PR, from an up-to-date `main`:

```sh
git switch main && git pull
pnpm install --frozen-lockfile
pnpm build && pnpm check:packages && pnpm smoke   # check exactly what will ship
npm login                                         # once; uses your 2FA
pnpm -r --filter "./packages/**" publish --access public --otp <code>
pnpm changeset tag && git push --follow-tags      # one tag per package, e.g. @samirdamle/dci-core@1.0.0
```

`pnpm publish` goes in dependency order and replaces `workspace:*` with the real version.
Provenance isn't available from a laptop (npm only signs it in CI), so hand-published versions
don't carry it. Then create a GitHub release for the tag with the changelog entry and a demo link.

### Publishing from CI (optional)

To let merging the "Version packages" PR publish with provenance, set the repository variable
`NPM_PUBLISH` to `true` (Settings → Secrets and variables → Actions → Variables) and give the
workflow npm access. The recommended way is npm **trusted publishing**: after the first manual
publish, add `samirdamle/dci` and `.github/workflows/release.yml` as a trusted publisher on each
package's npm settings page. That needs no token and no 2FA bypass. The alternative is an
`NPM_TOKEN` secret. In both cases, allow GitHub Actions to create pull requests (Settings →
Actions → General → Workflow permissions) so the workflow can open the "Version packages" PR.

## Reporting security issues

Please don't open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/samirdamle/dci/security/advisories/new)
instead.
