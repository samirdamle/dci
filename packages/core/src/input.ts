import { hasModifier, isFromDciUi, isModifierKey, type ModifierKey } from './keys';

/**
 * What a gesture handler did with an event:
 * - `'consume'`: DCI handled it; prevent the default and stop propagation
 * - `'handled'`: DCI acted but the host still sees the event
 * - nothing: not a DCI gesture; the event is left alone
 */
export type GestureResult = 'consume' | 'handled' | void;

export type ArmedEventMap = {
  pointermove: PointerEvent;
  pointerdown: PointerEvent;
  click: MouseEvent;
  dblclick: MouseEvent;
  wheel: WheelEvent;
};
export type ArmedEventType = keyof ArmedEventMap;

const ARMED_EVENTS: ArmedEventType[] = ['pointermove', 'pointerdown', 'click', 'dblclick', 'wheel'];

export interface InputOptions {
  /** Key that arms DCI. Default `'Alt'` (Option on macOS). */
  modifier?: ModifierKey;
  /** Where listeners are attached. Default `window`. */
  target?: Window;
}

export interface InputManager {
  readonly modifier: ModifierKey;
  /** Whether the modifier is currently held. */
  isArmed(): boolean;
  /** Handle an event type that is only listened to while armed. */
  on<K extends ArmedEventType>(type: K, fn: (e: ArmedEventMap[K]) => GestureResult): () => void;
  /** Handle every non-modifier `keydown` (armed or not). */
  onKeyDown(fn: (e: KeyboardEvent) => GestureResult): () => void;
  /** Called with `true` on arm and `false` on disarm. */
  onArmChange(fn: (armed: boolean) => void): () => void;
  /** Detach every listener. */
  destroy(): void;
}

/**
 * Tracks the DCI modifier and routes events to gesture handlers.
 *
 * While idle only `keydown`, `keyup` and `blur` are attached. Holding the
 * modifier arms DCI, which attaches the pointer, click and wheel listeners
 * (capture phase) until the modifier is released, the window blurs, or the
 * page is hidden. Events from DCI's own UI are ignored, and events are only
 * swallowed when a handler reports a DCI gesture.
 */
export function createInputManager(options: InputOptions = {}): InputManager {
  const modifier = options.modifier ?? 'Alt';
  const win = options.target ?? window;
  const doc = win.document;

  const handlers = new Map<ArmedEventType, Set<(e: Event) => GestureResult>>();
  const keyHandlers = new Set<(e: KeyboardEvent) => GestureResult>();
  const armListeners = new Set<(armed: boolean) => void>();
  let armed = false;
  /** A DCI gesture happened during the current press of the modifier. */
  let gestured = false;

  function apply(e: Event, result: GestureResult) {
    if (!result) return;
    gestured = true;
    if (result === 'consume') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  function run<E extends Event>(fns: Iterable<(e: E) => GestureResult>, e: E) {
    let result: GestureResult = undefined;
    for (const fn of [...fns]) {
      const r = fn(e);
      if (r === 'consume' || (r === 'handled' && result !== 'consume')) result = r;
    }
    apply(e, result);
  }

  const onArmedEvent = (e: Event) => {
    if (isFromDciUi(e)) return;
    // The modifier was released without a keyup reaching us (e.g. focus moved).
    if (!hasModifier(e as MouseEvent, modifier)) return disarm();
    run(handlers.get(e.type as ArmedEventType) ?? [], e);
  };

  function setArmed(next: boolean) {
    if (armed === next) return;
    armed = next;
    const method = next ? 'addEventListener' : 'removeEventListener';
    for (const type of ARMED_EVENTS) {
      win[method](type, onArmedEvent, { capture: true, passive: type === 'pointermove' });
    }
    doc[method]('visibilitychange', disarm, { capture: true });
    for (const fn of [...armListeners]) fn(next);
  }

  function disarm() {
    setArmed(false);
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (isModifierKey(e, modifier)) {
      if (!armed) gestured = false;
      setArmed(true);
      return;
    }
    if (isFromDciUi(e)) return;
    run(keyHandlers, e);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (!isModifierKey(e, modifier)) return;
    // Firefox on Windows/Linux focuses the menu bar on a bare Alt keyup.
    // Suppress it only when a DCI gesture used this Alt press.
    if (gestured && modifier === 'Alt') e.preventDefault();
    gestured = false;
    disarm();
  };

  const idle = [
    ['keydown', onKeyDown],
    ['keyup', onKeyUp],
    ['blur', disarm],
  ] as const;
  for (const [type, fn] of idle) win.addEventListener(type, fn as EventListener, true);

  return {
    modifier,
    isArmed: () => armed,
    on(type, fn) {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      const handler = fn as (e: Event) => GestureResult;
      set.add(handler);
      return () => set.delete(handler);
    },
    onKeyDown(fn) {
      keyHandlers.add(fn);
      return () => keyHandlers.delete(fn);
    },
    onArmChange(fn) {
      armListeners.add(fn);
      return () => armListeners.delete(fn);
    },
    destroy() {
      disarm();
      for (const [type, fn] of idle) win.removeEventListener(type, fn as EventListener, true);
      handlers.clear();
      keyHandlers.clear();
      armListeners.clear();
    },
  };
}
