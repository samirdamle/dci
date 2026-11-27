import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextPill, type TextSelectionPlumbing } from '../src/text-pill';
import { makeTextItem, type FakeTextItem } from './text-test-utils';
import { mountFixture } from './test-utils';

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const tick = () => new Promise((r) => setTimeout(r, 0));

function stubRect(range: Range, rect: Partial<DOMRect> = {}) {
  const full = {
    left: 100,
    top: 100,
    right: 300,
    bottom: 130,
    width: 200,
    height: 30,
    x: 100,
    y: 100,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  range.getBoundingClientRect = () => full;
  range.getClientRects = () => [full] as unknown as DOMRectList;
}

function plumbingFor(item: FakeTextItem | null, opts: Partial<TextSelectionPlumbing> = {}) {
  let open = false;
  const opened: boolean[] = [];
  const plumbing: TextSelectionPlumbing = {
    enabled: true,
    maxLength: 2000,
    actionLabel: 'Ask about this',
    getLiveItem: () => item,
    hasLiveRange: () => item !== null,
    captureLive: () => item,
    addItem: () => true,
    isChatOpen: () => open,
    openChat: () => {
      open = true;
      opened.push(true);
    },
    ...opts,
  };
  return { plumbing, opened, setOpen: (v: boolean) => (open = v) };
}

function pillButton() {
  return (
    document
      .querySelector('dci-root')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('.text-pill') ?? null
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('text pill', () => {
  it('shows above the range with the action label, and hides when the range goes away', async () => {
    const f = mountFixture('<p id="p">Q3 focus: convert Proposal-stage deals before winter.</p>');
    const item = makeTextItem(f.get('#p'), 'convert Proposal-stage');
    stubRect(item.range);
    const { plumbing } = plumbingFor(item);
    const pill = createTextPill({ plumbing });
    pill.refresh();
    await frame();
    const btn = pillButton();
    expect(btn?.getAttribute('data-visible')).toBe('true');
    expect(btn?.textContent).toBe('Ask about this');
    expect(btn?.getAttribute('aria-label')).toBe('Ask about this selection');
    expect(btn?.title).toContain('convert Proposal-stage');
    expect(btn?.title).toContain('characters');
    expect(btn?.style.top).toBe('60px'); // 100 - 32 - 8
    expect(pill.visible).toBe(true);
    plumbing.getLiveItem = () => null;
    pill.refresh();
    expect(pill.visible).toBe(false);
    pill.destroy();
  });

  it('positions below the range when there is no room above, clamped to the viewport', () => {
    const f = mountFixture('<p id="p">Q3 focus: convert Proposal-stage deals before winter.</p>');
    const item = makeTextItem(f.get('#p'), 'convert Proposal-stage');
    stubRect(item.range, { top: 10, bottom: 40, left: 5, right: 205 });
    const { plumbing } = plumbingFor(item);
    const pill = createTextPill({ plumbing });
    pill.refresh();
    const btn = pillButton();
    expect(btn?.style.top).toBe('48px'); // below: 40 + 8
    expect(Number.parseInt(btn?.style.left ?? '0', 10)).toBeGreaterThanOrEqual(8);
    pill.destroy();
  });

  it('reads "+ Add to chat" when the chat is already open', () => {
    const f = mountFixture('<p id="p">Q3 focus: convert Proposal-stage deals before winter.</p>');
    const item = makeTextItem(f.get('#p'), 'convert Proposal-stage');
    stubRect(item.range);
    const { plumbing, setOpen } = plumbingFor(item);
    setOpen(true);
    const pill = createTextPill({ plumbing });
    pill.refresh();
    expect(pillButton()?.textContent).toBe('+ Add to chat');
    expect(pillButton()?.getAttribute('aria-label')).toBe('Add selection to chat');
    pill.destroy();
  });

  it('tap captures, opens the chat when closed, and announces the marker', async () => {
    const f = mountFixture('<p id="p">Q3 focus: convert Proposal-stage deals before winter.</p>');
    const item = makeTextItem(f.get('#p'), 'convert Proposal-stage');
    item.node = { ...item.node, marker: 'A' };
    stubRect(item.range);
    const capture = vi.fn(() => item);
    const said: string[] = [];
    const { plumbing, opened } = plumbingFor(item, { captureLive: capture });
    const pill = createTextPill({ plumbing, announce: (t) => said.push(t) });
    pill.refresh();
    pillButton()!.click();
    await tick();
    expect(capture).toHaveBeenCalled();
    expect(opened).toEqual([true]);
    expect(said).toEqual(['Selected text added to chat, marker A']);
    expect(pill.visible).toBe(false);
    pill.destroy();
  });

  it('tap adds silently when the chat is already open', async () => {
    const f = mountFixture('<p id="p">Q3 focus: convert Proposal-stage deals before winter.</p>');
    const item = makeTextItem(f.get('#p'), 'convert Proposal-stage');
    item.node = { ...item.node, marker: 'B' };
    stubRect(item.range);
    const { plumbing, opened, setOpen } = plumbingFor(item);
    setOpen(true);
    const pill = createTextPill({ plumbing });
    pill.refresh();
    pillButton()!.click();
    await tick();
    expect(opened).toEqual([]);
    expect(pill.visible).toBe(false);
    pill.destroy();
  });

  it('dismisses on Esc, on an outside click, and never for editable selections', async () => {
    const f = mountFixture(
      '<p id="p">Q3 focus: convert Proposal-stage deals before winter.</p><input id="field" value="secret words" />',
    );
    const item = makeTextItem(f.get('#p'), 'convert Proposal-stage');
    stubRect(item.range);
    const { plumbing } = plumbingFor(item);
    const live = plumbing.getLiveItem;
    const pill = createTextPill({ plumbing });
    pill.refresh();
    expect(pill.visible).toBe(true);
    // Outside click dismisses (and collapses the native selection, so the
    // pill does not come back on the mouseup settle).
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(pill.visible).toBe(false);
    plumbing.getLiveItem = () => null;
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await frame();
    expect(pill.visible).toBe(false);
    // A fresh selection shows it again; Esc dismisses it (window capture,
    // before chat/selection handlers) and consumes the key.
    plumbing.getLiveItem = live;
    pill.refresh();
    expect(pill.visible).toBe(true);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(esc);
    expect(pill.visible).toBe(false);
    expect(esc.defaultPrevented).toBe(true);
    // A click inside the selection keeps it.
    pill.refresh();
    f.get('#p').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(pill.visible).toBe(true);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    pill.destroy();
  });

  it('does not appear when disabled, or for a selection inside an editable field', () => {
    const f = mountFixture(
      '<input id="field" value="secret words" /><p id="p">plain text here</p>',
    );
    const field = f.get<HTMLInputElement>('#field');
    const range = document.createRange();
    range.setStart(field, 0);
    range.setEnd(field, 0);
    const item = makeTextItem(f.get('#p'), 'plain text');
    // Pretend the live range starts inside the input.
    const editableItem = { ...item, range } as FakeTextItem;
    const { plumbing } = plumbingFor(editableItem);
    const pill = createTextPill({ plumbing });
    pill.refresh();
    expect(pill.visible).toBe(false);
    pill.destroy();

    const disabled = createTextPill({ plumbing: { ...plumbing, enabled: false } });
    stubRect(item.range);
    disabled.refresh();
    expect(disabled.visible).toBe(false);
    disabled.destroy();
  });
});
