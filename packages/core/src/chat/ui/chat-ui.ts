import type { DciContextNode } from '@samirdamle/dci-protocol';
import { nodeName } from '../../announce';
import type { Emitter } from '../../emitter';
import type { InteractionEvents } from '../../interactions';
import { labelFor } from '../../overlay';
import { readDci, type InferAnnotation } from '../../parse';
import type { SelectionStore } from '../../selection';
import type { DciTree } from '../../tree';
import { acquireUiHost, type Theme } from '../../ui-host';
import type { ChatController } from '../controller';
import { resolveActions, type ActionsConfig, type SuggestedAction } from '../suggested-actions';
import type { ChatMessage, ChatState } from '../types';
import { h, nextId, replace } from './dom';
import { renderMarkdown as defaultMarkdown, type RenderMarkdown } from './markdown';
import { anchorFloating, type AnchorTo, type Anchoring } from './position';
import { resolveStrings, type ChatStrings } from './strings';
import { CHAT_CSS } from './styles';

export type ChatMode = 'popover' | 'panel';

/** What the default UI and custom renderers can call. */
export interface ChatUiApi {
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
export interface ChatRenderers {
  header?: Slot;
  breadcrumb?: Slot;
  chips?: Slot;
  actions?: Slot;
  input?: Slot;
  message?: (message: ChatMessage, state: ChatState, api: ChatUiApi) => HTMLElement;
}

export interface ChatUiOptions {
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
  /** Inferred annotations, for names of unannotated nodes (see `DciConfig.infer`). */
  infer?: InferAnnotation;
  theme?: Theme;
  /** Where the `<dci-root>` host lives. Default `document.body`. */
  container?: Element;
}

export interface ChatUi extends ChatUiApi {
  /** The chat element inside the shadow root. */
  readonly element: HTMLElement;
  /** Close the chat if open (for `interactions.onEscape`). Returns whether it did. */
  escape(): boolean;
  destroy(): void;
}

const AUTO_OPEN_DELAY = 250;
const MIN_PANEL = 280;

/** The focused element, looking through open shadow roots. */
function deepActive(): Element | null {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** The first `max` characters of `text` on one line, or undefined if blank. */
function snippet(text: string | undefined, max = 40): string | undefined {
  const line = text?.replace(/\s+/g, ' ').trim();
  if (!line) return undefined;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A chip's name: the annotation's label or type; for fallback nodes, what the user sees. */
const chipLabel = (n: DciContextNode) =>
  n.label ??
  n.type ??
  n.fallback?.ariaLabel ??
  n.fallback?.alt ??
  n.fallback?.title ??
  snippet(n.fallback?.text) ??
  n.fallback?.tagName ??
  'element';

/**
 * The default chat shell: a popover anchored to the selection or a docked
 * panel, rendered from controller state into the DCI shadow root. Every
 * section can be swapped via `render`, or skip this entirely and build on
 * the headless controller.
 */
export function createChatUi(options: ChatUiOptions): ChatUi {
  const { controller } = options;
  const { selection, tree, bus } = options.interactions;
  const strings = resolveStrings(options.strings);
  const render = options.render ?? {};
  const { attribute, infer } = options;
  const source = { ...(attribute ? { attribute } : {}), ...(infer ? { infer } : {}) };
  const maxChips = options.maxChips ?? 6;
  const maxActions = options.maxActions ?? 4;
  const autoOpen = options.autoOpen ?? 'onSelect';
  const markdown = options.renderMarkdown ?? defaultMarkdown;
  const markdownOptions = {
    ...(options.highlightCode ? { highlightCode: options.highlightCode } : {}),
    copyLabel: strings.copy,
    copiedLabel: strings.copied,
  };

  const { host, release } = acquireUiHost({
    ...(options.container ? { container: options.container } : {}),
    ...(options.theme ? { theme: options.theme } : {}),
  });
  const removeStyles = host.addStyles(CHAT_CSS);

  let mode: ChatMode = options.mode ?? 'popover';
  let panelWidth = options.panelWidth ?? 380;
  let chipsExpanded = false;
  let pinned = true;
  let returnFocus: Element | null = null;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set while auto-opening on select, which leaves focus on the page. */
  let quietOpen = false;
  let frame = 0;
  let destroyed = false;

  // ── skeleton ──────────────────────────────────────────────────────────
  const titleId = nextId('title');
  const root = h('div', { class: 'chat', hidden: true, 'data-side': options.side ?? 'right' });
  const resize = h('button', {
    type: 'button',
    class: 'resize',
    'aria-label': strings.resize,
    title: strings.resize,
  });
  const header = h('div', { class: 'head-slot' });
  const crumbs = h('div', { class: 'crumbs-slot' });
  const chips = h('div', { class: 'chips-slot' });
  const notice = h('p', { class: 'notice', role: 'status' });
  const log = h('div', {
    class: 'log',
    role: 'log',
    'aria-live': 'polite',
    'aria-label': strings.messages,
    tabindex: 0,
  });
  const newBtn = h('button', { type: 'button', class: 'new', hidden: true }, strings.newMessages);
  const confirmBox = h('div', { class: 'confirm' });
  const actionsSlot = h('div', { class: 'actions-slot' });
  const inputSlot = h('div', { class: 'input-slot' });
  root.append(
    resize,
    header,
    crumbs,
    chips,
    notice,
    log,
    newBtn,
    confirmBox,
    actionsSlot,
    inputSlot,
  );
  const tab = h(
    'button',
    { type: 'button', class: 'tab', hidden: true, 'data-side': options.side ?? 'right' },
    strings.expand,
  );
  const layer = host.layer('chat');
  layer.append(root, tab);
  const anchoring: Anchoring = anchorFloating(root);

  const api: ChatUiApi = {
    controller,
    strings,
    selection,
    mode: () => mode,
    setMode(next) {
      if (next === mode) return;
      mode = next;
      applyMode();
      renderAll();
    },
    flash: (el) => bus?.emit('flash', el),
    selectNode(el) {
      selection.set([el]);
      bus?.emit('announce', `Selected ${nodeName(el, source)}`);
    },
    runAction: (action) =>
      void controller.send(action.prompt ?? action.label, { action: action.id }),
  };

  // ── sections ──────────────────────────────────────────────────────────
  /** Re-render `slot`, keeping focus on the equivalent control if it had it. */
  function fill(slot: HTMLElement, el: HTMLElement | null) {
    const active = host.shadow.activeElement;
    const key = active && slot.contains(active) ? active.getAttribute('data-key') : null;
    if (el) replace(slot, el);
    else replace(slot);
    if (key)
      [...slot.querySelectorAll<HTMLElement>('[data-key]')]
        .find((n) => n.getAttribute('data-key') === key)
        ?.focus();
  }

  function defaultHeader(): HTMLElement {
    const close = h(
      'button',
      {
        type: 'button',
        class: 'icon',
        'aria-label': mode === 'panel' ? strings.collapse : strings.close,
        title: mode === 'panel' ? strings.collapse : strings.close,
        'data-key': 'close',
      },
      mode === 'panel' ? '⟩' : '×',
    );
    close.addEventListener('click', () => controller.close());
    return h('div', { class: 'head' }, h('h2', { id: titleId }, strings.title), close);
  }

  function defaultBreadcrumb(): HTMLElement | null {
    const primary = selection.primary();
    if (!tree || !primary) return null;
    const path = tree.pathTo(primary).filter((el) => !readDci(el, source)?.private);
    if (!path.length) return null;
    const shown: Array<Element | null> =
      path.length > 4 ? [path[0] ?? null, null, ...path.slice(-2)] : path;
    const list = h('ol');
    shown.forEach((el, i) => {
      if (!el) {
        list.append(h('li', { title: path.map((p) => labelFor(p, source)).join(' › ') }, '…'));
        return;
      }
      const current = i === shown.length - 1;
      const btn = h(
        'button',
        {
          type: 'button',
          'aria-current': current ? 'location' : undefined,
          'data-key': `crumb-${i}`,
          title: labelFor(el, source),
        },
        labelFor(el, source),
      );
      btn.addEventListener('click', () => api.selectNode(el));
      btn.addEventListener('mouseenter', () => api.flash(el));
      list.append(h('li', {}, btn));
    });
    return h('nav', { class: 'crumbs', 'aria-label': strings.breadcrumb }, list);
  }

  function chip(node: DciContextNode, i: number): HTMLElement {
    const label = chipLabel(node);
    const el = controller.elementFor(node);
    const name = h(
      'button',
      { type: 'button', 'data-key': `chip-${i}`, title: node.id ? `${label} (${node.id})` : label },
      h('span', { class: 'name' }, label),
      node.id
        ? h('small', {}, `#${node.id}`)
        : node.source === 'fallback'
          ? h('small', {}, strings.unannotated)
          : null,
    );
    name.addEventListener('mouseenter', () => el && api.flash(el));
    name.addEventListener('focus', () => el && api.flash(el));
    name.addEventListener('click', () => {
      if (!el) return;
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
      api.flash(el);
    });
    const remove = h(
      'button',
      {
        type: 'button',
        class: 'x',
        'aria-label': strings.removeContext(label),
        'data-key': `x-${i}`,
      },
      '×',
    );
    remove.addEventListener('click', () => controller.removeContext(node));
    return h(
      'span',
      { class: 'chip', 'data-fallback': node.source === 'fallback' || undefined },
      name,
      remove,
    );
  }

  function defaultChips(state: ChatState): HTMLElement {
    const nodes = state.pendingContext;
    const wrap = h('div');
    const list = h('div', { class: 'chips' });
    const visible = chipsExpanded ? nodes : nodes.slice(0, maxChips);
    visible.forEach((n, i) => list.append(chip(n, i)));
    if (nodes.length > maxChips) {
      const more = h(
        'button',
        {
          type: 'button',
          class: 'more',
          'aria-expanded': String(chipsExpanded),
          'data-key': 'more',
        },
        chipsExpanded ? strings.lessContext : strings.moreContext(nodes.length - maxChips),
      );
      more.addEventListener('click', () => {
        chipsExpanded = !chipsExpanded;
        fill(chips, slotChips(controller.getState()));
      });
      list.append(more);
    }
    wrap.append(list);
    if (state.limit)
      wrap.append(
        h(
          'p',
          { class: 'limit', role: 'status' },
          strings.limitReached(state.limit.shown, state.limit.total),
        ),
      );
    if (!nodes.length && !state.messages.length)
      wrap.append(h('p', { class: 'hint' }, strings.emptyContext));
    return wrap;
  }

  function defaultActions(state: ChatState): HTMLElement | null {
    const actions = resolveActions(options.actions, state.pendingContext);
    if (!actions.length) return null;
    const busy = state.status === 'sending' || state.status === 'streaming';
    const bar = h('div', { class: 'actions', role: 'toolbar', 'aria-label': strings.actions });
    const button = (a: SuggestedAction, i: number) => {
      const b = h(
        'button',
        {
          type: 'button',
          disabled: busy,
          'data-key': `action-${a.id}`,
          tabindex: i === 0 ? 0 : -1,
        },
        a.icon ? `${a.icon} ${a.label}` : a.label,
      );
      b.addEventListener('click', () => api.runAction(a));
      return b;
    };
    actions.slice(0, maxActions).forEach((a, i) => bar.append(button(a, i)));
    const overflow = actions.slice(maxActions);
    if (overflow.length) {
      const menuId = nextId('menu');
      const menu = h('div', { class: 'menu', id: menuId, hidden: true });
      overflow.forEach((a) => {
        const b = button(a, 1);
        b.addEventListener('click', () => (menu.hidden = true));
        menu.append(b);
      });
      const toggle = h(
        'button',
        {
          type: 'button',
          'aria-expanded': 'false',
          'aria-controls': menuId,
          'aria-label': strings.moreActions,
          'data-key': 'more-actions',
          tabindex: -1,
        },
        '⋯',
      );
      toggle.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        toggle.setAttribute('aria-expanded', String(!menu.hidden));
        if (!menu.hidden) menu.querySelector('button')?.focus();
      });
      bar.append(toggle, menu);
    }
    // Arrow keys move between actions (a roving toolbar).
    bar.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key))
        return;
      const items = [...bar.querySelectorAll<HTMLButtonElement>('button')].filter(
        (b) => !b.closest('.menu[hidden]'),
      );
      const i = items.indexOf(host.shadow.activeElement as HTMLButtonElement);
      if (i < 0) return;
      e.preventDefault();
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : (i + (back ? -1 : 1) + items.length) % items.length;
      items.forEach((b, j) => (b.tabIndex = j === next ? 0 : -1));
      items[next]?.focus();
    });
    return bar;
  }

  const textarea = h('textarea', {
    rows: 1,
    placeholder: strings.placeholder,
    'aria-label': strings.placeholder,
    'data-key': 'input',
  });
  function grow() {
    textarea.style.height = 'auto';
    if (textarea.scrollHeight) textarea.style.height = `${textarea.scrollHeight}px`;
  }
  textarea.addEventListener('input', () => {
    controller.setDraft(textarea.value);
    grow();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void controller.send();
    }
  });

  function defaultInput(state: ChatState): HTMLElement {
    const busy = state.status === 'sending' || state.status === 'streaming';
    if (textarea.value !== state.draft) {
      textarea.value = state.draft;
      grow();
    }
    const button = busy
      ? h('button', { type: 'button', class: 'send stop', 'data-key': 'send' }, strings.stop)
      : h('button', { type: 'submit', class: 'send', 'data-key': 'send' }, strings.send);
    if (busy) button.addEventListener('click', () => controller.stop());
    const form = h('form', { class: 'input' }, textarea, button);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void controller.send();
    });
    return form;
  }

  function toolRow(t: ChatMessage['tools'][number]): HTMLElement {
    const mark =
      t.state === 'running'
        ? h('span', { class: 'spinner', 'aria-hidden': 'true' })
        : h('span', { 'aria-hidden': 'true' }, t.state === 'ok' ? '✓' : '✗');
    return h(
      'li',
      {
        class: 'tool',
        'data-state': t.state,
        'aria-busy': t.state === 'running' ? 'true' : undefined,
      },
      h('span', { class: 'state' }, mark),
      t.label ?? t.name,
    );
  }

  function defaultMessage(m: ChatMessage, state: ChatState): HTMLElement {
    if (m.role === 'user') {
      const count = m.context?.length ?? 0;
      return h(
        'article',
        { class: 'msg user', 'aria-label': strings.you },
        h('div', { class: 'body' }, m.text),
        count ? h('div', { class: 'meta' }, count === 1 ? '1 item' : `${count} items`) : null,
      );
    }
    const el = h('article', {
      class: 'msg assistant',
      'aria-label': strings.assistant,
      'aria-busy': m.complete ? undefined : 'true',
    });
    if (m.tools.length) {
      const rows = m.tools.map(toolRow);
      if (m.complete) {
        el.append(
          h(
            'details',
            { class: 'tools' },
            h('summary', {}, strings.steps(m.tools.length)),
            h('ul', {}, ...rows),
          ),
        );
      } else el.append(h('ul', { class: 'tools' }, ...rows));
    }
    const body = h('div', { class: 'body' });
    if (m.text) body.append(markdown(m.text, markdownOptions));
    else if (!m.complete) body.append(h('span', { class: 'typing', 'aria-hidden': 'true' }));
    el.append(body);
    if (m.stopped) el.append(h('p', { class: 'stopped' }, strings.stopped));
    if (m.error) {
      const last = state.messages[state.messages.length - 1] === m;
      const retry = last
        ? h('button', { type: 'button', 'data-key': 'retry' }, strings.retry)
        : null;
      retry?.addEventListener('click', () => void controller.retry());
      el.append(
        h(
          'div',
          { class: 'error', role: 'alert' },
          h('strong', {}, strings.errorTitle),
          m.error.message,
          retry ? h('div', {}, retry) : null,
        ),
      );
    }
    return el;
  }

  const slotChips = (s: ChatState) => render.chips?.(s, api) ?? defaultChips(s);

  // ── messages (incremental, keyed by id) ───────────────────────────────
  const rendered = new Map<string, { message: ChatMessage; el: HTMLElement }>();
  function renderMessages(state: ChatState) {
    const ids = new Set(state.messages.map((m) => m.id));
    for (const [id, entry] of rendered)
      if (!ids.has(id)) {
        entry.el.remove();
        rendered.delete(id);
      }
    let grew = false;
    let prev: HTMLElement | null = null;
    const isLast = (m: ChatMessage) => state.messages[state.messages.length - 1] === m;
    for (const m of state.messages) {
      const entry = rendered.get(m.id);
      // The last message re-renders when it changes; so does an older one
      // that lost its "last" status (its Retry button goes away).
      if (!entry || entry.message !== m || (m.error && !isLast(m))) {
        const el = render.message?.(m, state, api) ?? defaultMessage(m, state);
        el.setAttribute('data-id', m.id);
        if (entry) entry.el.replaceWith(el);
        else if (prev) prev.after(el);
        else log.prepend(el);
        rendered.set(m.id, { message: m, el });
        grew = true;
      }
      prev = rendered.get(m.id)?.el ?? prev;
    }
    const streaming = state.status === 'sending' || state.status === 'streaming';
    log.setAttribute('aria-busy', String(streaming));
    if (!grew) return;
    if (pinned) log.scrollTop = log.scrollHeight;
    else newBtn.hidden = false;
  }
  log.addEventListener('scroll', () => {
    pinned = log.scrollTop + log.clientHeight >= log.scrollHeight - 16;
    if (pinned) newBtn.hidden = true;
  });
  newBtn.addEventListener('click', () => {
    pinned = true;
    newBtn.hidden = true;
    log.scrollTop = log.scrollHeight;
  });

  function renderConfirm(state: ChatState) {
    if (!state.confirm) return fill(confirmBox, null);
    const dont = h('input', { type: 'checkbox', 'data-key': 'dont' });
    const yes = h(
      'button',
      { type: 'button', class: 'primary', 'data-key': 'confirm' },
      strings.confirm,
    );
    const no = h('button', { type: 'button', 'data-key': 'cancel' }, strings.cancel);
    yes.addEventListener('click', () => controller.confirm(true, { dontAskAgain: dont.checked }));
    no.addEventListener('click', () => controller.confirm(false));
    fill(
      confirmBox,
      h(
        'div',
        { role: 'alertdialog', 'aria-label': strings.confirmSend },
        h('p', {}, strings.confirmSend),
        h('label', {}, dont, strings.dontAskAgain),
        no,
        ' ',
        yes,
      ),
    );
    yes.focus();
  }

  // ── render loop ───────────────────────────────────────────────────────
  let last: ChatState | null = null;
  let lastPrimary: Element | null = null;

  function renderAll() {
    last = null;
    lastPrimary = null;
    renderNow();
  }

  /** Update only the sections whose inputs changed. */
  function renderNow() {
    frame = 0;
    if (destroyed) return;
    const state = controller.getState();
    const prev = last;
    last = state;
    const primary = selection.primary();
    if (!prev) fill(header, render.header?.(state, api) ?? defaultHeader());
    if (!prev || primary !== lastPrimary)
      fill(crumbs, render.breadcrumb?.(state, api) ?? defaultBreadcrumb());
    lastPrimary = primary;
    if (
      !prev ||
      prev.pendingContext !== state.pendingContext ||
      prev.limit !== state.limit ||
      prev.messages.length !== state.messages.length
    ) {
      if (!prev || prev.pendingContext !== state.pendingContext)
        chipsExpanded &&= state.pendingContext.length > maxChips;
      fill(chips, slotChips(state));
    }
    if (!prev || prev.notice !== state.notice)
      notice.textContent = state.notice === 'cancelled' ? strings.cancelled : '';
    if (!prev || prev.messages !== state.messages || prev.status !== state.status)
      renderMessages(state);
    if (!prev || prev.confirm !== state.confirm) renderConfirm(state);
    if (!prev || prev.pendingContext !== state.pendingContext || prev.status !== state.status)
      fill(actionsSlot, render.actions?.(state, api) ?? defaultActions(state));
    if (!prev || prev.status !== state.status)
      fill(inputSlot, render.input?.(state, api) ?? defaultInput(state));
    else if (!render.input && textarea.value !== state.draft) {
      textarea.value = state.draft;
      grow();
    }
    if (!prev || prev.open !== state.open) applyOpen(state.open, prev?.open ?? false);
  }

  /** Streaming deltas arrive fast: render at most once per frame. */
  function schedule() {
    if (frame || destroyed) return;
    frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(renderNow) : 0;
    if (!frame) renderNow();
  }

  // ── open / close, modes, focus ────────────────────────────────────────
  function anchorTargets(): Element[] {
    if (mode !== 'popover') return [];
    if (options.anchor === 'selection') return selection.get();
    const primary = selection.primary();
    return primary ? [primary] : [];
  }

  function setInset(open: boolean) {
    if (!options.pushContent) return;
    const style = document.documentElement.style;
    if (open && mode === 'panel') style.setProperty('--dci-chat-inset', `${panelWidth}px`);
    else style.removeProperty('--dci-chat-inset');
  }

  function applyMode() {
    const panel = mode === 'panel';
    root.setAttribute('data-mode', mode);
    root.setAttribute('role', panel ? 'complementary' : 'dialog');
    root.setAttribute('aria-labelledby', titleId);
    if (panel) root.removeAttribute('aria-modal');
    else root.setAttribute('aria-modal', 'false');
    resize.hidden = !panel;
    root.style.setProperty('--dci-chat-width', `${panelWidth}px`);
    if (panel) {
      anchoring.setTargets([]);
      anchoring.resetNudge();
      root.removeAttribute('data-parked');
      root.style.left = '';
      root.style.top = '';
    } else if (controller.getState().open) anchoring.setTargets(anchorTargets());
    const open = controller.getState().open;
    tab.hidden = !panel || open;
    setInset(open);
  }

  function applyOpen(open: boolean, wasOpen: boolean) {
    root.hidden = !open;
    tab.hidden = mode !== 'panel' || open;
    setInset(open);
    if (open && !wasOpen) {
      const active = deepActive();
      returnFocus = active && !root.contains(active) ? active : null;
      anchoring.resetNudge();
      if (mode === 'popover') anchoring.setTargets(anchorTargets());
      if (!quietOpen)
        (inputSlot.querySelector('textarea') ?? root.querySelector<HTMLElement>('button'))?.focus();
    } else if (!open && wasOpen) {
      anchoring.setTargets([]);
      const target = returnFocus;
      returnFocus = null;
      const inside = !!host.shadow.activeElement && root.contains(host.shadow.activeElement);
      if (target instanceof HTMLElement && target.isConnected && inside) target.focus();
      else if (inside && mode === 'panel') tab.focus();
    }
  }

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!root.querySelector('.menu:not([hidden])')) controller.close();
    root.querySelectorAll<HTMLElement>('.menu').forEach((m) => (m.hidden = true));
    e.stopPropagation();
  });
  tab.addEventListener('click', () => controller.open());

  // Popover: drag the header to move it off the content.
  header.addEventListener('pointerdown', (e) => {
    if (mode !== 'popover' || (e.target as Element).closest('button')) return;
    e.preventDefault();
    let x = e.clientX;
    let y = e.clientY;
    const move = (ev: PointerEvent) => {
      anchoring.nudge(ev.clientX - x, ev.clientY - y);
      x = ev.clientX;
      y = ev.clientY;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // Panel: drag the edge, or use the arrow keys on it, to resize.
  function setWidth(width: number) {
    panelWidth = Math.round(Math.max(MIN_PANEL, Math.min(width, window.innerWidth * 0.9)));
    root.style.setProperty('--dci-chat-width', `${panelWidth}px`);
    setInset(controller.getState().open);
  }
  resize.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const right = root.getAttribute('data-side') !== 'left';
    const move = (ev: PointerEvent) =>
      setWidth(right ? window.innerWidth - ev.clientX : ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  resize.addEventListener('keydown', (e) => {
    const right = root.getAttribute('data-side') !== 'left';
    const step = e.key === 'ArrowLeft' ? 20 : e.key === 'ArrowRight' ? -20 : 0;
    if (!step) return;
    e.preventDefault();
    setWidth(panelWidth + (right ? step : -step));
  });

  // ── subscriptions ─────────────────────────────────────────────────────
  let messageCount = controller.getState().messages.length;
  const offState = controller.subscribe((state) => {
    // Open/close and input changes render now (focus management); the rest per frame.
    if (last && (state.open !== last.open || state.confirm !== last.confirm)) renderNow();
    else schedule();
    if (state.messages.length > messageCount && !state.open && autoOpen !== false)
      controller.open();
    messageCount = state.messages.length;
  });
  const offSelection = selection.subscribe(({ added, elements }) => {
    schedule();
    if (controller.getState().open && mode === 'popover') anchoring.setTargets(anchorTargets());
    clearTimeout(openTimer);
    if (autoOpen === 'onSelect' && added.length && elements.length)
      openTimer = setTimeout(() => {
        // Keep focus where it is, so arrow-key navigation keeps working.
        quietOpen = true;
        controller.open();
        quietOpen = false;
      }, AUTO_OPEN_DELAY);
  });

  applyMode();
  renderNow();

  return {
    ...api,
    element: root,
    escape() {
      if (!controller.getState().open) return false;
      controller.close();
      return true;
    },
    destroy() {
      destroyed = true;
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      clearTimeout(openTimer);
      offState();
      offSelection();
      anchoring.destroy();
      setInset(false);
      root.remove();
      tab.remove();
      removeStyles();
      release();
    },
  };
}
