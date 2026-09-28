import type { ModifierKey } from './keys';

/** Keyboard map, active while a selection exists. Each key can be remapped or `false`. */
export interface KeyboardBindings {
  parent: string | false;
  child: string | false;
  prevSibling: string | false;
  nextSibling: string | false;
  /** Held with an arrow to extend the selection instead of moving it. */
  extendModifier: ModifierKey | false;
  clear: string | false;
  /** Selects the focused element's node without a pointer. */
  selectFocused: string | false;
}

/** Gesture bindings (SPEC §4.2–4.3). Every entry can be disabled with `false`. */
export interface Bindings {
  /** Mod+Click replaces the selection. */
  select: boolean;
  /** Extra modifier for Mod+<key>+Click, which toggles a node. */
  toggle: ModifierKey | false;
  /** Mod+Wheel moves the hover target up and down the tree. */
  wheelTraverse: boolean;
  /** Mod+Drag window select. */
  windowSelect: boolean;
  /** Mod+Double-click selects same-type siblings. */
  selectSameType: boolean;
  keyboard: KeyboardBindings | false;
}

export type BindingsConfig = Partial<Omit<Bindings, 'keyboard'>> & {
  keyboard?: Partial<KeyboardBindings> | false;
};

export const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindings = {
  parent: 'ArrowUp',
  child: 'ArrowDown',
  prevSibling: 'ArrowLeft',
  nextSibling: 'ArrowRight',
  extendModifier: 'Shift',
  clear: 'Escape',
  selectFocused: 'Alt+Enter',
};

export const DEFAULT_BINDINGS: Bindings = {
  select: true,
  toggle: 'Shift',
  wheelTraverse: true,
  windowSelect: true,
  selectSameType: true,
  keyboard: DEFAULT_KEYBOARD_BINDINGS,
};

/** Merge user bindings over the defaults. */
export function resolveBindings(config: BindingsConfig = {}): Bindings {
  const { keyboard, ...rest } = config;
  return {
    ...DEFAULT_BINDINGS,
    ...rest,
    keyboard: keyboard === false ? false : { ...DEFAULT_KEYBOARD_BINDINGS, ...keyboard },
  };
}
