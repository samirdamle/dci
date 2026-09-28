# DCI: Direct Contextual Intelligence

Let users **Alt+Click** elements annotated with `data-dci` to select them as context for an AI chat.

## Packages

| Package                              | Purpose                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| [`@dci/protocol`](packages/protocol) | Shared wire-protocol types and the SSE encoder/decoder           |
| [`@dci/core`](packages/core)         | Framework-agnostic selection engine, overlay, chat UI, transport |
| [`@dci/react`](packages/react)       | React bindings                                                   |
| [`@dci/server`](packages/server)     | Node helpers for the endpoint protocol                           |
| [`apps/demo`](apps/demo)             | Demo app (Vite + React + Tailwind v4 + shadcn/ui)                |

Dependency graph: `core → protocol`, `server → protocol`, `react → core`, `demo → react, server`.

## Setup

Requires Node 22.12+ (see `.nvmrc`) and pnpm (pinned via `packageManager`; `corepack enable` picks it up).

```sh
nvm use
corepack enable
pnpm install
pnpm dev      # start the demo at http://localhost:5173
```

Inside the workspace, `@dci/*` packages resolve to their TypeScript sources through the `@dci/source`
export condition, so the demo, tests and typechecking never need a prior build.

## Scripts

| Script                              | What it does                                                 |
| ----------------------------------- | ------------------------------------------------------------ |
| `pnpm build`                        | Build every package (tsup: ESM + CJS + `.d.ts`) and the demo |
| `pnpm dev`                          | Run the demo dev server                                      |
| `pnpm lint`                         | ESLint (flat config, typescript-eslint)                      |
| `pnpm typecheck`                    | `tsc` across the root and every package                      |
| `pnpm format` / `pnpm format:check` | Prettier                                                     |
| `pnpm test` / `pnpm test:watch`     | Vitest unit tests                                            |
| `pnpm coverage`                     | Unit tests with V8 coverage (`coverage/`)                    |
| `pnpm e2e`                          | Playwright end-to-end tests against the demo                 |

## Testing

- **Unit tests (Vitest):** the root `vitest.config.ts` runs each package as a project. `protocol` and
  `server` use the `node` environment; `core` and `react` use `happy-dom`. Tests live in
  `packages/*/test`.
- **Core test helpers:** `packages/core/test/test-utils.ts` provides `mountFixture(html)`,
  `fakePointer(el, { altKey, shiftKey, ... })` and `fakeKey(key, mods)`. Fixtures are cleaned up
  after each test automatically.
- **E2E (Playwright):** `e2e/` runs against the demo dev server, which Playwright starts for you.
  Chromium runs by default; set `PW_ALL_BROWSERS=1` to add Firefox and WebKit (after
  `pnpm exec playwright install firefox webkit`).
- happy-dom has no layout engine, so geometry-dependent behaviour (window select, overlay
  positions) is tested in Playwright, not Vitest.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build and e2e on every PR and on
pushes to `main`. Playwright traces are uploaded as an artifact when e2e fails.

## License

MIT
