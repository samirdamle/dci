import { DCI_UI_ATTRIBUTE } from './keys';
import { acquireUiHost } from './ui-host';
import type { Gesture } from './interactions';
import { readDci } from './parse';
import type { DciTree } from './tree';

/** Human-readable name: label, then id, then tag name. */
export function nodeName(el: Element, attribute?: string): string {
  const parsed = readDci(el, attribute ? { attribute } : {});
  return parsed?.label ?? parsed?.id ?? el.tagName.toLowerCase();
}

/**
 * Screen-reader description of a node and its position among same-type
 * siblings, e.g. `"Invoice #123, invoice 3 of 20"`.
 */
export function describeNode(el: Element, tree: DciTree, attribute?: string): string {
  const name = nodeName(el, attribute);
  const type = readDci(el, attribute ? { attribute } : {})?.type;
  if (!type) return name;
  const peers = tree.sameTypeSiblings(el);
  return peers.length > 1 ? `${name}, ${type} ${peers.indexOf(el) + 1} of ${peers.length}` : name;
}

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
  'clip:rect(0 0 0 0);white-space:nowrap;border:0';

/**
 * A polite `aria-live` region, rendered into `parent` (normally the UI
 * host's `live-region` layer) or, without one, a hidden `[data-dci-ui]` host.
 */
export function createAnnouncer(parent?: Element | ShadowRoot) {
  let region: HTMLElement | null = null;
  let host: HTMLElement | null = null;

  function ensure(): HTMLElement {
    if (region) return region;
    region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.style.cssText = VISUALLY_HIDDEN;
    if (parent) parent.appendChild(region);
    else {
      host = document.createElement('div');
      host.setAttribute(DCI_UI_ATTRIBUTE, '');
      host.appendChild(region);
      document.body.appendChild(host);
    }
    return region;
  }

  return {
    announce(text: string) {
      const el = ensure();
      // Clear first so repeating the same text is announced again.
      el.textContent = '';
      el.textContent = text;
    },
    element: () => region,
    destroy() {
      (host ?? region)?.remove();
      region = host = null;
    },
  };
}

/** Speak `announce` bus events through a live region in the DCI UI host. */
export const announceGesture: Gesture = (ctx) => {
  const ui = ctx.options.overlay === false ? {} : (ctx.options.overlay ?? {});
  const { host, release } = acquireUiHost(ui);
  const announcer = createAnnouncer(host.layer('live-region'));
  const off = ctx.bus.on('announce', (text) => announcer.announce(text));
  return () => {
    off();
    announcer.destroy();
    release();
  };
};
