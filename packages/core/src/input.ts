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
  /** Whether the modifier is currently held (or Select mode is on). */
  isArmed(): boolean;
  /**
   * Select mode: stay armed without the modifier, until turned off. This is
   * how touch screens (no keyboard) reach the gestures.
   */
  setLocked(locked: boolean): void;
  /** Whether Select mode is on. */
  isLocked(): boolean;
  /** Called with `true` when Select mode turns on and `false` when it turns off. */
  onLockChange(fn: (locked: boolean) => void): () => void;
  /** Handle an event type that is only listened to while armed. */
  on<K extends ArmedEventType>(type: K, fn: (e: ArmedEventMap[K]) => GestureResult): () => void;
  /**
   * Handle every non-modifier `keydown` (armed or not). Like `on`, handlers
   * run in registration order and the first `'consume'` stops the rest.
   */
  onKeyDown(fn: (e: KeyboardEvent) => GestureResult): () => void;
  /** Called with `true` on arm and `false` on disarm. */
  onArmChange(fn: (armed: boolean) => void): () => void;
  /**
   * Swallow the click a browser fires right after a drag gesture. `within`
   * (ms) waits longer for it: touch browsers send it a task or two later.
   */
  suppressNextClick(within?: number): void;
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
 * swallowed when a handler reports a DCI gesture. While locked (Select mode)
 * it stays armed with no modifier held.
 */
export function createInputManager(options: InputOptions = {}): InputManager {
  const modifier = options.modifier ?? 'Alt';
  const win = options.target ?? window;
  const doc = win.document;

  const handlers = new Map<ArmedEventType, Set<(e: Event) => GestureResult>>();
  const keyHandlers = new Set<(e: KeyboardEvent) => GestureResult>();
  const armListeners = new Set<(armed: boolean) => void>();
  const lockListeners = new Set<(locked: boolean) => void>();
  let armed = false;
  let locked = false;
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

  /** Run handlers in registration order; the first `'consume'` ends the chain. */
  function run<E extends Event>(fns: Iterable<(e: E) => GestureResult>, e: E) {
    let result: GestureResult = undefined;
    for (const fn of [...fns]) {
      const r = fn(e);
      if (r === 'consume') {
        result = r;
        break;
      }
      if (r === 'handled') result = r;
    }
    apply(e, result);
  }

  let clickSuppressed = false;
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const onArmedEvent = (e: Event) => {
    if (e.type === 'click' && clickSuppressed) {
      clickSuppressed = false;
      return swallow(e);
    }
    if (isFromDciUi(e)) return;
    // The modifier was released without a keyup reaching us (e.g. focus moved).
    if (!locked && !hasModifier(e as MouseEvent, modifier)) return disarm();
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
    if (!locked) setArmed(false);
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
    setLocked(next) {
      if (locked === next) return;
      locked = next;
      setArmed(next);
      for (const fn of [...lockListeners]) fn(next);
    },
    isLocked: () => locked,
    onLockChange(fn) {
      lockListeners.add(fn);
      return () => lockListeners.delete(fn);
    },
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
    suppressNextClick(within = 0) {
      clickSuppressed = true;
      const stop = () => {
        clickSuppressed = false;
        clearTimeout(timer);
        win.removeEventListener('click', swallow, true);
        win.removeEventListener('pointerdown', stop, true);
      };
      // Also covers a click that arrives after the modifier was released.
      win.addEventListener('click', swallow, { capture: true, once: true });
      // A new press starts a new gesture: its click is a real one.
      win.addEventListener('pointerdown', stop, { capture: true, once: true });
      const timer = setTimeout(stop, within);
    },
    destroy() {
      locked = false;
      disarm();
      for (const [type, fn] of idle) win.removeEventListener(type, fn as EventListener, true);
      handlers.clear();
      keyHandlers.clear();
      armListeners.clear();
      lockListeners.clear();
    },
  };
}
