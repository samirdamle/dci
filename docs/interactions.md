# Interactions

DCI stays out of the way until the **modifier** is held (Alt by default; Option on macOS).
Without it, clicks, scrolling, dragging and keys behave exactly as your app intends. This page
lists every gesture and key and shows how to remap or turn each one off.

## Mouse

| Gesture                               | What it does                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Hold **Alt**                          | Hover preview: the DCI node under the pointer is outlined (dashed)             |
| **Alt+Click**                         | Select that node, replacing the selection                                      |
| **Alt+Shift+Click**                   | Toggle that node in or out of the selection                                    |
| **Alt+Click** on empty space          | Clear the selection (inside DCI's `root` only)                                 |
| **Alt+Wheel**                         | Move the hover target up (toward the root) or down the tree, then click        |
| **Alt+Drag** left → right             | Window select: nodes fully inside the box                                      |
| **Alt+Drag** right → left             | Window select: nodes the box touches                                           |
| …with **Shift** / **Ctrl** or **Cmd** | Add to / subtract from the selection                                           |
| **Esc** during a drag                 | Cancel it; the selection stays as it was                                       |
| **Alt+Double-click**                  | Select every sibling with the same `type` (e.g. every invoice row); Shift adds |

Notes:

- **Window select** measures the candidates once when the drag starts, auto-scrolls at the
  viewport edge, and draws a solid box (contain) or a dashed box (touch).
  `windowSelectLevel: 'top'` picks the outermost matches (whole rows rather than their cells). In
  touch mode, a container that encloses the whole box (like the table you're dragging inside)
  doesn't count as touched.
- **Alt+Wheel** steps one level per 40 px of scrolling, so trackpads and mice feel the same. The
  page doesn't scroll while the modifier is held.
- DCI only swallows an event when a gesture actually used it. Set `passthroughClicks: true` if your
  app's own click handlers should run for DCI clicks too.

## Touch screens

Touch screens have no modifier key, so DCI has a **Select mode** instead: while it's on, the
gestures work without holding anything. Turn it on from your own button with
`dci.setSelectMode(true)` (or `useSelectMode()` in React), or with a long press on a node.

| Gesture                         | What it does                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| **Long-press** a node           | Turn Select mode on and select that node                             |
| **Tap** (in Select mode)        | Toggle that node in or out, so taps build up a selection             |
| **Tap** on empty space          | Clear the selection (inside DCI's `root` only)                       |
| **Drag** (in Select mode)       | Window select, adding to the selection (left → right / right → left) |
| **Double-tap** (in Select mode) | Select every sibling with the same `type`                            |

```ts
const dci = createDci({ endpoint: '/api/dci' });
selectButton.onclick = () => dci.setSelectMode(!dci.isSelectMode());
dci.on('selectmodechange', (on) => selectButton.classList.toggle('active', on));
```

- **Long press** only applies to annotated nodes (never text fields), so the page keeps its own
  long press (text selection, the context menu) everywhere else. Turn it off with
  `bindings: { longPress: false }`.
- While Select mode is on, the root gets the `dci-select-mode` class: a drag draws the selection
  box instead of scrolling (it auto-scrolls at the screen edge), text can't be selected, and pinch
  zoom still works. Taps and drags outside the root are left alone.
- Select mode works with a mouse too: plain clicks then add to the selection, no keys needed.
- Mod+Wheel has no touch gesture; the arrow keys, or `dci.selection` from your own buttons, move
  up and down the tree.

## Keyboard

These keys work **while something is selected** and focus isn't in a text field or a dialog:

| Key               | What it does                                            |
| ----------------- | ------------------------------------------------------- |
| **↑**             | Select the parent node                                  |
| **↓**             | Select the first child                                  |
| **← / →**         | Previous / next sibling                                 |
| **Shift + arrow** | Extend the selection instead of moving it               |
| **Esc**           | Close the chat first; the next Esc clears the selection |
| **Alt+Enter**     | Select the focused element's node (no mouse needed)     |

- **Alt+arrows are left alone** because Alt+← is the browser's Back shortcut.
- At the edge of the tree (no parent, no next sibling), the primary box gives a small shake instead
  of moving (no animation with `prefers-reduced-motion`).
- Every move is announced politely to screen readers, e.g. "Selected Invoice #124, row 3 of 20".

## Choosing the modifier

```ts
import { createDci } from '@samirdamle/dci-core';

createDci({ endpoint: '/api/dci', modifier: 'Control' }); // 'Alt' | 'Control' | 'Meta' | 'Shift'
```

With a different modifier, every "Alt" above becomes that key. Window select keeps Ctrl/Cmd for
subtracting, using whichever of the two isn't the modifier. On macOS avoid `'Control'`: Ctrl+Click
is a secondary click there and opens the context menu. See
[compatibility](compatibility.md#operating-systems-and-the-modifier-key) for per-OS notes.

## Remapping or disabling gestures

Every binding can be changed or set to `false`:

```ts
import { createDci } from '@samirdamle/dci-core';

createDci({
  endpoint: '/api/dci',
  bindings: {
    toggle: 'Meta', // Alt+Cmd+Click toggles instead of Alt+Shift+Click
    wheelTraverse: false, // no Alt+Wheel
    selectSameType: false, // no Alt+Double-click
    keyboard: {
      parent: 'PageUp',
      child: 'PageDown',
      selectFocused: 'Alt+S',
      extendModifier: false, // Shift+arrows move instead of extending
    },
  },
});
```

| Binding                   | Default        | Controls                                    |
| ------------------------- | -------------- | ------------------------------------------- |
| `select`                  | `true`         | Mod+Click selects                           |
| `toggle`                  | `'Shift'`      | The extra key for Mod+<key>+Click toggle    |
| `wheelTraverse`           | `true`         | Mod+Wheel moves up and down the tree        |
| `windowSelect`            | `true`         | Mod+Drag window select                      |
| `selectSameType`          | `true`         | Mod+Double-click selects same-type siblings |
| `longPress`               | `true`         | Long press turns Select mode on (touch)     |
| `keyboard`                | see below      | `false` turns off all selection keys        |
| `keyboard.parent`         | `'ArrowUp'`    | Parent                                      |
| `keyboard.child`          | `'ArrowDown'`  | First child                                 |
| `keyboard.prevSibling`    | `'ArrowLeft'`  | Previous sibling                            |
| `keyboard.nextSibling`    | `'ArrowRight'` | Next sibling                                |
| `keyboard.extendModifier` | `'Shift'`      | Held with an arrow to extend                |
| `keyboard.clear`          | `'Escape'`     | Clear                                       |
| `keyboard.selectFocused`  | `'Alt+Enter'`  | Select the focused element's node           |

Key combos are written like `'Alt+Enter'` or `'Shift+ArrowUp'`, using `KeyboardEvent.key` names.
Bindings can be changed at runtime with `dci.update({ bindings })`; the selection is kept.

Related options: `clearOnEmptyClick: false` keeps the selection when clicking empty space, and
`maxSelection` (default 50) caps the selection with a notice in the chat.

## Markers

Each selected node gets a **marker**: a small badge on the top-left corner of its box, and the
same badge on its chip in the chat. Users can then refer to items by marker: "Compare A and B",
"Why is C lower than A?". Each node's marker is also sent with the request (`marker` on the
context node), so the model knows which item is which. `formatContextForPrompt` from
`@samirdamle/dci-server` includes the markers, with a note that explains them to the model.

- **Order:** markers follow selection order. Nodes added in one gesture (window select,
  Alt+Double-click) are numbered in page order.
- **Removing:** a node keeps its marker while it stays selected. Removing B from A, B, C leaves A
  and C, and the next node added gets D.
- **Starting over:** a new selection (a plain Alt+Click) or clearing it starts again from A.

```ts
import { createDci } from '@samirdamle/dci-core';

createDci({ endpoint: '/api/dci', markers: 'numbers' }); // 1, 2, 3 …
createDci({ endpoint: '/api/dci', markers: (i) => `R${i + 1}` }); // custom: R1, R2, R3 …
createDci({ endpoint: '/api/dci', markers: false }); // no badges, nothing sent
```

| Value          | Markers                                           |
| -------------- | ------------------------------------------------- |
| `'letters'`    | A, B … Z, AA, AB … (the default)                  |
| `'numbers'`    | 1, 2, 3 …                                         |
| `(index) => …` | Your own series, from the 0-based selection index |
| `false`        | None                                              |

A custom series can follow your users' language (Cyrillic А, Б, В; Japanese あ, い, う) or your
domain (`P1`, `P2` for products). Keep markers short (1–3 characters) so they fit the badge, and
unique: DCI warns in development when two selected nodes get the same one.

Badges use `--dci-selected` with `--dci-on-selected` for the text (see
[theming](configuration.md)). With `overlay: { mode: 'outline' }`, no boxes are drawn, so there
are no badges on the page, but the chips still show markers.

## Custom gestures

Gestures are plain functions: `(ctx) => cleanup`. Pass `gestures` to replace the built-in list
(`DEFAULT_GESTURES`), for example to drop one or add your own:

```ts
import { createDci, DEFAULT_GESTURES, selectSameType, type Gesture } from '@samirdamle/dci-core';

/** Mod+A selects every node of the primary node's type. */
const selectAllOfType: Gesture = (ctx) =>
  ctx.input.onKeyDown((e) => {
    if (!ctx.input.isArmed() || e.key.toLowerCase() !== 'a') return;
    return selectSameType(ctx).length ? 'consume' : undefined;
  });

createDci({ endpoint: '/api/dci', gestures: [...DEFAULT_GESTURES, selectAllOfType] });
```

A handler returns `'consume'` (DCI used the event: prevent the default and stop it),
`'handled'` (DCI used it, but let it continue) or nothing (not DCI's). `ctx` gives you the
selection store, the DCI tree, the hover state and an event bus. `ctx.input.on(type, fn)`
listens to pointer events only while the modifier is held.

## Design principles

- **Modifier-gated.** Only `keydown`, `keyup` and `blur` listeners exist until the modifier is
  held; pointer listeners are attached while it's down and removed on release.
- **Never hijacks.** Events are only swallowed when a DCI gesture happened. The Alt key-up that
  would focus the browser menu bar on Windows is suppressed only after a DCI gesture.
- **Accessible.** Full keyboard control, polite announcements and visible focus. DCI's highlight
  boxes are hidden from screen readers; the announcements carry the information.
- **Isolated.** DCI's UI renders in a Shadow DOM layer (`<dci-root>`), so your CSS can't break it
  and it never changes your elements' styles.
