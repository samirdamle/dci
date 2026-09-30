# @samirdamle/dci-core

**Point, don't describe.** DCI lets people select parts of your web app with **Alt+Click** (or a
drag, or the keyboard) and ask an AI about exactly those things. Your backend receives structured
context (ids, types, data, where it sits on the page) instead of a description.

`@samirdamle/dci-core` is the framework-agnostic engine: annotations, every selection gesture, the Shadow DOM
highlight overlay, the chat UI and its headless controller, the SSE transport and client actions.

```sh
npm install @samirdamle/dci-core
```

```ts
import { createDci } from '@samirdamle/dci-core';

// Mark what users talk about: <tr data-dci='{"id":"inv_123","type":"invoice","label":"Invoice #123"}'>
const dci = createDci({ endpoint: '/api/dci' });

dci.onAction('markPaid', ({ id }) => store.markPaid(String(id))); // let the backend update the page
```

Hold **Alt** (Option on macOS), click an annotated element and ask. The request goes to your
endpoint; [`@samirdamle/dci-server`](https://www.npmjs.com/package/@samirdamle/dci-server) helps you answer it.

- [Getting started](https://github.com/samirdamle/dci/blob/main/docs/getting-started.md)
- [Configuration and API](https://github.com/samirdamle/dci/blob/main/docs/configuration.md)
- [Live demo](https://samirdamle.github.io/dci/)

MIT licensed.
