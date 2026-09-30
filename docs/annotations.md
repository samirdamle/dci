# Annotation guide

DCI only knows what you tell it. One attribute, `data-dci`, marks an element as something users can
select and talk about, and says what the model should know about it. This guide covers the syntax,
how to design your annotations, and exactly what gets sent.

## Syntax

**Short form:** the value is the node's `id`.

```html
<tr data-dci="inv_123">
  …
</tr>
```

**JSON form:** an object with reserved keys and any data you like.

```html
<tr
  data-dci='{"id":"inv_123","type":"invoice","label":"Invoice #123","amount":420,"status":"overdue"}'
>
  …
</tr>
```

| Key       | Meaning                                                                                 |
| --------- | --------------------------------------------------------------------------------------- |
| `id`      | A stable identifier your backend can look up. Numbers are turned into strings.          |
| `type`    | The kind of node. Powers "select all of this type" and per-type suggested actions.      |
| `label`   | The human-readable name shown on chips and breadcrumbs, and read out by screen readers. |
| `private` | `true` means the node can't be selected and its data is never sent (see below).         |
| _other_   | Free-form data. It's sent to your backend as `data`, untouched.                         |

**Parse rules:**

- A value that is a JSON object is used as is. Anything else is the short form (the whole string is
  the `id`), and an empty value makes an anonymous node.
- A value that starts with `{` or `[` but isn't a valid JSON object falls back to the short form and
  warns once per element in development.
- The attribute name is configurable: `createDci({ attribute: 'data-ai' })`.

Don't hand-write JSON in templates. `dci()` (React) and `dciAttr()` (`@dci/core`) serialize it for
you, with sorted keys so the attribute only changes when the data does:

```tsx
import { dci } from '@dci/react';

export const InvoiceRow = ({ invoice }: { invoice: Invoice }) => (
  <tr
    {...dci({
      id: invoice.id,
      type: 'invoice',
      label: `Invoice ${invoice.number}`,
      status: invoice.status,
      amount: invoice.amount,
    })}
  >
    <td>{invoice.number}</td>
  </tr>
);
```

## What to annotate

Start with the **things users talk about**, then add the **containers that give them meaning**:

1. **Records:** table rows, cards, list items, chart points, anything with an identity.
2. **Important fields** inside them, if users ask about a specific value ("why is _this_ amount
   so high?").
3. **Containers:** the table, the board column, the page or dashboard section. They show up in each
   selected node's `ancestors`, so the model knows a row came from "Overdue invoices" and not
   "Paid invoices".

You don't need to annotate everything. Layout wrappers should stay unannotated: DCI ignores them
and navigation follows meaning rather than markup. For anything you haven't annotated, the
[fallback](#fallback-unannotated-elements) can still describe what's on screen.

## Designing a `type` taxonomy

`type` is the most useful key after `id`: it drives same-type selection (Alt+Double-click selects
every sibling with the same `type`), suggested actions (`actions: { invoice: [...] }`), and the
model's understanding of what it's looking at.

- **Name domain objects, not widgets.** `invoice`, `customer`, `opportunity`, not `row`, `card`
  or `div`. The same record should have the same type in a table, a Kanban card and a search
  result.
- **Keep it small and stable.** A dozen types is plenty for most apps. Types are part of the
  contract with your backend and your suggested actions, so rename them deliberately.
- **Use one type per kind of sibling.** "Select all invoices" works on siblings of the same type,
  so rows in one table should share a type.
- **Give containers types too** (`table`, `stage`, `dashboard`). A stage column typed `stage` can
  get its own actions ("Why are deals stuck here?").
- **Fields can share a generic type.** The demo types table cells as `field` with
  `{ "field": "Amount", "value": 420 }`, which works for every column.

## Hierarchy

DCI reduces the DOM to a tree of annotated elements (the **DCI tree**). ↑/↓ and Alt+Wheel move
through that tree, window select can pick its innermost or outermost nodes, and each selected
node carries its annotated ancestors.

```text
DOM                                     DCI tree
<main data-dci="page">                  page
  <div class="grid">                    └── invoices (table)
    <table data-dci="invoices">             ├── inv_122 (invoice)
      <tbody>                               ├── inv_123 (invoice)
        <tr data-dci="inv_122">…</tr>       │   └── inv_123.amount (field)
        <tr data-dci="inv_123">             └── inv_124 (invoice)
          <td data-dci="inv_123.amount">
        <tr data-dci="inv_124">…</tr>
```

Tips:

- **Mirror the user's mental model:** page › section › collection › record › field. Three or four
  levels is typical.
- **Prefer IDs that encode the relationship** where it's natural (`inv_123.amount`), so the backend
  can resolve a field without walking ancestors.
- **Nested components work:** annotated nodes inside open shadow roots are part of the tree. Closed
  shadow roots are opaque; annotate the host element instead.
- **Re-render freely:** the tree is read from the live DOM whenever it's needed; nothing is cached.

## `private` data

```html
<td data-dci='{"id":"acct_7.creditLimit","private":true}'>$250,000</td>
```

A private node:

- **can't be selected.** It is transparent: Alt+Click on it selects its nearest non-private
  ancestor (here, the account), and keyboard navigation skips it.
- **is never sent.** Its data never appears in a payload. As an ancestor it's reduced to
  `{ "private": true }`, with no id, type, label or data.
- **hides its content from the fallback.** Unannotated elements inside a private node are never
  described.

Privacy has a last line of defence too: if a private node's data still reaches an outgoing request
(for example through `beforeSend`), DCI throws in development and strips it in production. Use
`private` for anything sensitive that is visible on screen: personal contact details, financial
limits, secrets.

## What gets sent

Each selected node becomes a `DciContextNode`:

```json
{
  "id": "inv_123",
  "type": "invoice",
  "label": "Invoice #123",
  "data": { "amount": 420, "status": "overdue" },
  "ancestors": [
    { "id": "page", "type": "page", "label": "Billing" },
    { "id": "invoices", "type": "table", "label": "Invoices" }
  ],
  "source": "annotated"
}
```

- `data` is the annotation minus the reserved keys.
- `ancestors` runs from the root down to the node's parent. It's on by default
  (`includeAncestors: true`). Ancestors are compact (`id`, `type`, `label`); set
  `ancestorData: 'full'` to include their data too.
- Only the context added since the last message is sent with each turn (`chat.contextMode:
'turn'`, the default). Use `'cumulative'` to resend everything selected so far.

The full request (prompt, session, page URL and title) is described in the
[protocol spec](protocol.md). To see exactly what your app would send, call
`dci.previewRequest('Why is this overdue?')`, or open the request inspector in the demo's
Playground.

### Fallback: unannotated elements

With `fallback: true` (the default), Alt+Click on an element with no annotated ancestor selects the
element itself and describes it from what's visible:

```json
{
  "data": {},
  "source": "fallback",
  "fallback": {
    "tagName": "p",
    "text": "Q3 focus: convert Proposal-stage tent deals before the winter catalog ships.",
    "path": "main > div.card > p:nth-child(2)"
  },
  "ancestors": [{ "id": "home", "type": "page", "label": "Sales Home" }]
}
```

The fallback reads the tag name, the trimmed visible text (up to `maxTextLength`, default 500),
`aria-label`, `alt`, `title`, `href`, form field values (**never** from password inputs) and a
short CSS path. Set `fallback: false` to make only annotated elements selectable.

### Redacting or enriching

`beforeSend` sees every request before it leaves the page. Return a changed request, or `false` to
cancel the send. See the [redaction recipe](recipes.md#redaction-with-beforesend).
