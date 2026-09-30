/**
 * Shared DOM test helpers for `@samirdamle/dci-core` (and anything built on it).
 * happy-dom has no layout engine, so these helpers cover events and structure
 * only; geometry-dependent behaviour belongs in the Playwright suite.
 */

export interface Fixture {
  /** Wrapper element the fixture HTML is mounted into. */
  root: HTMLElement;
  /** `querySelector` scoped to the fixture; throws if nothing matches. */
  get<T extends Element = HTMLElement>(selector: string): T;
  /** `querySelectorAll` scoped to the fixture, as an array. */
  getAll<T extends Element = HTMLElement>(selector: string): T[];
  /** Remove the fixture from the document. */
  unmount(): void;
}

const mounted = new Set<Fixture>();

/** Mount an HTML string into `document.body` and return scoped query helpers. */
export function mountFixture(html: string): Fixture {
  const root = document.createElement('div');
  root.setAttribute('data-testid', 'fixture');
  root.innerHTML = html;
  document.body.appendChild(root);

  const fixture: Fixture = {
    root,
    get<T extends Element = HTMLElement>(selector: string): T {
      const el = root.querySelector<T>(selector);
      if (!el) throw new Error(`mountFixture: no element matches "${selector}"`);
      return el;
    },
    getAll<T extends Element = HTMLElement>(selector: string): T[] {
      return Array.from(root.querySelectorAll<T>(selector));
    },
    unmount() {
      root.remove();
      mounted.delete(fixture);
    },
  };
  mounted.add(fixture);
  return fixture;
}

/** Unmount every fixture created by `mountFixture`. Called automatically after each test. */
export function cleanupFixtures(): void {
  for (const fixture of [...mounted]) fixture.unmount();
}

export interface Modifiers {
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface FakePointerOptions extends Modifiers {
  /** Event type to dispatch. Defaults to `click`. */
  type?:
    | 'click'
    | 'dblclick'
    | 'pointerdown'
    | 'pointermove'
    | 'pointerup'
    | 'pointerover'
    | 'pointerout'
    | 'wheel';
  clientX?: number;
  clientY?: number;
  button?: number;
  /** Wheel delta, only used when `type` is `wheel`. */
  deltaY?: number;
}

/**
 * Dispatch a bubbling, cancelable pointer/mouse event on `el` with the given
 * modifiers. Returns the dispatched event so tests can check `defaultPrevented`.
 */
export function fakePointer(el: Element, options: FakePointerOptions = {}): Event {
  const { type = 'click', deltaY = 0, ...rest } = options;
  const init: PointerEventInit & WheelEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    button: 0,
    clientX: 0,
    clientY: 0,
    ...rest,
  };

  let event: Event;
  if (type === 'wheel') event = withMouseFields(new WheelEvent(type, { ...init, deltaY }), init);
  else if (type.startsWith('pointer')) event = new PointerEvent(type, { pointerId: 1, ...init });
  else event = new MouseEvent(type, init);

  el.dispatchEvent(event);
  return event;
}

/**
 * happy-dom's WheelEvent drops the MouseEvent init fields (modifiers,
 * coordinates, button); browsers keep them. Define them on the instance.
 */
function withMouseFields(event: WheelEvent, init: MouseEventInit): WheelEvent {
  const keys = [
    'altKey',
    'shiftKey',
    'ctrlKey',
    'metaKey',
    'clientX',
    'clientY',
    'button',
  ] as const;
  for (const key of keys) {
    if (event[key] !== init[key]) Object.defineProperty(event, key, { value: init[key] });
  }
  return event;
}

export interface FakeKeyOptions extends Modifiers {
  /** Event type to dispatch. Defaults to `keydown`. */
  type?: 'keydown' | 'keyup';
  /** Dispatch target. Defaults to `document.activeElement` or `document.body`. */
  target?: EventTarget;
}

/**
 * Dispatch a bubbling, cancelable keyboard event. Returns the dispatched event
 * so tests can check `defaultPrevented`.
 */
export function fakeKey(key: string, options: FakeKeyOptions = {}): KeyboardEvent {
  const { type = 'keydown', target = document.activeElement ?? document.body, ...mods } = options;
  const event = new KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
  });
  target.dispatchEvent(event);
  return event;
}
