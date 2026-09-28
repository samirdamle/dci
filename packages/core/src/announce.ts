import { DCI_UI_ATTRIBUTE } from './keys';
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
 * A polite `aria-live` region. Pass the DCI shadow root as `parent` once the
 * UI host exists (M3); until then it lives in a hidden `[data-dci-ui]` host.
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

/** Speak `announce` bus events through a live region. */
export const announceGesture: Gesture = (ctx) => {
  const announcer = createAnnouncer();
  const off = ctx.bus.on('announce', (text) => announcer.announce(text));
  return () => {
    off();
    announcer.destroy();
  };
};
