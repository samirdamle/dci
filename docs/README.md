# DCI documentation

New to DCI? Start with **[Getting started](getting-started.md)**: zero to a working integration
with Claude in three steps.

| Guide                                     | Read it when you want to…                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| [Getting started](getting-started.md)     | Add DCI to a plain JS or React app, with a minimal backend                |
| [Annotation guide](annotations.md)        | Decide what to annotate, name types, handle private data, see the payload |
| [Interactions](interactions.md)           | Learn every gesture and key, remap them, or add your own                  |
| [Configuration and API](configuration.md) | Look up an option, the instance API, a React hook or theming              |
| [Protocol](protocol.md)                   | Write a backend in any language, or understand the wire format            |
| [Recipes](recipes.md)                     | Custom transports, a headless React chat, redaction, agent frameworks     |
| [Compatibility](compatibility.md)         | Check browser, OS, CSP and shadow DOM support, and the perf budgets       |

The **API reference** for every export is generated from the TSDoc comments with TypeDoc
(`pnpm docs:api`) and published at <https://samirdamle.github.io/dci/api/>.

Every TypeScript sample in these docs is compiled in CI (`pnpm typecheck` runs
`scripts/check-doc-samples.mjs`), so they stay in step with the code.
