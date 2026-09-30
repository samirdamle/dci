# @samirdamle/dci-react

React bindings for [DCI](https://github.com/samirdamle/dci): let people **Alt+Click** parts of
your app and ask an AI about exactly those things.

```sh
npm install @samirdamle/dci-react
```

```tsx
import type { DciConfig } from '@samirdamle/dci-core';
import { dci, DciProvider, useSelection } from '@samirdamle/dci-react';

const config: DciConfig = { endpoint: '/api/dci' };

export const App = () => (
  <DciProvider config={config}>
    <Invoice />
  </DciProvider>
);

function Invoice() {
  const { nodes } = useSelection();
  return (
    <article {...dci({ id: 'inv_123', type: 'invoice', label: 'Invoice #123', status: 'overdue' })}>
      Invoice #123 {nodes.length > 0 && '(selected)'}
    </article>
  );
}
```

Also: `useChat()` for a fully custom chat, `useDciAction()` for backend write-back, `<DciChat>`
to swap in your own chat UI, and `useDci()` for the instance. SSR and StrictMode safe; works with
the Next.js App Router.

- [Getting started](https://github.com/samirdamle/dci/blob/main/docs/getting-started.md)
- [React API](https://github.com/samirdamle/dci/blob/main/docs/configuration.md#react)

MIT licensed.
