---
'@samirdamle/dci-core': minor
'@samirdamle/dci-react': minor
---

Select mode for touch screens. `dci.setSelectMode(true)` keeps the gestures armed without the modifier: a tap toggles a node, a drag window-selects (adding), and a double tap selects all of the same type. A long press on an annotated node turns it on and selects that node (`bindings.longPress`, default `true`). New: `dci.isSelectMode()`, the `selectmodechange` event, `InputManager.setLocked()`, and `useSelectMode()` in React.
