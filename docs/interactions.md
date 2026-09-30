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
import { createDci } from '@dci/core';

createDci({ endpoint: '/api/dci', modifier: 'Control' }); // 'Alt' | 'Control' | 'Meta' | 'Shift'
```

With a different modifier, every "Alt" above becomes that key. Window select keeps Ctrl/Cmd for
subtracting, using whichever of the two isn't the modifier. On macOS avoid `'Control'`: Ctrl+Click
is a secondary click there and opens the context menu. See
[compatibility](compatibility.md#operating-systems-and-the-modifier-key) for per-OS notes.

## Remapping or disabling gestures

Every binding can be changed or set to `false`:

```ts
import { createDci } from '@dci/core';

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

## Custom gestures

Gestures are plain functions: `(ctx) => cleanup`. Pass `gestures` to replace the built-in list
(`DEFAULT_GESTURES`), for example to drop one or add your own:

```ts
import { createDci, DEFAULT_GESTURES, selectSameType, type Gesture } from '@dci/core';

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
