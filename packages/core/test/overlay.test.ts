import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteractions, type Interactions } from '../src/interactions';
import { createOverlay, OVERLAY_CSS, type Overlay } from '../src/overlay';
import { acquireUiHost, type UiHost } from '../src/ui-host';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

const RECTS: Record<string, [number, number, number, number]> = {};
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const [left, top, right, bottom] = RECTS[this.id] ?? [0, 0, 0, 0];
    return {
      left,
      top,
      right,
      bottom,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(RECTS)) delete RECTS[k];
});

describe('UI host', () => {
  it('mounts without a custom element registry (extension content scripts)', () => {
    vi.stubGlobal('customElements', null);
    try {
      const { host, release } = acquireUiHost();
      expect(host.shadow.mode).toBe('open');
      release();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('mounts one <dci-root> with an open shadow root and layers', () => {
    const { host, release } = acquireUiHost();
    const el = document.querySelector('dci-root')!;
    expect(el).toBe(host.element);
    expect(el.hasAttribute('data-dci-ui')).toBe(true);
    expect(el.getAttribute('data-theme')).toBe('auto');
    expect(host.shadow.mode).toBe('open');
    expect(
      [...host.shadow.querySelectorAll('[data-layer]')].map((l) => l.getAttribute('data-layer')),
    ).toEqual(['overlay', 'chat', 'live-region']);
    // The overlay is decorative; announcements go through the live region.
    expect(host.layer('overlay').getAttribute('aria-hidden')).toBe('true');
    expect(host.layer('chat').hasAttribute('aria-hidden')).toBe(false);
    release();
    expect(document.querySelector('dci-root')).toBeNull();
  });

  it('is shared and reference counted', () => {
    const a = acquireUiHost();
    const b = acquireUiHost({ theme: 'dark' });
    expect(a.host).toBe(b.host);
    expect(document.querySelectorAll('dci-root')).toHaveLength(1);
    expect(a.host.element.getAttribute('data-theme')).toBe('dark');
    a.release();
    a.release(); // idempotent
    expect(document.querySelector('dci-root')).not.toBeNull();
    b.release();
    expect(document.querySelector('dci-root')).toBeNull();
  });

  it('mounts into a custom container', () => {
    const f = mountFixture(`<div id="c"></div>`);
    const { host, release } = acquireUiHost({ container: f.get('#c') });
    expect(host.element.parentElement).toBe(f.get('#c'));
    release();
  });

  it('adds and removes stylesheets', () => {
    const { host, release } = acquireUiHost();
    const count = () =>
      host.shadow.adoptedStyleSheets.length + host.shadow.querySelectorAll('style').length;
    const before = count();
    const remove = host.addStyles('.x { color: red }');
    expect(count()).toBe(before + 1);
    remove();
    expect(count()).toBe(before);
    release();
  });
});

describe('overlay', () => {
  let ui: { host: UiHost; release: () => void };
  let overlay: Overlay;
  beforeEach(() => {
    ui = acquireUiHost();
  });
  afterEach(() => {
    overlay?.destroy();
    ui.release();
  });

  const boxes = () =>
    [...ui.host.shadow.querySelectorAll<HTMLElement>('.box')].filter(
      (b) => b.style.display === 'block',
    );
  const edges = () =>
    [...ui.host.shadow.querySelectorAll<HTMLElement>('.edge')].filter(
      (b) => b.style.display === 'block',
    );

  function mount(html: string, rects: typeof RECTS, options = {}) {
    Object.assign(RECTS, rects);
    const f = mountFixture(html);
    overlay = createOverlay(ui.host, { root: f.root, ...options });
    return f;
  }

  it('draws a dashed hover box at the target rect with a depth label', async () => {
    const f = mount(`<div id="a" data-dci='{"label":"Invoice #1"}'></div>`, {
      a: [10, 40, 110, 90],
    });
    overlay.setHover(f.get('#a'), { depth: 1 });
    await frame();
    const [box] = boxes();
    expect(box!.className).toBe('box hover');
    expect(box!.style.transform).toBe('translate(10px, 40px)');
    expect([box!.style.width, box!.style.height]).toEqual(['100px', '50px']);
    expect(box!.querySelector('.label')?.textContent).toBe('Invoice #1 ▲1');
  });

  it('draws selected boxes with a thicker primary and labels only hover/primary', async () => {
    const f = mount(
      `<i id="a" data-dci='{"type":"row"}'></i><i id="b" data-dci='{"type":"row"}'></i>`,
      { a: [0, 30, 10, 40], b: [0, 50, 10, 60] },
    );
    overlay.setSelected([f.get('#a'), f.get('#b')], f.get('#a'));
    await frame();
    expect(boxes().map((b) => b.className)).toEqual(['box selected primary', 'box selected']);
    expect(boxes().map((b) => b.querySelector('.label')?.textContent ?? null)).toEqual([
      'row',
      null,
    ]);
  });

  it("labels every selected box with labels: 'all' and none with 'none'", async () => {
    const f = mount(`<i id="a" data-dci="a"></i><i id="b" data-dci="b"></i>`, {
      a: [0, 30, 10, 40],
      b: [0, 50, 10, 60],
    });
    overlay.destroy();
    overlay = createOverlay(ui.host, { labels: 'all' });
    overlay.setSelected([f.get('#a'), f.get('#b')]);
    await frame();
    expect(boxes().map((b) => b.querySelector('.label')?.textContent)).toEqual(['i', 'i']);
    overlay.destroy();
    overlay = createOverlay(ui.host, { labels: 'none' });
    overlay.setSelected([f.get('#a')]);
    overlay.setHover(f.get('#b'));
    await frame();
    expect(boxes().every((b) => !b.querySelector('.label'))).toBe(true);
  });

  it('flips the label inside the box at the top edge of the viewport', async () => {
    const f = mount(`<i id="a" data-dci="a"></i>`, { a: [0, 5, 100, 50] });
    overlay.setHover(f.get('#a'));
    await frame();
    expect(boxes()[0]!.querySelector('.label')!.className).toBe('label inside');
  });

  it('draws preview boxes', async () => {
    const f = mount(`<i id="a"></i><i id="b"></i>`, { a: [0, 0, 5, 5], b: [5, 5, 9, 9] });
    overlay.setPreview([f.get('#a'), f.get('#b')]);
    await frame();
    expect(boxes().map((b) => b.className)).toEqual(['box preview', 'box preview']);
  });

  it('hides boxes for hidden or detached targets', async () => {
    const f = mount(`<i id="a"></i><i id="gone"></i>`, { gone: [0, 0, 5, 5] });
    const gone = f.get('#gone');
    gone.remove();
    overlay.setSelected([f.get('#a'), gone]); // #a has a zero rect, like display: none
    await frame();
    expect(boxes()).toHaveLength(0);
    expect(edges()).toHaveLength(0);
  });

  it('shows an edge indicator for selected nodes scrolled out of view', async () => {
    const f = mount(`<i id="below"></i><i id="above"></i>`, {
      below: [100, 5000, 200, 5050],
      above: [100, -500, 200, -450],
    });
    overlay.setSelected([f.get('#below'), f.get('#above')]);
    overlay.setHover(f.get('#below'));
    await frame();
    expect(boxes()).toHaveLength(0);
    expect(edges().map((e) => e.style.transform)).toEqual([
      `translate(150px, ${innerHeight - 8}px)`,
      'translate(150px, 8px)',
    ]);
  });

  it('clips boxes to scrollable ancestors so they are not drawn over other content', async () => {
    const f = mount(`<div id="scroller" style="overflow: auto"><div id="row"></div></div>`, {
      scroller: [0, 100, 300, 200],
      row: [0, 150, 300, 260],
    });
    overlay.setSelected([f.get('#row')]);
    await frame();
    const [box] = boxes();
    expect(box!.style.transform).toBe('translate(0px, 150px)');
    expect(box!.style.height).toBe('50px');
  });

  it('reuses pooled box nodes', async () => {
    const f = mount(`<i id="a"></i><i id="b"></i><i id="c"></i>`, {
      a: [0, 30, 5, 35],
      b: [0, 40, 5, 45],
      c: [0, 50, 5, 55],
    });
    overlay.setSelected([f.get('#a'), f.get('#b'), f.get('#c')]);
    await frame();
    const nodes = [...ui.host.shadow.querySelectorAll('.box')];
    overlay.setSelected([f.get('#b')]);
    await frame();
    expect([...ui.host.shadow.querySelectorAll('.box')]).toEqual(nodes);
    expect(boxes()).toHaveLength(1);
  });

  it('draws the marquee solid for contain and dashed for touch', async () => {
    mount(`<i></i>`, {});
    const marquee = ui.host.shadow.querySelector<HTMLElement>('.marquee')!;
    overlay.setMarquee({ rect: { left: 1, top: 2, right: 11, bottom: 22 }, mode: 'contain' });
    expect(marquee.className).toBe('marquee contain');
    expect(marquee.style.transform).toBe('translate(1px, 2px)');
    expect([marquee.style.width, marquee.style.height]).toEqual(['10px', '20px']);
    overlay.setMarquee({ rect: { left: 1, top: 2, right: 11, bottom: 22 }, mode: 'touch' });
    expect(marquee.className).toBe('marquee touch');
    expect(OVERLAY_CSS).toMatch(/\.marquee\.touch\s*\{\s*border-style: dashed/);
    overlay.setMarquee(null);
    expect(marquee.style.display).toBe('none');
  });

  it('shakes the primary box on boundary and disables animations for reduced motion', async () => {
    const f = mount(`<i id="a" data-dci="a"></i>`, { a: [0, 30, 10, 40] });
    overlay.setSelected([f.get('#a')]);
    await frame();
    overlay.boundary();
    expect(boxes()[0]!.classList.contains('shake')).toBe(true);
    expect(OVERLAY_CSS).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });

  it('flashes a target temporarily', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const f = mount(`<i id="a"></i>`, { a: [0, 30, 10, 40] });
    overlay.flash(f.get('#a'));
    await frame();
    expect(boxes()[0]!.className).toBe('box flash');
    vi.advanceTimersByTime(1500);
    await frame();
    expect(boxes()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('has no listeners or observers while nothing is shown', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const f = mount(`<i id="a"></i>`, { a: [0, 30, 10, 40] });
    await frame();
    expect(add).not.toHaveBeenCalledWith('scroll', expect.anything(), expect.anything());
    expect(observe).not.toHaveBeenCalled();

    overlay.setSelected([f.get('#a')]);
    await frame();
    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), {
      capture: true,
      passive: true,
    });
    expect(observe).toHaveBeenCalledOnce();

    overlay.setSelected([]);
    await frame();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), { capture: true });
    expect(disconnect).toHaveBeenCalled();
  });

  it('re-renders on scroll', async () => {
    const f = mount(`<i id="a"></i>`, { a: [0, 30, 10, 40] });
    overlay.setSelected([f.get('#a')]);
    await frame();
    RECTS.a = [0, 10, 10, 20];
    window.dispatchEvent(new Event('scroll'));
    await frame();
    expect(boxes()[0]!.style.transform).toBe('translate(0px, 10px)');
  });

  it('removes every node it created on destroy', async () => {
    const f = mount(`<i id="a"></i>`, { a: [0, 30, 10, 40] });
    overlay.setSelected([f.get('#a')]);
    await frame();
    overlay.destroy();
    expect(ui.host.layer('overlay').childElementCount).toBe(0);
  });
});

describe('outline mode', () => {
  let ui: { host: UiHost; release: () => void };
  beforeEach(() => {
    ui = acquireUiHost();
  });
  afterEach(() => ui.release());

  /** Every inline declaration as `prop: value [!important]`, order-independent. */
  const snapshot = (el: HTMLElement) =>
    Array.from(el.style)
      .map((p) => `${p}: ${el.style.getPropertyValue(p)} ${el.style.getPropertyPriority(p)}`.trim())
      .sort();

  it('restores the original inline styles exactly', () => {
    const f = mountFixture(`
      <div id="plain"></div>
      <div id="styled" style="outline: 1px solid green !important; outline-offset: 4px; color: red"></div>`);
    const overlay = createOverlay(ui.host, { mode: 'outline' });
    const plain = f.get('#plain');
    const styled = f.get('#styled');
    const before = snapshot(styled);

    overlay.setSelected([plain, styled], styled);
    overlay.setHover(plain);
    expect(plain.style.getPropertyValue('outline-style')).toBe('dashed');
    expect(styled.style.getPropertyValue('outline-width')).toBe('3px');
    expect(styled.style.getPropertyValue('outline-offset')).toBe('2px');

    overlay.setHover(null);
    expect(plain.style.getPropertyValue('outline-style')).toBe('solid');
    overlay.setSelected([]);
    expect(plain.hasAttribute('style')).toBe(false);
    expect(snapshot(styled)).toEqual(before);
    expect(before).toContain('outline-offset: 4px');
    expect(before).toContain('outline-style: solid important');
    overlay.destroy();
  });

  it('draws no boxes and no labels', () => {
    const f = mountFixture(`<div id="a" data-dci='{"label":"A"}'></div>`);
    const overlay = createOverlay(ui.host, { mode: 'outline' });
    overlay.setHover(f.get('#a'));
    expect(ui.host.shadow.querySelectorAll('.box, .label')).toHaveLength(0);
    overlay.destroy();
    expect(f.get('#a').getAttribute('style') || null).toBeNull();
  });
});

describe('overlay wired to interactions', () => {
  let dci: Interactions | undefined;
  afterEach(() => {
    dci?.destroy();
    dci = undefined;
  });

  it('draws the selection made with Alt+Click and cleans up on destroy', async () => {
    RECTS.row = [20, 100, 400, 140];
    const f = mountFixture(
      `<table><tbody><tr id="row" data-dci='{"label":"Row 1"}'><td id="cell">x</td></tr></tbody></table>`,
    );
    dci = createInteractions({ root: f.root });
    fakeKey('Alt', { altKey: true });
    fakePointer(f.get('#cell'), { altKey: true });
    await new Promise((r) => setTimeout(r, 0));
    await frame();
    const shadow = document.querySelector('dci-root')!.shadowRoot!;
    const box = [...shadow.querySelectorAll<HTMLElement>('.box')].find(
      (b) => b.style.display === 'block',
    );
    expect(box?.className).toBe('box selected primary');
    expect(box?.style.transform).toBe('translate(20px, 100px)');
    expect(box?.querySelector('.label')?.textContent).toBe('Row 1');
    dci.destroy();
    dci = undefined;
    expect(document.querySelector('dci-root')).toBeNull();
  });

  it('can be turned off', () => {
    dci = createInteractions({ overlay: false, gestures: [] });
    expect(document.querySelector('dci-root')).toBeNull();
  });
});
