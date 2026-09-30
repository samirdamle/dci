import { createDci, type DciEvent, type Transport } from '@dci/core';

/**
 * Visual-snapshot fixture (`/visual.html`): fixed-size, text-free boxes, so
 * the overlay's look (hover, selected, primary, marquee) can be compared
 * pixel by pixel without font differences between machines.
 */
const root = document.getElementById('root')!;
document.body.style.cssText = 'margin:0;background:#fff';
root.style.cssText =
  'display:grid;grid-template-columns:repeat(3,120px);gap:24px;padding:32px;width:max-content';
root.dataset.dci = JSON.stringify({ id: 'grid', type: 'grid' });
for (let i = 0; i < 6; i++) {
  const tile = document.createElement('div');
  tile.id = `t${i}`;
  tile.style.cssText = 'height:64px;border-radius:6px;background:#e2e8f0';
  tile.dataset.dci = JSON.stringify({ id: `t${i}`, type: 'tile' });
  root.appendChild(tile);
}

const silent: Transport = {
  async *send(): AsyncGenerator<DciEvent> {
    yield { type: 'done' };
  },
};

const dci = createDci({
  transport: silent,
  root,
  overlay: { labels: 'none' },
  chat: { autoOpen: false },
  theme: 'light',
});
Object.assign(window, { dci });
document.body.dataset.ready = 'true';
