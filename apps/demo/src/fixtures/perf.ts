import { createDci, type DciEvent, type DciInstance, type Transport } from '@samirdamle/dci-core';

/**
 * Perf fixture (`/perf.html?rows=1000`): a grid of annotated rows × cells
 * (10 nodes per row, so 1,000 rows ≈ 10k nodes). The Playwright perf suite
 * drives it through `window.fixture`.
 */
const rows = Number(new URLSearchParams(location.search).get('rows') ?? 1000);
const root = document.getElementById('root')!;
root.style.cssText = 'display:grid;gap:2px;padding:8px;font:12px system-ui';

const frag = document.createDocumentFragment();
for (let r = 0; r < rows; r++) {
  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:repeat(9,1fr);gap:2px';
  row.dataset.dci = JSON.stringify({ id: `r${r}`, type: 'row', label: `Row ${r}` });
  for (let c = 0; c < 9; c++) {
    const cell = document.createElement('span');
    cell.textContent = `${r}:${c}`;
    cell.style.cssText = 'padding:2px;border:1px solid #ddd';
    cell.dataset.dci = JSON.stringify({ id: `r${r}c${c}`, type: 'cell', value: r * 9 + c });
    row.appendChild(cell);
  }
  frag.appendChild(row);
}
root.appendChild(frag);

const silent: Transport = {
  async *send(): AsyncGenerator<DciEvent> {
    yield { type: 'done' };
  },
};

declare global {
  interface Window {
    fixture: {
      create(): DciInstance;
      dci: DciInstance | null;
    };
  }
}

window.fixture = {
  dci: null,
  create() {
    window.fixture.dci = createDci({
      transport: silent,
      root,
      maxSelection: 1000,
      chat: { autoOpen: false },
    });
    return window.fixture.dci;
  },
};
document.body.dataset.ready = 'true';
