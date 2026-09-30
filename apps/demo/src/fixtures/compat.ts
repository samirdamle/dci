import { createDci, type DciEvent, type Transport } from '@samirdamle/dci-core';

/**
 * Compatibility fixture: a strict-CSP page (see compat.html) with annotated
 * nodes inside a web component's open shadow root.
 */
class ShadowCard extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const card = document.createElement('article');
    card.id = 'shadow-card';
    card.dataset.dci = JSON.stringify({ id: 'card', type: 'card', label: 'Shadow card' });
    const item = document.createElement('p');
    item.id = 'shadow-item';
    item.textContent = 'Inside a shadow root';
    item.dataset.dci = JSON.stringify({ id: 'item', type: 'item', label: 'Shadow item' });
    card.appendChild(item);
    shadow.appendChild(card);
  }
}
customElements.define('shadow-card', ShadowCard);

const reply: Transport = {
  async *send(): AsyncGenerator<DciEvent> {
    yield { type: 'text-delta', text: 'Hello from a strict page.' };
    yield { type: 'done' };
  },
};

const violations: string[] = [];
document.addEventListener('securitypolicyviolation', (e) =>
  violations.push(`${e.violatedDirective}: ${e.blockedURI}`),
);
const dci = createDci({ transport: reply, root: document.getElementById('root')! });
Object.assign(window, { dci, violations });
document.body.dataset.ready = 'true';
