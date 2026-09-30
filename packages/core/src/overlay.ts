import type { Rect } from './interactions';
import { readDci, toSource, type AnnotationSource, type InferAnnotation } from './parse';
import type { UiHost } from './ui-host';

export type OverlayMode = 'boxes' | 'outline';
export type LabelMode = 'hover' | 'all' | 'none';

export interface OverlayOptions {
  /** `'boxes'` (default) draws in the shadow layer; `'outline'` styles targets inline. */
  mode?: OverlayMode;
  /** Which boxes get a name tag. Default `'hover'` (hover and primary). */
  labels?: LabelMode;
  /** Attribute used to read labels. Default `data-dci`. */
  attribute?: string;
  /** Inferred annotations, for labels of unannotated nodes. */
  infer?: InferAnnotation;
  /** Observed for layout changes while boxes are shown. Default `document.body`. */
  root?: Element;
}

export interface Overlay {
  /** Hover target; `depth` is the Mod+Wheel offset shown in the label (`▲1`). */
  setHover(el: Element | null, meta?: { depth?: number }): void;
  setSelected(els: Element[], primary?: Element | null): void;
  /** Window-select candidates before release. */
  setPreview(els: Element[]): void;
  setMarquee(marquee: { rect: Rect; mode: 'contain' | 'touch' } | null): void;
  /** Short shake on the primary box (keyboard hit an edge of the tree). */
  boundary(): void;
  /** Attention pulse, e.g. for the `highlight` client action. */
  flash(el: Element): void;
  destroy(): void;
}

export const OVERLAY_CSS = `
.box {
  position: fixed; left: 0; top: 0; display: none;
  border-radius: var(--dci-radius);
  will-change: transform;
}
.box.hover { border: 2px dashed var(--dci-hover); }
.box.selected {
  border: 2px solid var(--dci-selected);
  background: color-mix(in srgb, var(--dci-selected) 12%, transparent);
}
.box.primary { border-width: 3px; }
.box.preview {
  border: 1px solid var(--dci-preview);
  background: color-mix(in srgb, var(--dci-preview) 10%, transparent);
}
.box.flash { border: 3px solid var(--dci-accent); animation: dci-pulse 0.7s ease-out 2; }
.box.shake { animation: dci-shake 0.3s ease-in-out; }
.label {
  position: absolute; left: -2px; bottom: 100%;
  max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 1px 6px; border-radius: 4px 4px 0 0;
  font: 600 11px/16px var(--dci-font, system-ui, sans-serif);
  color: #fff; background: var(--dci-accent);
}
.box.hover .label { background: var(--dci-hover); }
.label.inside { top: 0; bottom: auto; left: 0; border-radius: 0 0 4px 0; }
.edge {
  position: fixed; left: 0; top: 0; display: none; width: 10px; height: 10px;
  margin: -5px 0 0 -5px; border-radius: 50%;
  background: var(--dci-selected); box-shadow: 0 0 0 2px var(--dci-bg);
}
.marquee {
  position: fixed; left: 0; top: 0; display: none;
  border: 1px solid var(--dci-accent);
  background: color-mix(in srgb, var(--dci-accent) 8%, transparent);
}
.marquee.touch { border-style: dashed; }
@keyframes dci-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dci-accent) 60%, transparent); }
  100% { box-shadow: 0 0 0 12px transparent; }
}
@keyframes dci-shake {
  0%, 100% { translate: 0; }
  25% { translate: -4px; }
  75% { translate: 4px; }
}
@media (prefers-reduced-motion: reduce) {
  .box, .box.flash, .box.shake { animation: none !important; }
}
`;

const LABEL_HEIGHT = 18;
const EDGE_INSET = 8;

/** Name shown in labels: `label ?? type ?? tagName`. */
export function labelFor(el: Element, source?: string | AnnotationSource): string {
  const parsed = readDci(el, toSource(source));
  return parsed?.label ?? parsed?.type ?? el.tagName.toLowerCase();
}

function intersect(a: Rect, b: Rect): Rect | null {
  const r = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return r.right > r.left && r.bottom > r.top ? r : null;
}

function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.parentNode;
  return root instanceof ShadowRoot ? root.host : null;
}

const CLIPPING = new Set(['hidden', 'auto', 'scroll', 'clip']);

/**
 * Ancestors that clip their content. `<body>` and `<html>` are skipped:
 * their `overflow` applies to the viewport, which is handled separately.
 */
function clippingAncestors(el: Element): Element[] {
  const out: Element[] = [];
  for (let cur = composedParent(el); cur; cur = composedParent(cur)) {
    if (cur === document.body || cur === document.documentElement) break;
    const { overflow, overflowX, overflowY } = getComputedStyle(cur);
    const values = `${overflow} ${overflowX} ${overflowY}`.split(' ');
    if (values.some((v) => CLIPPING.has(v))) out.push(cur);
  }
  return out;
}

type Role = 'hover' | 'selected' | 'primary' | 'preview' | 'flash';

interface Target {
  el: Element;
  roles: Role[];
  label: string | null;
}

/**
 * Draws hover, selected, primary and preview boxes in the host's overlay
 * layer. Boxes are `position: fixed`, moved with `transform`, and updated in
 * one animation-frame pass (read every rect, then write every box). Listeners
 * and observers exist only while something is shown.
 */
export function createOverlay(host: UiHost, options: OverlayOptions = {}): Overlay {
  if (options.mode === 'outline') return createOutlineOverlay(host, options);
  const labels = options.labels ?? 'hover';
  const layer = host.layer('overlay');
  const removeStyles = host.addStyles(OVERLAY_CSS);

  let hover: Element | null = null;
  let hoverDepth = 0;
  let selected: Element[] = [];
  let primary: Element | null = null;
  let preview: Element[] = [];
  const flashing = new Set<Element>();

  const boxPool: HTMLElement[] = [];
  const edgePool: HTMLElement[] = [];
  const marquee = document.createElement('div');
  marquee.className = 'marquee';
  layer.appendChild(marquee);

  /** Box currently drawn for each target, rebuilt every frame. */
  const boxFor = new Map<Element, HTMLElement>();
  const clipCache = new WeakMap<Element, Element[]>();
  const clipsFor = (el: Element) => {
    let clips = clipCache.get(el);
    if (!clips) clipCache.set(el, (clips = clippingAncestors(el)));
    return clips;
  };

  function poolItem(pool: HTMLElement[], i: number, className: string): HTMLElement {
    let el = pool[i];
    if (!el) {
      el = document.createElement('div');
      el.className = className;
      layer.appendChild(el);
      pool.push(el);
    }
    return el;
  }

  function targets(): Target[] {
    const byEl = new Map<Element, Target>();
    const add = (el: Element, role: Role) => {
      let t = byEl.get(el);
      if (!t) byEl.set(el, (t = { el, roles: [], label: null }));
      t.roles.push(role);
    };
    for (const el of preview) add(el, 'preview');
    for (const el of selected) {
      add(el, 'selected');
      if (el === primary) add(el, 'primary');
    }
    for (const el of flashing) add(el, 'flash');
    if (hover) add(hover, 'hover');
    const out = [...byEl.values()];
    for (const t of out) {
      const showLabel =
        labels === 'all'
          ? t.roles.some((r) => r !== 'preview' && r !== 'flash')
          : labels === 'hover' && (t.roles.includes('hover') || t.roles.includes('primary'));
      if (showLabel) {
        const depth = t.roles.includes('hover') && hoverDepth ? ` ▲${hoverDepth}` : '';
        t.label = labelFor(t.el, options) + depth;
      }
    }
    return out;
  }

  // --- rendering -----------------------------------------------------------

  let frame = 0;
  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    const list = targets();
    const viewport: Rect = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };

    // Read phase: every rect first, so layout is computed once.
    const measured = list.map((t) => {
      if (!t.el.isConnected) return null;
      const r = t.el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null; // display: none
      const full: Rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      let visible: Rect | null = intersect(full, viewport);
      for (const clip of clipsFor(t.el)) {
        if (!visible) break;
        const c = clip.getBoundingClientRect();
        visible = intersect(visible, {
          left: c.left,
          top: c.top,
          right: c.right,
          bottom: c.bottom,
        });
      }
      return { full, visible };
    });

    // Write phase.
    boxFor.clear();
    let boxes = 0;
    let edges = 0;
    list.forEach((t, i) => {
      const m = measured[i];
      if (!m) return;
      if (!m.visible) {
        const isSelected = t.roles.includes('selected') || t.roles.includes('primary');
        if (isSelected) {
          const cx = Math.min(
            Math.max((m.full.left + m.full.right) / 2, EDGE_INSET),
            viewport.right - EDGE_INSET,
          );
          const cy = Math.min(
            Math.max((m.full.top + m.full.bottom) / 2, EDGE_INSET),
            viewport.bottom - EDGE_INSET,
          );
          const edge = poolItem(edgePool, edges++, 'edge');
          edge.style.display = 'block';
          edge.style.transform = `translate(${cx}px, ${cy}px)`;
        }
        return;
      }
      const box = poolItem(boxPool, boxes++, 'box');
      boxFor.set(t.el, box);
      const shaking = box.classList.contains('shake');
      box.className = `box ${t.roles.join(' ')}${shaking ? ' shake' : ''}`;
      const { left, top, right, bottom } = m.visible;
      box.style.display = 'block';
      box.style.width = `${right - left}px`;
      box.style.height = `${bottom - top}px`;
      box.style.transform = `translate(${left}px, ${top}px)`;
      let label = box.firstElementChild as HTMLElement | null;
      if (t.label) {
        if (!label) {
          label = document.createElement('span');
          box.appendChild(label);
        }
        label.className = top < LABEL_HEIGHT ? 'label inside' : 'label';
        label.textContent = t.label;
      } else label?.remove();
    });
    for (let i = boxes; i < boxPool.length; i++) boxPool[i]!.style.display = 'none';
    for (let i = edges; i < edgePool.length; i++) edgePool[i]!.style.display = 'none';
    syncTracking(list.map((t) => t.el));
  }

  // --- tracking --------------------------------------------------------------

  let tracking = false;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  const observed = new Set<Element>();
  const onChange = () => schedule();
  const onMutation = () => {
    // Structure or styles changed: clip ancestors may differ now.
    observed.forEach((el) => clipCache.delete(el));
    schedule();
  };

  function syncTracking(els: Element[]) {
    const active = els.length > 0 || marquee.style.display === 'block';
    if (active && !tracking) {
      tracking = true;
      addEventListener('scroll', onChange, { capture: true, passive: true });
      addEventListener('resize', onChange, { passive: true });
      if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(onChange);
      mutationObserver = new MutationObserver(onMutation);
      mutationObserver.observe(options.root ?? document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
      });
    } else if (!active && tracking) {
      tracking = false;
      removeEventListener('scroll', onChange, { capture: true });
      removeEventListener('resize', onChange);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      resizeObserver = mutationObserver = null;
      observed.clear();
      return;
    }
    if (!resizeObserver) {
      observed.clear();
      els.forEach((el) => observed.add(el));
      return;
    }
    const next = new Set(els);
    for (const el of observed) if (!next.has(el)) resizeObserver.unobserve(el);
    for (const el of next) if (!observed.has(el)) resizeObserver.observe(el);
    observed.clear();
    next.forEach((el) => observed.add(el));
  }

  return {
    setHover(el, meta) {
      hover = el;
      hoverDepth = meta?.depth ?? 0;
      schedule();
    },
    setSelected(els, nextPrimary = null) {
      selected = els.slice();
      primary = nextPrimary ?? els[els.length - 1] ?? null;
      schedule();
    },
    setPreview(els) {
      preview = els.slice();
      schedule();
    },
    setMarquee(m) {
      if (!m) marquee.style.display = 'none';
      else {
        const { left, top, right, bottom } = m.rect;
        marquee.className = `marquee ${m.mode}`;
        marquee.style.display = 'block';
        marquee.style.width = `${right - left}px`;
        marquee.style.height = `${bottom - top}px`;
        marquee.style.transform = `translate(${left}px, ${top}px)`;
      }
      schedule();
    },
    boundary() {
      if (!primary) return;
      const box = boxFor.get(primary);
      if (!box) return;
      box.classList.remove('shake');
      void box.offsetWidth; // restart the animation
      box.classList.add('shake');
      setTimeout(() => box.classList.remove('shake'), 350);
    },
    flash(el) {
      flashing.add(el);
      schedule();
      setTimeout(() => {
        flashing.delete(el);
        schedule();
      }, 1400);
    },
    destroy() {
      cancelAnimationFrame(frame);
      hover = primary = null;
      selected = preview = [];
      flashing.clear();
      marquee.style.display = 'none';
      syncTracking([]);
      [...boxPool, ...edgePool, marquee].forEach((el) => el.remove());
      removeStyles();
    },
  };
}

// --- outline mode --------------------------------------------------------------

/** Inline properties outline mode sets; saved with their priority and restored exactly. */
const OUTLINE_PROPS = ['outline-width', 'outline-style', 'outline-color', 'outline-offset'];

interface SavedStyle {
  hadStyle: boolean;
  props: Array<[value: string, priority: string]>;
}

/**
 * Lightweight mode: sets `outline` inline on targets and restores the exact
 * previous inline values afterwards. Trade-offs: outlines can be clipped by
 * `overflow: hidden`, it mutates host styles, and it has no labels. The
 * marquee is still drawn in the overlay layer.
 */
export function createOutlineOverlay(host: UiHost, _options: OverlayOptions = {}): Overlay {
  const layer = host.layer('overlay');
  const removeStyles = host.addStyles(OVERLAY_CSS);
  const marquee = document.createElement('div');
  marquee.className = 'marquee';
  layer.appendChild(marquee);

  const saved = new Map<HTMLElement | SVGElement, SavedStyle>();
  let hover: Element | null = null;
  let selected: Element[] = [];
  let primary: Element | null = null;
  let preview: Element[] = [];

  const styled = (el: Element) =>
    el instanceof HTMLElement || el instanceof SVGElement ? el : null;

  function apply() {
    const wanted = new Map<HTMLElement | SVGElement, string[]>();
    const want = (el: Element | null, value: string[]) => {
      const s = el && styled(el);
      if (s && !wanted.has(s)) wanted.set(s, value);
    };
    // Earlier entries win: hover, then primary, selected, preview.
    want(hover, ['2px', 'dashed', 'var(--dci-hover, #2563eb)', '2px']);
    want(primary, ['3px', 'solid', 'var(--dci-selected, #2563eb)', '2px']);
    selected.forEach((el) => want(el, ['2px', 'solid', 'var(--dci-selected, #2563eb)', '2px']));
    preview.forEach((el) => want(el, ['1px', 'dotted', 'var(--dci-preview, #7c3aed)', '2px']));

    for (const [el, prev] of saved) {
      if (wanted.has(el)) continue;
      OUTLINE_PROPS.forEach((prop, i) => {
        const [value, priority] = prev.props[i]!;
        if (value) el.style.setProperty(prop, value, priority);
        else el.style.removeProperty(prop);
      });
      if (!prev.hadStyle && !el.getAttribute('style')) el.removeAttribute('style');
      saved.delete(el);
    }
    for (const [el, values] of wanted) {
      if (!saved.has(el)) {
        saved.set(el, {
          hadStyle: el.hasAttribute('style'),
          props: OUTLINE_PROPS.map((p) => [
            el.style.getPropertyValue(p),
            el.style.getPropertyPriority(p),
          ]),
        });
      }
      OUTLINE_PROPS.forEach((prop, i) => el.style.setProperty(prop, values[i]!, 'important'));
    }
  }

  return {
    setHover(el) {
      hover = el;
      apply();
    },
    setSelected(els, nextPrimary = null) {
      selected = els.slice();
      primary = nextPrimary ?? els[els.length - 1] ?? null;
      apply();
    },
    setPreview(els) {
      preview = els.slice();
      apply();
    },
    setMarquee(m) {
      if (!m) {
        marquee.style.display = 'none';
        return;
      }
      const { left, top, right, bottom } = m.rect;
      marquee.className = `marquee ${m.mode}`;
      marquee.style.display = 'block';
      marquee.style.width = `${right - left}px`;
      marquee.style.height = `${bottom - top}px`;
      marquee.style.transform = `translate(${left}px, ${top}px)`;
    },
    boundary() {},
    flash() {},
    destroy() {
      hover = primary = null;
      selected = preview = [];
      apply();
      marquee.remove();
      removeStyles();
    },
  };
}
