import { DciContextNode, DciRequest, DciEvent } from '@dci/protocol';
export { DciAncestor, DciContextNode, DciEvent, DciFallbackInfo, DciRequest } from '@dci/protocol';

type Warn = (message: string) => void;

/** Default attribute that marks an element as DCI context. */
declare const DEFAULT_ATTRIBUTE = "data-dci";
/** Normalized `data-dci` payload. */
interface ParsedDci {
    id?: string;
    type?: string;
    label?: string;
    /** `true` when the node must never be selected or sent. */
    private: boolean;
    /** Every non-reserved key, passed through to the backend as-is. */
    data: Record<string, unknown>;
}
interface ParseOptions {
    /** Attribute name to read. Defaults to `data-dci`. */
    attribute?: string;
    /** Receives parse warnings. Defaults to a dev-mode `console.warn`. */
    warn?: Warn;
}
/**
 * Parse a raw `data-dci` value.
 *
 * - `null` (attribute absent) → `null`
 * - `""` → an anonymous node
 * - A JSON object (`{...}`) → reserved keys split out, the rest in `data`
 * - Anything else → short form, the string is the `id`
 *
 * Values that look like JSON (`{` or `[`) but aren't a valid object fall back
 * to the short form and report through `warn`.
 */
declare function parseDciAttribute(value: string | null, warn?: Warn): ParsedDci | null;
/**
 * Read and parse an element's DCI attribute. Results are cached per element
 * and reused until the raw attribute value (or attribute name) changes.
 * Parse warnings are reported at most once per element.
 */
declare function readDci(el: Element, options?: ParseOptions): ParsedDci | null;
/** Whether `el` carries the DCI attribute. */
declare const isDciElement: (el: Element, attribute?: string) => boolean;

interface TreeOptions {
    /** Attribute that marks DCI nodes. Defaults to `data-dci`. */
    attribute?: string;
    /** Scope root; nodes outside it are ignored. Defaults to `document.body`. */
    root?: Element;
}
/**
 * Queries over the DCI tree: the live DOM reduced to annotated elements.
 * Nothing is cached, so the host app can re-render freely.
 *
 * `private` nodes are transparent for navigation (never returned, their
 * annotated descendants belong to the nearest non-private ancestor) but are
 * kept in `pathTo`, so context extraction can mark them.
 */
interface DciTree {
    /** Closest navigable ancestor-or-self of `el`, or `null`. */
    nearestNode(el: Element): Element | null;
    /** Nearest navigable ancestor of `node`, excluding `node` itself. */
    parentNode(node: Element): Element | null;
    /** Direct DCI children of `node`, in document order. */
    childNodes(node: Element): Element[];
    firstChildNode(node: Element): Element | null;
    /** Other DCI children of the same parent (top-level nodes when there is no parent). */
    siblingNodes(node: Element): Element[];
    prevSibling(node: Element): Element | null;
    nextSibling(node: Element): Element | null;
    /** Siblings sharing `node`'s `type`, including `node`. */
    sameTypeSiblings(node: Element): Element[];
    /** Annotated chain from the root down to `node` (inclusive), private nodes included. */
    pathTo(node: Element): Element[];
}
declare function createDciTree(options?: TreeOptions): DciTree;

interface ContextOptions extends TreeOptions {
    /** Include the ancestor chain. Default `true`. */
    includeAncestors?: boolean;
    /** `'compact'` sends id/type/label only; `'full'` adds `data`. Default `'compact'`. */
    ancestorData?: 'compact' | 'full';
    /** Capture unannotated elements. Default `true`. */
    fallback?: boolean;
    /** Max fallback text length before truncation. Default `500`. */
    maxTextLength?: number;
}
/** Collapse whitespace and cap at `max` characters, marking truncation with `…`. */
declare function truncateText(text: string, max: number): string;
/** Short, human-readable CSS path from `el` up to `root` (exclusive), an `#id`, or 5 levels. */
declare function cssPath(el: Element, root?: Element): string;
/**
 * Build the payload for one element: annotated nodes use their `data-dci`,
 * unannotated ones get a fallback description (when enabled). Returns `null`
 * for private nodes, for unannotated elements inside a private node, and
 * for unannotated elements when `fallback` is off.
 * Output is deterministic for a given DOM.
 */
declare function toContextNode(el: Element, options?: ContextOptions): DciContextNode | null;

interface SelectionOptions extends ContextOptions {
    /** Maximum number of selected nodes. Default `50`. */
    maxSelection?: number;
}
interface SelectionChange {
    /** The full selection, in selection order. */
    elements: Element[];
    added: Element[];
    removed: Element[];
    primary: Element | null;
}
interface SelectionLimit {
    /** How many elements were rejected since the last event. */
    dropped: number;
    max: number;
}
interface SelectionEvents {
    selectionchange: SelectionChange;
    selectionlimit: SelectionLimit;
}
type Listener$1<T> = (event: T) => void;
interface SelectionStore {
    /** Selected elements, in selection order. */
    get(): Element[];
    /** Replace the selection. */
    set(els: Iterable<Element>): void;
    /** Append, skipping elements already selected. */
    add(els: Iterable<Element> | Element): void;
    remove(els: Iterable<Element> | Element): void;
    /** Add `el` if absent, otherwise remove it. */
    toggle(el: Element): void;
    clear(): void;
    has(el: Element): boolean;
    /** Last-interacted node (breadcrumb, keyboard navigation), or `null`. */
    primary(): Element | null;
    /** Make an already-selected element the primary node. */
    setPrimary(el: Element): void;
    /** Listen for `selectionchange`; returns an unsubscribe function. */
    subscribe(fn: Listener$1<SelectionChange>): () => void;
    on<K extends keyof SelectionEvents>(type: K, fn: Listener$1<SelectionEvents[K]>): () => void;
    /** The selection as backend payloads (private/unsupported nodes dropped). */
    toContext(): DciContextNode[];
    /** Stop observing the DOM and drop all listeners. */
    destroy(): void;
}
/**
 * Framework-agnostic selection store. State updates synchronously; change
 * events are batched per microtask, so a burst of mutations (e.g. a window
 * select) emits a single `selectionchange`.
 */
declare function createSelectionStore(options?: SelectionOptions): SelectionStore;

type Listener<T> = (event: T) => void;
/** Minimal typed event emitter. */
interface Emitter<Events extends object> {
    on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void;
    emit<K extends keyof Events>(type: K, event: Events[K]): void;
    /** Remove every listener. */
    clear(): void;
}
declare function createEmitter<Events extends object>(): Emitter<Events>;

/** Keys that can act as the DCI modifier. `Alt` is Option on macOS. */
type ModifierKey = 'Alt' | 'Shift' | 'Control' | 'Meta';
type ModifierEvent = Pick<KeyboardEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>;
/**
 * Whether `mod` is held. Reads the event flag (`altKey`, …) rather than
 * `event.key`, because Option on macOS changes printable characters.
 */
declare const hasModifier: (e: ModifierEvent, mod: ModifierKey) => boolean;
/**
 * Match a key combo such as `'Enter'`, `'Alt+Enter'` or `'Shift+ArrowUp'`.
 * Listed modifiers must be held; other modifiers are ignored unless `exact`.
 */
declare function matchesCombo(e: KeyboardEvent, combo: string, exact?: boolean): boolean;
/** Whether `el` accepts text input (`input`, `textarea`, `select`, contenteditable). */
declare function isEditable(el: Element | null): boolean;
/** Attribute marking DCI's own UI (the shadow host); its events are ignored. */
declare const DCI_UI_ATTRIBUTE = "data-dci-ui";
/** Whether `e` originated inside DCI's own UI. */
declare const isFromDciUi: (e: Event) => boolean;

/** Keyboard map, active while a selection exists. Each key can be remapped or `false`. */
interface KeyboardBindings {
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
interface Bindings {
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
type BindingsConfig = Partial<Omit<Bindings, 'keyboard'>> & {
    keyboard?: Partial<KeyboardBindings> | false;
};
declare const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindings;
declare const DEFAULT_BINDINGS: Bindings;
/** Merge user bindings over the defaults. */
declare function resolveBindings(config?: BindingsConfig): Bindings;

/**
 * What a gesture handler did with an event:
 * - `'consume'`: DCI handled it; prevent the default and stop propagation
 * - `'handled'`: DCI acted but the host still sees the event
 * - nothing: not a DCI gesture; the event is left alone
 */
type GestureResult = 'consume' | 'handled' | void;
type ArmedEventMap = {
    pointermove: PointerEvent;
    pointerdown: PointerEvent;
    click: MouseEvent;
    dblclick: MouseEvent;
    wheel: WheelEvent;
};
type ArmedEventType = keyof ArmedEventMap;
interface InputOptions {
    /** Key that arms DCI. Default `'Alt'` (Option on macOS). */
    modifier?: ModifierKey;
    /** Where listeners are attached. Default `window`. */
    target?: Window;
}
interface InputManager {
    readonly modifier: ModifierKey;
    /** Whether the modifier is currently held. */
    isArmed(): boolean;
    /** Handle an event type that is only listened to while armed. */
    on<K extends ArmedEventType>(type: K, fn: (e: ArmedEventMap[K]) => GestureResult): () => void;
    /**
     * Handle every non-modifier `keydown` (armed or not). Like `on`, handlers
     * run in registration order and the first `'consume'` stops the rest.
     */
    onKeyDown(fn: (e: KeyboardEvent) => GestureResult): () => void;
    /** Called with `true` on arm and `false` on disarm. */
    onArmChange(fn: (armed: boolean) => void): () => void;
    /** Swallow the click a browser fires right after a drag gesture. */
    suppressNextClick(): void;
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
declare function createInputManager(options?: InputOptions): InputManager;

/**
 * The hover target shared by gestures: the leaf under the pointer, plus an
 * optional depth offset (Mod+Wheel) that moves the target up its DCI chain.
 */
interface HoverState {
    /** Node resolved directly under the pointer. */
    leaf(): Element | null;
    /** Current target: `leaf` moved up `depth` levels. */
    node(): Element | null;
    depth(): number;
    /** Targets from the leaf (index 0) up to the top-level node. */
    chain(): Element[];
    /** Point at a new leaf; resets the depth when the leaf changes. */
    setLeaf(leaf: Element | null): void;
    /** Move up (`> 0`) the chain, clamped to its ends. */
    setDepth(depth: number): void;
}
declare function createHoverState(tree: DciTree, bus: Emitter<InteractionEvents>): HoverState;

type Theme = 'light' | 'dark' | 'auto';
type LayerName = 'overlay' | 'chat' | 'live-region';
interface UiHostOptions {
    /** Where the host element is appended. Default `document.body`. */
    container?: Element;
    /** Default `'auto'` (follows `prefers-color-scheme`). */
    theme?: Theme;
}
interface UiHost {
    readonly element: HTMLElement;
    readonly shadow: ShadowRoot;
    layer(name: LayerName): HTMLElement;
    /** Add a stylesheet (CSS text) to the shadow root. Returns a remover. */
    addStyles(css: string): () => void;
    setTheme(theme: Theme): void;
}
declare const HOST_TAG = "dci-root";
/**
 * Theme tokens. Custom properties inherit through the shadow boundary, so a
 * host page can override any of them, e.g. `dci-root { --dci-accent: hotpink }`.
 */
declare const BASE_CSS = "\n:host {\n  all: initial;\n  position: fixed;\n  inset: 0;\n  pointer-events: none;\n  z-index: var(--dci-z, 2147483000);\n  box-sizing: border-box;\n  color-scheme: light dark;\n  font: 13px/1.4 var(--dci-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);\n  color: var(--dci-fg);\n  --dci-accent: #2563eb;\n  --dci-hover: #2563eb;\n  --dci-selected: #2563eb;\n  --dci-preview: #7c3aed;\n  --dci-bg: #ffffff;\n  --dci-fg: #0f172a;\n  --dci-muted: #64748b;\n  --dci-border: #e2e8f0;\n  --dci-radius: 6px;\n  --dci-shadow: 0 4px 16px rgb(15 23 42 / 0.12);\n  --dci-on-accent: #ffffff;\n  --dci-surface: #f1f5f9;\n  --dci-danger: #b91c1c;\n  --dci-success: #15803d;\n}\n:host([data-theme='dark']) {\n  --dci-accent: #60a5fa;\n  --dci-hover: #60a5fa;\n  --dci-selected: #60a5fa;\n  --dci-preview: #a78bfa;\n  --dci-bg: #0f172a;\n  --dci-fg: #f1f5f9;\n  --dci-muted: #94a3b8;\n  --dci-border: #334155;\n  --dci-shadow: 0 4px 16px rgb(0 0 0 / 0.5);\n  --dci-on-accent: #0f172a;\n  --dci-surface: #1e293b;\n  --dci-danger: #fca5a5;\n  --dci-success: #86efac;\n}\n@media (prefers-color-scheme: dark) {\n  :host([data-theme='auto']) {\n    --dci-accent: #60a5fa;\n    --dci-hover: #60a5fa;\n    --dci-selected: #60a5fa;\n    --dci-preview: #a78bfa;\n    --dci-bg: #0f172a;\n    --dci-fg: #f1f5f9;\n    --dci-muted: #94a3b8;\n    --dci-border: #334155;\n    --dci-shadow: 0 4px 16px rgb(0 0 0 / 0.5);\n  --dci-on-accent: #0f172a;\n  --dci-surface: #1e293b;\n  --dci-danger: #fca5a5;\n  --dci-success: #86efac;\n  }\n}\n*, *::before, *::after { box-sizing: border-box; }\n[data-layer] { position: fixed; inset: 0; pointer-events: none; }\n[data-layer='chat'] > * { pointer-events: auto; }\n[data-layer='live-region'] {\n  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;\n  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; inset: auto;\n}\n";
/**
 * Get the shared UI host for a container, creating it on first use. Every
 * DCI instance shares one host per container; each `acquire` must be paired
 * with a `release`, and the last release removes the host and everything in it.
 */
declare function acquireUiHost(options?: UiHostOptions): {
    host: UiHost;
    release: () => void;
};

type OverlayMode = 'boxes' | 'outline';
type LabelMode = 'hover' | 'all' | 'none';
interface OverlayOptions {
    /** `'boxes'` (default) draws in the shadow layer; `'outline'` styles targets inline. */
    mode?: OverlayMode;
    /** Which boxes get a name tag. Default `'hover'` (hover and primary). */
    labels?: LabelMode;
    /** Attribute used to read labels. Default `data-dci`. */
    attribute?: string;
    /** Observed for layout changes while boxes are shown. Default `document.body`. */
    root?: Element;
}
interface Overlay {
    /** Hover target; `depth` is the Mod+Wheel offset shown in the label (`▲1`). */
    setHover(el: Element | null, meta?: {
        depth?: number;
    }): void;
    setSelected(els: Element[], primary?: Element | null): void;
    /** Window-select candidates before release. */
    setPreview(els: Element[]): void;
    setMarquee(marquee: {
        rect: Rect;
        mode: 'contain' | 'touch';
    } | null): void;
    /** Short shake on the primary box (keyboard hit an edge of the tree). */
    boundary(): void;
    /** Attention pulse, e.g. for the `highlight` client action. */
    flash(el: Element): void;
    destroy(): void;
}
declare const OVERLAY_CSS = "\n.box {\n  position: fixed; left: 0; top: 0; display: none;\n  border-radius: var(--dci-radius);\n  will-change: transform;\n}\n.box.hover { border: 2px dashed var(--dci-hover); }\n.box.selected {\n  border: 2px solid var(--dci-selected);\n  background: color-mix(in srgb, var(--dci-selected) 12%, transparent);\n}\n.box.primary { border-width: 3px; }\n.box.preview {\n  border: 1px solid var(--dci-preview);\n  background: color-mix(in srgb, var(--dci-preview) 10%, transparent);\n}\n.box.flash { border: 3px solid var(--dci-accent); animation: dci-pulse 0.7s ease-out 2; }\n.box.shake { animation: dci-shake 0.3s ease-in-out; }\n.label {\n  position: absolute; left: -2px; bottom: 100%;\n  max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\n  padding: 1px 6px; border-radius: 4px 4px 0 0;\n  font: 600 11px/16px var(--dci-font, system-ui, sans-serif);\n  color: #fff; background: var(--dci-accent);\n}\n.box.hover .label { background: var(--dci-hover); }\n.label.inside { top: 0; bottom: auto; left: 0; border-radius: 0 0 4px 0; }\n.edge {\n  position: fixed; left: 0; top: 0; display: none; width: 10px; height: 10px;\n  margin: -5px 0 0 -5px; border-radius: 50%;\n  background: var(--dci-selected); box-shadow: 0 0 0 2px var(--dci-bg);\n}\n.marquee {\n  position: fixed; left: 0; top: 0; display: none;\n  border: 1px solid var(--dci-accent);\n  background: color-mix(in srgb, var(--dci-accent) 8%, transparent);\n}\n.marquee.touch { border-style: dashed; }\n@keyframes dci-pulse {\n  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dci-accent) 60%, transparent); }\n  100% { box-shadow: 0 0 0 12px transparent; }\n}\n@keyframes dci-shake {\n  0%, 100% { translate: 0; }\n  25% { translate: -4px; }\n  75% { translate: 4px; }\n}\n@media (prefers-reduced-motion: reduce) {\n  .box, .box.flash, .box.shake { animation: none !important; }\n}\n";
/** Name shown in labels: `label ?? type ?? tagName`. */
declare function labelFor(el: Element, attribute?: string): string;
/**
 * Draws hover, selected, primary and preview boxes in the host's overlay
 * layer. Boxes are `position: fixed`, moved with `transform`, and updated in
 * one animation-frame pass (read every rect, then write every box). Listeners
 * and observers exist only while something is shown.
 */
declare function createOverlay(host: UiHost, options?: OverlayOptions): Overlay;
/**
 * Lightweight mode: sets `outline` inline on targets and restores the exact
 * previous inline values afterwards. Trade-offs: outlines can be clipped by
 * `overflow: hidden`, it mutates host styles, and it has no labels. The
 * marquee is still drawn in the overlay layer.
 */
declare function createOutlineOverlay(host: UiHost, _options?: OverlayOptions): Overlay;

type SameTypeContext = Pick<GestureContext, 'tree' | 'selection' | 'options'>;
/**
 * Nodes of the same kind as `node` among its siblings, including `node`, in
 * document order. Typed nodes match on `type`; untyped ones match on tag name
 * only when `fallback` is on. Returns `[]` when there is nothing to match on.
 */
declare function sameTypeNodes(ctx: SameTypeContext, node: Element): Element[];
interface SelectSameTypeOptions {
    /** Add to the selection instead of replacing it. */
    add?: boolean;
}
/**
 * Select every same-type sibling of `node` (default: the primary node).
 * Returns the matched nodes; `maxSelection` still applies.
 */
declare function selectSameType(ctx: SameTypeContext, node?: Element | null, { add }?: SelectSameTypeOptions): Element[];
/** Mod+Double-click selects all same-type siblings (Shift adds). */
declare const sameTypeGesture: Gesture;

interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
/** State emitted for the overlay (M3). Gestures render nothing themselves. */
interface InteractionEvents {
    /** Modifier pressed (`true`) or released (`false`). */
    arm: boolean;
    /** Hover preview target; `depth` is how many levels Mod+Wheel moved above the leaf. */
    hover: {
        node: Element | null;
        depth: number;
    };
    /** Window-select rectangle in viewport coordinates, or `null` when the drag ends. */
    marquee: {
        rect: Rect;
        mode: 'contain' | 'touch';
    } | null;
    /** Nodes currently inside the marquee, before release. */
    marqueePreview: Element[];
    /** Keyboard navigation hit an edge of the tree. */
    navboundary: {
        direction: 'parent' | 'child' | 'prev' | 'next';
    };
    /** Text for the polite live region. */
    announce: string;
    /** Pulse an element in the overlay (e.g. hovering a context chip). */
    flash: Element;
}
interface OverlayConfig {
    /** `'boxes'` (default) or the lightweight `'outline'` mode. */
    mode?: OverlayMode;
    /** Which boxes get a name tag. Default `'hover'` (hover and primary). */
    labels?: LabelMode;
    /** Default `'auto'` (follows `prefers-color-scheme`). */
    theme?: Theme;
    /** Where the `<dci-root>` UI host is appended. Default `document.body`. */
    container?: Element;
}
interface InteractionOptions extends SelectionOptions {
    /** Built-in highlight overlay; `false` to render your own from the bus events. */
    overlay?: OverlayConfig | false;
    /** Key that arms DCI. Default `'Alt'`. */
    modifier?: ModifierKey;
    bindings?: BindingsConfig;
    /** Mod+Click on empty space clears the selection. Default `true`. */
    clearOnEmptyClick?: boolean;
    /** Let DCI clicks reach the host app too. Default `false` (they are swallowed). */
    passthroughClicks?: boolean;
    /**
     * Called on Esc before the selection is cleared. Return `true` when it
     * handled the key (e.g. closed the chat), so the selection is kept.
     */
    onEscape?: () => boolean;
    /** Window select picks the innermost (`'leaf'`, default) or outermost (`'top'`) matches. */
    windowSelectLevel?: 'leaf' | 'top';
    /** Gesture modules to attach. Defaults to every built-in gesture. */
    gestures?: Gesture[];
    /**
     * Share an existing selection store, e.g. to keep the selection across a
     * rebuild. A shared store is not destroyed with the interactions.
     */
    selection?: SelectionStore;
    /** Share an existing event bus. A shared bus is not cleared on destroy. */
    bus?: Emitter<InteractionEvents>;
}
interface GestureContext {
    options: InteractionOptions;
    bindings: Bindings;
    input: InputManager;
    tree: DciTree;
    selection: SelectionStore;
    bus: Emitter<InteractionEvents>;
    hover: HoverState;
}
/** A gesture wires itself to the context and returns its cleanup. */
type Gesture = (ctx: GestureContext) => () => void;
interface Interactions extends GestureContext {
    /** Select all same-type siblings of `node` (default: the primary node). */
    selectSameType(node?: Element | null, options?: SelectSameTypeOptions): Element[];
    destroy(): void;
}
/** Built-in gestures and the overlay that draws their state. */
declare const DEFAULT_GESTURES: Gesture[];
/**
 * Wire the input manager, DCI tree, selection store and gesture modules
 * together. Every piece is exposed so hosts can listen, extend or replace it.
 */
declare function createInteractions(options?: InteractionOptions): Interactions;

/** The element an event really hit, looking through open shadow roots. */
declare function eventTarget(e: Event): Element | null;
/**
 * The DCI node for a pointer target: the nearest annotated node, or with
 * `fallback` on, the raw element itself (when inside the root).
 */
declare function resolveTarget(ctx: GestureContext, target: Element | null): Element | null;
/** Hover preview: while armed, track the node under the pointer once per frame. */
declare const hoverGesture: Gesture;
/**
 * Mod+Click selects (replacing the selection); Mod+<toggle>+Click toggles.
 * When Mod+Wheel moved the hover target up, the click uses that target.
 */
declare const clickGesture: Gesture;

/** Scroll distance (px) per level. Trackpads send many small deltas. */
declare const WHEEL_STEP = 40;
/** Normalize a wheel delta to pixels. */
declare function wheelPixels(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number;
/**
 * Mod+Wheel moves the hover target along its DCI chain: wheel up toward the
 * root, wheel down back toward the leaf under the pointer. Deltas accumulate
 * so one level is one `WHEEL_STEP`, and the page never scrolls while armed.
 */
declare const wheelGesture: Gesture;

type MarqueeMode = 'contain' | 'touch';
/** Rectangle spanning two points, in any drag direction. */
declare function rectFromPoints(x1: number, y1: number, x2: number, y2: number): Rect;
/** Left→right drags select contained nodes; right→left drags select touched nodes. */
declare const marqueeMode: (startX: number, currentX: number) => MarqueeMode;
declare const contains: (outer: Rect, inner: Rect) => boolean;
declare const intersects: (a: Rect, b: Rect) => boolean;
declare const offsetRect: (r: Rect, dx: number, dy: number) => Rect;
interface Candidate {
    el: Element;
    /** Rect in page coordinates (viewport rect + scroll at measure time). */
    rect: Rect;
    /** Index of the nearest candidate ancestor, or -1. */
    parent: number;
}
/**
 * Candidates hit by `box` in `mode`, reduced to the innermost (`'leaf'`) or
 * outermost (`'top'`) matches. O(n × depth); rects are measured up front.
 */
declare function hitTest(candidates: Candidate[], box: Rect, mode: MarqueeMode, level?: 'leaf' | 'top'): Element[];

/** Pointer travel (px) before a press becomes a drag instead of a click. */
declare const DRAG_THRESHOLD = 4;
/** Distance (px) from a viewport edge that starts auto-scrolling. */
declare const AUTOSCROLL_EDGE = 24;
/** Maximum auto-scroll speed (px per frame). */
declare const AUTOSCROLL_SPEED = 20;
/** Every navigable DCI node under the root, with parent links. */
declare function collectCandidates(tree: DciTree, root: Element): Candidate[];
/**
 * Mod+Drag window select. Left→right selects nodes fully inside the box;
 * right→left selects nodes it touches. Shift adds, Ctrl/Cmd subtracts,
 * Esc cancels. Rects are measured once at drag start (and after scrolling),
 * so each frame is a plain rectangle test.
 */
declare const marqueeGesture: Gesture;

/** Human-readable name: label, then id, then tag name. */
declare function nodeName(el: Element, attribute?: string): string;
/**
 * Screen-reader description of a node and its position among same-type
 * siblings, e.g. `"Invoice #123, invoice 3 of 20"`.
 */
declare function describeNode(el: Element, tree: DciTree, attribute?: string): string;
/**
 * A polite `aria-live` region, rendered into `parent` (normally the UI
 * host's `live-region` layer) or, without one, a hidden `[data-dci-ui]` host.
 */
declare function createAnnouncer(parent?: Element | ShadowRoot): {
    announce(text: string): void;
    element: () => HTMLElement | null;
    destroy(): void;
};
/** Speak `announce` bus events through a live region in the DCI UI host. */
declare const announceGesture: Gesture;

/**
 * Keyboard navigation while a selection exists (and focus is not in an
 * editable field): arrows move the primary node through the DCI tree,
 * Shift+arrow extends, Esc clears. `Alt+Enter` selects the focused
 * element's node without a pointer. Keys are only consumed when handled,
 * and never while focus is inside a dialog (the host app's Esc must work).
 */
declare const keyboardGesture: Gesture;

/** Draws M2 state (hover, selection, marquee, boundaries) with the overlay. */
declare const overlayGesture: Gesture;

/**
 * How DCI talks to a backend. The default speaks the SSE protocol over
 * `fetch`; adapters (Vercel AI SDK, AG-UI, WebSocket, …) implement the same
 * interface, so swapping one in needs no other changes.
 */
interface Transport {
    send(request: DciRequest, options: {
        signal: AbortSignal;
    }): AsyncIterable<DciEvent>;
}
type HeadersInput$1 = Record<string, string> | Headers;
interface SSETransportOptions {
    /** URL to `POST` requests to. */
    endpoint: string;
    /** Extra headers, or a (possibly async) function evaluated on every request. */
    headers?: HeadersInput$1 | (() => HeadersInput$1 | Promise<HeadersInput$1>);
    /** Custom `fetch`, e.g. an auth wrapper or a test double. Default: global `fetch`. */
    fetch?: typeof fetch;
    /** Default `'same-origin'`. */
    credentials?: RequestCredentials;
    /** Receives protocol warnings. Default: dev-mode `console.warn`. */
    warn?: Warn;
}
/**
 * The default transport: `POST`s the request as JSON and reads the SSE
 * response. Failures become `error` events (HTTP status, `network`); an abort
 * ends quietly; a stream that stops without `done` gets a synthetic one.
 * There are no automatic retries: retrying is a user action.
 */
declare function createSSETransport(options: SSETransportOptions): Transport;

interface ActionContext {
    selection: SelectionStore;
    overlay: Pick<Overlay, 'flash'> | null;
    /** Elements whose `data-dci` id is `id` (short or JSON form), under the root. */
    resolve(id: string): Element[];
}
type ActionHandler = (args: Record<string, unknown>, ctx: ActionContext) => void | Promise<void>;
interface ActionError {
    name: string;
    args: Record<string, unknown>;
    error: unknown;
}
interface ActionRegistryOptions {
    selection: SelectionStore;
    /** Anything that can pulse an element, e.g. the overlay. */
    overlay?: Pick<Overlay, 'flash'> | null;
    /** Where ids are looked up. Default `document.body`. */
    root?: Element;
    attribute?: string;
    /**
     * Built-in actions to register: `true` (default) for all, `false` for none,
     * or a list such as `['highlight', 'scrollTo']`.
     */
    builtins?: boolean | BuiltinAction[];
    /** Called when a handler throws; the stream is never interrupted. */
    onError?: (error: ActionError) => void;
    warn?: Warn;
}
type BuiltinAction = 'highlight' | 'select' | 'scrollTo';
interface ActionRegistry {
    /**
     * Register a handler. The latest registration for a name wins (so a
     * built-in can be overridden); unsubscribing restores the previous one.
     */
    on(name: string, handler: ActionHandler): () => void;
    /** Run the handler for a `client-action` event. Never throws. */
    dispatch(name: string, args?: Record<string, unknown>): Promise<void>;
    has(name: string): boolean;
}
declare const BUILTIN_ACTIONS: Record<BuiltinAction, ActionHandler>;
/** Handlers for `client-action` events: the agent asking the page to act. */
declare function createActionRegistry(options: ActionRegistryOptions): ActionRegistry;

interface SessionOptions {
    /**
     * `'page'` (default): a new random id per page load (per `createSession`).
     * `'manual'`: you supply `id` and control it.
     */
    scope?: 'page' | 'manual';
    /** Fixed id or a function returning one. Required for `'manual'`. */
    id?: string | (() => string);
}
interface SessionChange {
    id: string;
    previous: string;
}
interface Session {
    readonly id: string;
    /**
     * Start a new conversation: rotates the id (or uses `newId`). Chat history
     * listeners clear on `sessionchange`; memory lives on the backend, which
     * only ever sees the new id.
     */
    reset(newId?: string): string;
    onChange(fn: (change: SessionChange) => void): () => void;
}
/** A random UUID, with a fallback for environments without `crypto.randomUUID`. */
declare function randomId(): string;
/**
 * The conversation id sent with every request. Conversations are not stored
 * in the browser: that is intentional, memory is the backend's job.
 */
declare function createSession(options?: SessionOptions): Session;

type ChatStatus = 'idle' | 'sending' | 'streaming' | 'error';
interface ToolStatus {
    id: string;
    name: string;
    label?: string;
    state: 'running' | 'ok' | 'failed';
}
interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    /** Context sent with a user message. */
    context?: DciContextNode[];
    /** Suggested-action id, when the message came from an action. */
    action?: string;
    tools: ToolStatus[];
    error?: {
        message: string;
        code?: string;
    };
    /** The user pressed Stop before the answer finished. */
    stopped?: boolean;
    /** The assistant finished (done, error or stop). */
    complete?: boolean;
}
interface ChatState {
    status: ChatStatus;
    open: boolean;
    messages: readonly ChatMessage[];
    /** Context that will go with the next message (shown as chips). */
    pendingContext: readonly DciContextNode[];
    draft: string;
    /** Waiting for the user to confirm sending (see `confirmBeforeSend`). */
    confirm: {
        request: DciRequest;
    } | null;
    /** Transient notice, e.g. a send cancelled by `beforeSend`. */
    notice: 'cancelled' | null;
    /** Set when the last selection hit `maxSelection`. */
    limit: {
        shown: number;
        total: number;
    } | null;
}

type MaybePromise$1<T> = T | Promise<T>;
interface ChatControllerOptions {
    transport: Transport;
    selection: SelectionStore;
    /** Default: a new page-scoped session. */
    session?: Session;
    /** Runs `client-action` events. */
    actions?: ActionRegistry;
    /** How selected elements become context (match the selection store's options). */
    contextOptions?: ContextOptions;
    /**
     * `'turn'` (default) sends only context added since the last message (the
     * backend keeps history via `sessionId`); `'cumulative'` resends all of it.
     */
    contextMode?: 'turn' | 'cumulative';
    /** Sending while a reply streams: `'block'` (default) ignores it, `'queue'` waits. */
    concurrency?: 'block' | 'queue';
    /** Redact or enrich a request; return `false` to cancel it. */
    beforeSend?: (request: DciRequest) => MaybePromise$1<DciRequest | false>;
    /** Ask the user before sending: `true`, or decide per request. */
    confirmBeforeSend?: boolean | ((request: DciRequest) => boolean);
    /** Page info sent with each request. Default: `location.href` and `document.title`. */
    page?: () => {
        url: string;
        title: string;
    };
    /** Receives custom `x-…` events. */
    onCustomEvent?: (event: DciEvent) => void;
}
interface SendOptions {
    action?: string;
}
interface ChatController {
    getState(): ChatState;
    /** Called with each new state snapshot; returns an unsubscribe function. */
    subscribe(fn: (state: ChatState) => void): () => void;
    open(): void;
    close(): void;
    setDraft(text: string): void;
    /** Send `prompt` (default: the draft). Resolves `false` when nothing was sent. */
    send(prompt?: string, options?: SendOptions): Promise<boolean>;
    /** Abort the reply that is streaming. */
    stop(): void;
    /** Resend the last user message with the same context. */
    retry(): Promise<boolean>;
    /** Drop one context item (and deselect its element). */
    removeContext(node: DciContextNode): void;
    /** The page element behind a pending context item, or `null`. */
    elementFor(node: DciContextNode): Element | null;
    /** Answer a pending `confirmBeforeSend` prompt. */
    confirm(accept: boolean, options?: {
        dontAskAgain?: boolean;
    }): void;
    /** The exact request `send` would make next, after `beforeSend` (or `false`). */
    previewRequest(prompt?: string, options?: SendOptions): Promise<DciRequest | false>;
    readonly session: Session;
    destroy(): void;
}
/**
 * Framework-agnostic chat state machine. It snapshots the selection into
 * each user message, streams the reply through the transport, and exposes
 * immutable state (structurally shared), so any UI, or React's
 * `useSyncExternalStore`, can render it.
 */
declare function createChatController(options: ChatControllerOptions): ChatController;

interface SuggestedAction {
    id: string;
    label: string;
    /** Sent as the prompt; defaults to `label`. */
    prompt?: string;
    icon?: string;
    /** Extra filter on the current context. */
    when?: (nodes: readonly DciContextNode[]) => boolean;
    /** Offer when several nodes are selected. Default `true`. */
    multi?: boolean;
}
/** Actions per node `type`, with `'*'` for every selection, or a function. */
type ActionsConfig = Record<string, SuggestedAction[]> | ((nodes: readonly DciContextNode[]) => SuggestedAction[]);
/**
 * Actions to offer for the given context:
 * - one type selected: that type's actions, then `'*'`
 * - mixed types: actions every type offers (by id), then `'*'`
 * - `when` and `multi` filter further; duplicates (by id) are dropped
 */
declare function resolveActions(config: ActionsConfig | undefined, nodes: readonly DciContextNode[]): SuggestedAction[];

interface MarkdownOptions {
    /** Syntax-highlighting hook for fenced code; return a node to replace the plain text. */
    highlightCode?: (code: string, lang: string) => Node;
    /** Label for the copy button on code blocks. Default `'Copy'`. */
    copyLabel?: string;
    copiedLabel?: string;
}
/** Replaces the default renderer. Must treat `text` as untrusted. */
type RenderMarkdown = (text: string, options: MarkdownOptions) => Node;
/** `url` if it is an absolute http(s)/mailto link, otherwise `null`. */
declare function safeUrl(url: string): string | null;
/** Inline markdown to DOM nodes. Text only ever becomes text nodes. */
declare function renderInline(text: string): Node[];
/**
 * Small, safe markdown subset for model output: paragraphs, headings,
 * lists, quotes, rules, fenced code and inline code/bold/italic/links.
 * It builds DOM nodes directly (never `innerHTML`), so raw HTML in the
 * input is shown as text, and links are limited to http(s) and mailto.
 * An unterminated fence renders as code, which suits streaming.
 */
declare function renderMarkdown(text: string, options?: MarkdownOptions): DocumentFragment;

type AnchorTo = 'primary' | 'selection';
/** Union of the elements' viewport rects. */
declare function unionRect(els: Element[]): DOMRect;
interface Anchoring {
    /** Re-anchor to new targets (an empty list parks the popover in the corner). */
    setTargets(els: Element[]): void;
    /** Offset by a user drag; it survives re-anchoring until `resetNudge`. */
    nudge(dx: number, dy: number): void;
    resetNudge(): void;
    destroy(): void;
}
/**
 * Keeps `floating` next to its targets with floating-ui: it flips and shifts
 * at viewport edges, follows scroll and resize, and is hidden (via
 * `data-anchor-hidden`) while the targets are scrolled out of view.
 */
declare function anchorFloating(floating: HTMLElement): Anchoring;

/** Every piece of text the default chat UI shows. Override any key for i18n. */
interface ChatStrings {
    title: string;
    placeholder: string;
    send: string;
    stop: string;
    retry: string;
    close: string;
    collapse: string;
    expand: string;
    resize: string;
    removeContext: (label: string) => string;
    moreContext: (count: number) => string;
    lessContext: string;
    unannotated: string;
    breadcrumb: string;
    limitReached: (shown: number, total: number) => string;
    actions: string;
    moreActions: string;
    confirmSend: string;
    confirm: string;
    cancel: string;
    dontAskAgain: string;
    cancelled: string;
    stopped: string;
    newMessages: string;
    steps: (count: number) => string;
    copy: string;
    copied: string;
    messages: string;
    you: string;
    assistant: string;
    errorTitle: string;
    emptyContext: string;
}
declare const DEFAULT_STRINGS: ChatStrings;
declare const resolveStrings: (overrides?: Partial<ChatStrings>) => ChatStrings;

type ChatMode = 'popover' | 'panel';
/** What the default UI and custom renderers can call. */
interface ChatUiApi {
    readonly controller: ChatController;
    readonly strings: ChatStrings;
    readonly selection: SelectionStore;
    mode(): ChatMode;
    setMode(mode: ChatMode): void;
    /** Pulse an element in the overlay. */
    flash(el: Element): void;
    /** Select `el` alone (as the ↑ key does) and announce it. */
    selectNode(el: Element): void;
    /** Send a suggested action. */
    runAction(action: SuggestedAction): void;
}
type Slot = (state: ChatState, api: ChatUiApi) => HTMLElement;
/** Replace any section of the default shell. */
interface ChatRenderers {
    header?: Slot;
    breadcrumb?: Slot;
    chips?: Slot;
    actions?: Slot;
    input?: Slot;
    message?: (message: ChatMessage, state: ChatState, api: ChatUiApi) => HTMLElement;
}
interface ChatUiOptions {
    controller: ChatController;
    /** The interaction wiring (`createInteractions()` returns a compatible object). */
    interactions: {
        selection: SelectionStore;
        tree?: DciTree;
        bus?: Emitter<InteractionEvents>;
    };
    /** Default `'popover'`. */
    mode?: ChatMode;
    /** Panel side. Default `'right'`. */
    side?: 'left' | 'right';
    /** Popover anchor: the primary node (default) or the whole selection's box. */
    anchor?: AnchorTo;
    /**
     * `'onSelect'` (default) opens shortly after a selection, leaving focus on
     * the page so arrow-key navigation keeps working; `'onAction'` opens when a
     * message is sent (e.g. `controller.send()` from the host); `false` leaves
     * opening to the host (`controller.open()`, which focuses the input).
     */
    autoOpen?: 'onSelect' | 'onAction' | false;
    /** Panel: set `--dci-chat-inset` on `<html>` so the host can make room. */
    pushContent?: boolean;
    /** Initial panel width in px. Default 380. */
    panelWidth?: number;
    /** Suggested actions per node `type`. */
    actions?: ActionsConfig;
    /** Chips shown before "+N more". Default 6. */
    maxChips?: number;
    /** Actions shown before the overflow menu. Default 4. */
    maxActions?: number;
    strings?: Partial<ChatStrings>;
    render?: ChatRenderers;
    /** Replace the built-in (safe subset) markdown renderer. Output is untrusted. */
    renderMarkdown?: RenderMarkdown;
    /** Syntax-highlighting hook for code blocks. */
    highlightCode?: (code: string, lang: string) => Node;
    /** Attribute used to read node labels. Default `data-dci`. */
    attribute?: string;
    theme?: Theme;
    /** Where the `<dci-root>` host lives. Default `document.body`. */
    container?: Element;
}
interface ChatUi extends ChatUiApi {
    /** The chat element inside the shadow root. */
    readonly element: HTMLElement;
    /** Close the chat if open (for `interactions.onEscape`). Returns whether it did. */
    escape(): boolean;
    destroy(): void;
}
/**
 * The default chat shell: a popover anchored to the selection or a docked
 * panel, rendered from controller state into the DCI shadow root. Every
 * section can be swapped via `render`, or skip this entirely and build on
 * the headless controller.
 */
declare function createChatUi(options: ChatUiOptions): ChatUi;

/** Default chat styles, adopted into the DCI shadow root. Theme via `--dci-*` tokens. */
declare const CHAT_CSS = "\n.chat {\n  position: fixed; display: flex; flex-direction: column;\n  background: var(--dci-bg); color: var(--dci-fg);\n  border: 1px solid var(--dci-border); box-shadow: var(--dci-shadow);\n  overflow: hidden;\n}\n.chat[hidden], .tab[hidden] { display: none; }\n.chat[data-mode='popover'] {\n  width: min(380px, calc(100vw - 16px)); max-height: min(560px, calc(100vh - 16px));\n  border-radius: calc(var(--dci-radius) * 2);\n  /* The inverse of the chat's background (dark on light, light on dark), so the\n     popover stands out over any page. Override with --dci-chat-border. */\n  border: 2px solid var(--dci-chat-border, var(--dci-fg));\n}\n.chat[data-mode='popover'][data-parked] { right: 16px; bottom: 16px; }\n.chat[data-mode='popover'][data-anchor-hidden] { visibility: hidden; }\n.chat[data-mode='panel'] {\n  top: 0; bottom: 0; width: var(--dci-chat-width, 380px); max-width: 90vw;\n}\n.chat[data-mode='panel'][data-side='right'] { right: 0; border-width: 0 0 0 1px; }\n.chat[data-mode='panel'][data-side='left'] { left: 0; border-width: 0 1px 0 0; }\n.resize {\n  position: absolute; top: 0; bottom: 0; width: 6px; cursor: ew-resize;\n  background: transparent; border: 0; padding: 0;\n}\n.chat[data-side='right'] .resize { left: -3px; }\n.chat[data-side='left'] .resize { right: -3px; }\n.resize:hover, .resize:focus-visible { background: var(--dci-accent); }\n.tab {\n  position: fixed; top: 50%; padding: 10px 6px; writing-mode: vertical-rl;\n  border: 1px solid var(--dci-border); background: var(--dci-bg); color: var(--dci-fg);\n  box-shadow: var(--dci-shadow); font: inherit; cursor: pointer;\n}\n.tab[data-side='right'] { right: 0; border-radius: var(--dci-radius) 0 0 var(--dci-radius); }\n.tab[data-side='left'] { left: 0; border-radius: 0 var(--dci-radius) var(--dci-radius) 0; }\n\nbutton { font: inherit; color: inherit; cursor: pointer; }\nbutton:disabled { cursor: default; opacity: 0.55; }\n:focus-visible { outline: 2px solid var(--dci-accent); outline-offset: 2px; }\n.icon {\n  border: 0; background: transparent; padding: 2px 6px; border-radius: var(--dci-radius);\n  color: var(--dci-muted); line-height: 1;\n}\n.icon:hover { background: var(--dci-surface); color: var(--dci-fg); }\n\n.head {\n  display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 12px;\n  border-bottom: 1px solid var(--dci-border);\n}\n.chat[data-mode='popover'] .head { cursor: grab; }\n.head h2 { flex: 1; margin: 0; font-size: 13px; font-weight: 600; }\n\n.crumbs { padding: 6px 12px 0; }\n.crumbs ol { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 0; padding: 0; list-style: none; }\n.crumbs li { display: flex; align-items: center; gap: 2px; color: var(--dci-muted); }\n.crumbs li + li::before { content: '\u203A'; padding: 0 2px; }\n.crumbs button {\n  border: 0; background: transparent; padding: 1px 4px; border-radius: 4px;\n  color: var(--dci-muted); max-width: 16ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\n}\n.crumbs button:hover { background: var(--dci-surface); color: var(--dci-fg); }\n.crumbs [aria-current] { color: var(--dci-fg); font-weight: 600; }\n\n.chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 0; }\n.chips:empty { display: none; }\n.chip {\n  display: inline-flex; align-items: center; max-width: 100%;\n  border: 1px solid var(--dci-border); border-radius: 999px; background: var(--dci-surface);\n}\n.chip[data-fallback] { border-style: dashed; }\n.chip > button { border: 0; background: transparent; padding: 2px 4px 2px 8px; border-radius: 999px; }\n.chip .name { max-width: 20ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.chip small { color: var(--dci-muted); margin-left: 4px; }\n.chip > button.x { padding: 2px 8px 2px 2px; color: var(--dci-muted); }\n.chip > button.x:hover { color: var(--dci-fg); }\n.more { border: 1px dashed var(--dci-border); border-radius: 999px; background: transparent; padding: 2px 8px; }\n.hint, .notice, .limit { margin: 0; padding: 6px 12px 0; color: var(--dci-muted); font-size: 12px; }\n.notice:empty, .limit:empty { display: none; }\n\n.log {\n  flex: 1; min-height: 60px; overflow-y: auto; padding: 8px 12px;\n  display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain;\n}\n.log:empty { display: none; }\n.chat[data-mode='panel'] .log:empty { display: flex; }\n.msg { max-width: 100%; overflow-wrap: anywhere; }\n.msg.user { align-self: flex-end; max-width: 85%; }\n.msg.user .body {\n  padding: 6px 10px; border-radius: 12px 12px 2px 12px;\n  background: var(--dci-accent); color: var(--dci-on-accent); white-space: pre-wrap;\n}\n.msg .meta { color: var(--dci-muted); font-size: 11px; text-align: right; margin-top: 2px; }\n.msg.assistant .body > :first-child { margin-top: 0; }\n.msg.assistant .body > :last-child { margin-bottom: 0; }\n.body p, .body ul, .body ol, .body blockquote, .body .code { margin: 0 0 8px; }\n.body ul, .body ol { padding-left: 20px; }\n.body h3, .body h4, .body h5, .body h6 { margin: 10px 0 6px; font-size: 13px; }\n.body blockquote { padding-left: 8px; border-left: 3px solid var(--dci-border); color: var(--dci-muted); }\n.body a { color: var(--dci-accent); }\n.body code { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--dci-surface); padding: 0 3px; border-radius: 3px; }\n.body hr { border: 0; border-top: 1px solid var(--dci-border); }\n.code { position: relative; }\n.code pre { margin: 0; padding: 8px; overflow-x: auto; background: var(--dci-surface); border-radius: var(--dci-radius); }\n.code pre code { padding: 0; background: none; }\n.copy {\n  position: absolute; top: 4px; right: 4px; padding: 1px 6px; font-size: 11px;\n  border: 1px solid var(--dci-border); border-radius: 4px; background: var(--dci-bg);\n}\n.typing::after { content: '\u2026'; color: var(--dci-muted); animation: dci-blink 1s steps(2) infinite; }\n\n.tools { margin: 0 0 6px; padding: 0; list-style: none; color: var(--dci-muted); font-size: 12px; }\ndetails.tools summary { cursor: pointer; }\ndetails.tools ul { margin: 4px 0 0; padding: 0; list-style: none; }\n.tool { display: flex; align-items: center; gap: 6px; }\n.tool .state { width: 12px; text-align: center; }\n.tool[data-state='ok'] .state { color: var(--dci-success); }\n.tool[data-state='failed'] .state { color: var(--dci-danger); }\n.spinner {\n  display: inline-block; width: 10px; height: 10px; border-radius: 50%;\n  border: 2px solid var(--dci-border); border-top-color: var(--dci-accent);\n  animation: dci-spin 0.8s linear infinite;\n}\n.error {\n  padding: 8px 10px; border: 1px solid var(--dci-danger); border-radius: var(--dci-radius);\n  color: var(--dci-fg);\n}\n.error strong { color: var(--dci-danger); display: block; margin-bottom: 2px; }\n.error button, .confirm button, .send {\n  margin-top: 6px; padding: 4px 10px; border-radius: var(--dci-radius);\n  border: 1px solid var(--dci-border); background: var(--dci-bg);\n}\n.stopped { color: var(--dci-muted); font-size: 12px; font-style: italic; }\n\n.new {\n  align-self: center; margin: -36px 0 8px; position: relative; padding: 2px 10px;\n  border: 1px solid var(--dci-border); border-radius: 999px; background: var(--dci-bg);\n  box-shadow: var(--dci-shadow);\n}\n.new[hidden] { display: none; }\n\n.confirm { padding: 8px 12px; border-top: 1px solid var(--dci-border); }\n.confirm:empty { display: none; }\n.confirm p { margin: 0; }\n.confirm label { display: inline-flex; gap: 4px; align-items: center; margin-right: 8px; color: var(--dci-muted); }\n.confirm .primary { background: var(--dci-accent); color: var(--dci-on-accent); border-color: var(--dci-accent); }\n\n.actions { position: relative; display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 0; }\n.actions:empty { display: none; }\n.actions button {\n  padding: 3px 10px; border-radius: 999px; border: 1px solid var(--dci-border);\n  background: var(--dci-bg); white-space: nowrap;\n}\n.actions button:hover:not(:disabled) { border-color: var(--dci-accent); }\n.menu {\n  position: absolute; right: 12px; bottom: 100%; z-index: 1; display: flex; flex-direction: column;\n  gap: 2px; padding: 4px; border: 1px solid var(--dci-border); border-radius: var(--dci-radius);\n  background: var(--dci-bg); box-shadow: var(--dci-shadow);\n}\n.menu[hidden] { display: none; }\n.menu button { border-radius: 4px; border: 0; text-align: left; }\n\n.input { display: flex; align-items: flex-end; gap: 6px; padding: 8px 12px 12px; }\n.input textarea {\n  flex: 1; resize: none; min-height: 34px; max-height: 160px; padding: 7px 10px;\n  font: inherit; color: inherit; background: var(--dci-bg);\n  border: 1px solid var(--dci-border); border-radius: var(--dci-radius);\n}\n.input textarea:focus-visible { outline-offset: 0; border-color: var(--dci-accent); }\n.send {\n  margin: 0; height: 34px; background: var(--dci-accent); color: var(--dci-on-accent);\n  border-color: var(--dci-accent);\n}\n.send.stop { background: var(--dci-bg); color: var(--dci-fg); border-color: var(--dci-border); }\n.sr-only {\n  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;\n  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;\n}\n\n@keyframes dci-spin { to { transform: rotate(360deg); } }\n@keyframes dci-blink { 50% { opacity: 0; } }\n@media (prefers-reduced-motion: reduce) {\n  .spinner, .typing::after { animation: none; }\n  .log { scroll-behavior: auto; }\n}\n";

/** JSON with object keys sorted (recursively), so equal data gives an equal string. */
declare function stableStringify(value: unknown): string;
/** The reserved keys plus any serializable data for the node. */
interface DciAttrValue {
    id?: string;
    type?: string;
    label?: string;
    private?: boolean;
    [data: string]: unknown;
}
/**
 * Build the annotation attribute without hand-writing JSON:
 * `el.setAttribute(...Object.entries(dciAttr({ id, type, label }))[0])`, or
 * spread it in JSX. Keys are sorted, so re-renders don't churn the attribute.
 */
declare function dciAttr<A extends string = 'data-dci'>(value: DciAttrValue, attribute?: A): Record<A, string>;

type MaybePromise<T> = T | Promise<T>;
type HeadersInput = Record<string, string> | Headers;
/** Chat options (`config.chat`). */
interface DciChatConfig {
    /** Render the built-in chat UI. `false` = headless: drive `dci.chat` from your own UI. Default `true`. */
    ui?: boolean;
    /** `'popover'` (anchored to the selection) or `'panel'` (docked). Default `'popover'`. */
    mode?: ChatMode;
    /** Panel side. Default `'right'`. */
    side?: 'left' | 'right';
    /** Popover anchor: the primary node or the whole selection's box. Default `'primary'`. */
    anchor?: AnchorTo;
    /**
     * `'onSelect'` opens shortly after a selection (keeping focus on the page),
     * `'onAction'` opens when a message is sent, `false` never auto-opens.
     * Default `'onSelect'`.
     */
    autoOpen?: 'onSelect' | 'onAction' | false;
    /** Panel: set `--dci-chat-inset` on `<html>` so your layout can make room. Default `false`. */
    pushContent?: boolean;
    /** Initial panel width in px. Default `380`. */
    panelWidth?: number;
    /** Context chips shown before "+N more". Default `6`. */
    maxChips?: number;
    /** Suggested actions shown before the overflow menu. Default `4`. */
    maxActions?: number;
    /** Override any UI text (i18n). */
    strings?: Partial<ChatStrings>;
    /** Replace sections of the default UI. */
    render?: ChatRenderers;
    /** Replace the built-in markdown renderer. Model output is untrusted: sanitize it. */
    renderMarkdown?: RenderMarkdown;
    /** Syntax-highlighting hook for code blocks. */
    highlightCode?: (code: string, lang: string) => Node;
    /** `'turn'` sends only context added since the last message; `'cumulative'` resends all. Default `'turn'`. */
    contextMode?: 'turn' | 'cumulative';
    /** Sending while a reply streams: `'block'` ignores it, `'queue'` waits. Default `'block'`. */
    concurrency?: 'block' | 'queue';
    /** Ask the user before each send: `true`, or decide per request. Default `false`. */
    confirmBeforeSend?: boolean | ((request: DciRequest) => boolean);
}
/** Overlay options (`config.overlay`). */
interface DciOverlayConfig {
    /** `'boxes'` (Shadow DOM layer) or the lightweight `'outline'`. Default `'boxes'`. */
    mode?: OverlayMode;
    /** Which boxes get a name tag. Default `'hover'`. */
    labels?: LabelMode;
}
/** Everything `createDci()` accepts. Only `endpoint` (or `transport`) is required. */
interface DciConfig {
    /** Backend URL that receives `POST` requests and answers with the SSE protocol. */
    endpoint?: string;
    /** Extra request headers, or a (possibly async) function called on every request. */
    headers?: HeadersInput | (() => MaybePromise<HeadersInput>);
    /** Custom `fetch` (auth wrapper, test double). Default: global `fetch`. */
    fetch?: typeof fetch;
    /** Request credentials mode. Default `'same-origin'`. */
    credentials?: RequestCredentials;
    /** Use your own transport instead of `endpoint` (WebSocket, AI SDK adapter, mock). */
    transport?: Transport;
    /** Only nodes inside this element count. Default `document.body`. */
    root?: Element;
    /** Attribute that marks DCI nodes. Default `'data-dci'`. */
    attribute?: string;
    /** Key that arms DCI. Default `'Alt'` (Option on macOS). */
    modifier?: ModifierKey;
    /** Remap or disable gestures and keys. */
    bindings?: BindingsConfig;
    /** Cap on selected nodes; extra ones fire `selectionlimit`. Default `50`. */
    maxSelection?: number;
    /** Include each node's ancestor chain in payloads. Default `true`. */
    includeAncestors?: boolean;
    /** `'compact'` ancestors (id/type/label) or `'full'` (with data). Default `'compact'`. */
    ancestorData?: 'compact' | 'full';
    /** Allow selecting unannotated elements (described from visible info). Default `true`. */
    fallback?: boolean;
    /** Max fallback text length. Default `500`. */
    maxTextLength?: number;
    /** Drag selects innermost (`'leaf'`) or outermost (`'top'`) nodes. Default `'leaf'`. */
    windowSelectLevel?: 'leaf' | 'top';
    /** Mod+Click on empty space clears the selection. Default `true`. */
    clearOnEmptyClick?: boolean;
    /** Let DCI clicks reach your app's handlers too. Default `false`. */
    passthroughClicks?: boolean;
    /** Gesture modules to attach. Default: all built-ins. */
    gestures?: Gesture[];
    /** Highlight overlay options, or `false` to draw your own from `hover`/`selectionchange`. */
    overlay?: DciOverlayConfig | false;
    /** `'light'`, `'dark'` or `'auto'` (follows the OS). Default `'auto'`. */
    theme?: Theme;
    /** Where the `<dci-root>` UI host is appended. Default `document.body`. */
    container?: Element;
    /** Chat options. */
    chat?: DciChatConfig;
    /** Suggested actions per node `type` (`'*'` for all), or a function of the selection. */
    actions?: ActionsConfig;
    /** Built-in client actions (`highlight`, `select`, `scrollTo`): `true`, `false` or a list. Default `true`. */
    builtinActions?: boolean | BuiltinAction[];
    /** Redact or enrich each request; return `false` to cancel it. */
    beforeSend?: (request: DciRequest) => MaybePromise<DciRequest | false>;
    /** Conversation id handling. Default: a new id per page load. */
    session?: SessionOptions;
    /** Page info sent with each request. Default: `location.href` and `document.title`. */
    page?: () => {
        url: string;
        title: string;
    };
    /** Receives custom `x-…` stream events. */
    onCustomEvent?: (event: DciEvent) => void;
}
/**
 * Defaults, in one place. Merge rules (for `createDci` and `update`): plain
 * objects merge deeply; arrays, functions, elements and `false` replace.
 */
declare const DEFAULTS: {
    readonly attribute: "data-dci";
    readonly modifier: "Alt";
    readonly maxSelection: 50;
    readonly includeAncestors: true;
    readonly ancestorData: "compact";
    readonly fallback: true;
    readonly maxTextLength: 500;
    readonly windowSelectLevel: "leaf";
    readonly clearOnEmptyClick: true;
    readonly passthroughClicks: false;
    readonly overlay: {
        readonly mode: "boxes";
        readonly labels: "hover";
    };
    readonly theme: "auto";
    readonly builtinActions: true;
    readonly chat: {
        readonly ui: true;
        readonly mode: "popover";
        readonly side: "right";
        readonly anchor: "primary";
        readonly autoOpen: "onSelect";
        readonly pushContent: false;
        readonly panelWidth: 380;
        readonly maxChips: 6;
        readonly maxActions: 4;
        readonly contextMode: "turn";
        readonly concurrency: "block";
        readonly confirmBeforeSend: false;
    };
};
/** Deep-merge `patch` over `base`: plain objects merge, everything else replaces. `undefined` is skipped. */
declare function mergeConfig<T extends object>(base: T, patch: Partial<T>): T;
interface ConfigProblems {
    /** Invalid values: `createDci` throws on these in development. */
    errors: string[];
    /** Likely mistakes (unknown keys): logged in development. */
    warnings: string[];
}
/** Check a config and describe every problem with a fix-it message. */
declare function validateConfig(config: DciConfig): ConfigProblems;

/** A node to act on: the element itself, or its `data-dci` id. */
type DciTarget = Element | string;
interface DciSelectionChange {
    /** The selection as payloads (what the backend would receive). */
    nodes: DciContextNode[];
    elements: Element[];
    added: Element[];
    removed: Element[];
    primary: Element | null;
}
/** Events for `dci.on(name, fn)`. */
interface DciEvents {
    selectionchange: DciSelectionChange;
    selectionlimit: SelectionLimit;
    hover: InteractionEvents['hover'];
    chatopen: undefined;
    chatclose: undefined;
    /** A user message was sent, or an assistant reply finished (done, error or stop). */
    message: ChatMessage;
    actionerror: ActionError;
    sessionchange: SessionChange;
}
interface DciSelectionApi {
    /** The selection as payloads, in selection order. */
    get(): DciContextNode[];
    elements(): Element[];
    primary(): Element | null;
    set(targets: DciTarget | Iterable<DciTarget>): void;
    add(targets: DciTarget | Iterable<DciTarget>): void;
    remove(targets: DciTarget | Iterable<DciTarget>): void;
    toggle(target: DciTarget): void;
    has(target: DciTarget): boolean;
    clear(): void;
    /** Select every same-type sibling of `node` (default: the primary node). */
    selectSameType(node?: DciTarget | null, options?: SelectSameTypeOptions): Element[];
    /** Same as `get()`. */
    toContext(): DciContextNode[];
}
interface DciChatApi {
    open(): void;
    close(): void;
    /** Send `prompt` (default: the draft). Resolves `false` when nothing was sent. */
    send(prompt?: string, options?: SendOptions): Promise<boolean>;
    stop(): void;
    retry(): Promise<boolean>;
    state(): ChatState;
    subscribe(fn: (state: ChatState) => void): () => void;
    /** The headless controller, for custom UIs. */
    readonly controller: ChatController;
}
interface DciInstance {
    readonly selection: DciSelectionApi;
    readonly chat: DciChatApi;
    readonly session: Session;
    /** The resolved config (defaults merged in). */
    readonly config: Readonly<DciConfig>;
    readonly tree: DciTree;
    /** Handle a `client-action` from the backend. Returns an unsubscribe function. */
    onAction(name: string, handler: ActionHandler): () => void;
    on<K extends keyof DciEvents>(type: K, fn: (event: DciEvents[K]) => void): () => void;
    /** Change options at runtime; only the affected parts are rebuilt. */
    update(patch: DciConfig): void;
    /** Detach gestures and the chat UI (the selection and conversation are kept). */
    disable(): void;
    enable(): void;
    isEnabled(): boolean;
    /** The exact request the next send would make (after `beforeSend`), or `false`. */
    previewRequest(prompt?: string, options?: SendOptions): Promise<DciRequest | false>;
    destroy(): void;
}
/**
 * One call that wires everything together: parser, tree, selection,
 * gestures, overlay, chat controller and UI, transport, session and client
 * actions. Every piece is also exported on its own for custom setups.
 */
declare function createDci(input: DciConfig): DciInstance;

/** Package version. */
declare const VERSION = "0.0.0";

export { AUTOSCROLL_EDGE, AUTOSCROLL_SPEED, type ActionContext, type ActionError, type ActionHandler, type ActionRegistry, type ActionRegistryOptions, type ActionsConfig, type AnchorTo, type Anchoring, type ArmedEventMap, type ArmedEventType, BASE_CSS, BUILTIN_ACTIONS, type Bindings, type BindingsConfig, type BuiltinAction, CHAT_CSS, type Candidate, type ChatController, type ChatControllerOptions, type ChatMessage, type ChatMode, type ChatRenderers, type ChatState, type ChatStatus, type ChatStrings, type ChatUi, type ChatUiApi, type ChatUiOptions, type ConfigProblems, type ContextOptions, DCI_UI_ATTRIBUTE, DEFAULTS, DEFAULT_ATTRIBUTE, DEFAULT_BINDINGS, DEFAULT_GESTURES, DEFAULT_KEYBOARD_BINDINGS, DEFAULT_STRINGS, DRAG_THRESHOLD, type DciAttrValue, type DciChatApi, type DciChatConfig, type DciConfig, type DciEvents, type DciInstance, type DciOverlayConfig, type DciSelectionApi, type DciSelectionChange, type DciTarget, type DciTree, type Emitter, type Gesture, type GestureContext, type GestureResult, HOST_TAG, type HoverState, type InputManager, type InputOptions, type InteractionEvents, type InteractionOptions, type Interactions, type KeyboardBindings, type LabelMode, type LayerName, type MarkdownOptions, type MarqueeMode, type ModifierKey, OVERLAY_CSS, type Overlay, type OverlayConfig, type OverlayMode, type OverlayOptions, type ParseOptions, type ParsedDci, type Rect, type RenderMarkdown, type SSETransportOptions, type SelectSameTypeOptions, type SelectionChange, type SelectionEvents, type SelectionLimit, type SelectionOptions, type SelectionStore, type SendOptions, type Session, type SessionChange, type SessionOptions, type SuggestedAction, type Theme, type ToolStatus, type Transport, type TreeOptions, type UiHost, type UiHostOptions, VERSION, WHEEL_STEP, type Warn, acquireUiHost, anchorFloating, announceGesture, clickGesture, collectCandidates, contains, createActionRegistry, createAnnouncer, createChatController, createChatUi, createDci, createDciTree, createEmitter, createHoverState, createInputManager, createInteractions, createOutlineOverlay, createOverlay, createSSETransport, createSelectionStore, createSession, cssPath, dciAttr, describeNode, eventTarget, hasModifier, hitTest, hoverGesture, intersects, isDciElement, isEditable, isFromDciUi, keyboardGesture, labelFor, marqueeGesture, marqueeMode, matchesCombo, mergeConfig, nodeName, offsetRect, overlayGesture, parseDciAttribute, randomId, readDci, rectFromPoints, renderInline, renderMarkdown, resolveActions, resolveBindings, resolveStrings, resolveTarget, safeUrl, sameTypeGesture, sameTypeNodes, selectSameType, stableStringify, toContextNode, truncateText, unionRect, validateConfig, wheelGesture, wheelPixels };
