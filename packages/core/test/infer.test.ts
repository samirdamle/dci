import { afterEach, describe, expect, it, vi } from 'vitest';
import { toContextNode } from '../src/context';
import { validateConfig } from '../src/dci/config';
import { createDci, type DciInstance } from '../src/dci/create-dci';
import { readDci, refreshInferred, type InferAnnotation } from '../src/parse';
import { createDciTree } from '../src/tree';
import { fakeTransport, reply, tick } from './chat-utils';
import { fakeKey, fakePointer, mountFixture } from './test-utils';

// A plain table: no data-dci anywhere, except one real annotation that must win.
const FIXTURE = `
  <table id="t">
    <tr><th>Order</th><th>Customer</th></tr>
    <tr id="r1"><td id="c1">#1001</td><td>Ada</td></tr>
    <tr id="r2"><td>#1002</td><td>Alan</td></tr>
    <tr id="r3" data-dci='{"id":"special","type":"order","label":"Special order"}'><td>#1003</td><td>Grace</td></tr>
    <tr id="secret"><td>#9999</td><td>hidden</td></tr>
  </table>`;

/** Rows become `order` nodes with a field per column; one row is private. */
const infer: InferAnnotation = (el) => {
  if (el.id === 'secret') return { private: true };
  if (el.tagName !== 'TR' || !el.querySelector('td')) return null;
  const headers = [...el.closest('table')!.querySelectorAll('th')].map((th) => th.textContent!);
  const cells = [...el.querySelectorAll('td')].map((td) => td.textContent!);
  return {
    type: 'order',
    label: `Order ${cells[0]}`,
    ...Object.fromEntries(headers.map((h, i) => [h, cells[i]])),
  };
};

const instances: DciInstance[] = [];
afterEach(() => {
  instances.splice(0).forEach((d) => d.destroy());
  vi.restoreAllMocks();
});

describe('inferred annotations', () => {
  it('make unannotated elements DCI nodes, without touching the DOM', () => {
    const f = mountFixture(FIXTURE);
    const tree = createDciTree({ root: f.root, infer });
    expect(tree.nearestNode(f.get('#c1'))).toBe(f.get('#r1'));
    expect(tree.sameTypeSiblings(f.get('#r1')).map((el) => el.id)).toEqual(['r1', 'r2', 'r3']);
    // Private inferred nodes are not navigable.
    expect(tree.nearestNode(f.get('#secret td'))).toBeNull();
    expect(f.root.querySelectorAll('[data-dci]')).toHaveLength(1);
  });

  it('never reach into DCI’s own UI', () => {
    const f = mountFixture(FIXTURE);
    const everything: InferAnnotation = (el) =>
      el.tagName === 'TR' || el.tagName === 'LI' ? {} : null;
    const ui = document.createElement('dci-root');
    ui.setAttribute('data-dci-ui', '');
    ui.attachShadow({ mode: 'open' }).innerHTML = '<ul><li>Chat action</li></ul>';
    f.root.append(ui);
    const tree = createDciTree({ root: f.root, infer: everything });
    expect(tree.childNodes(f.root).map((el) => el.tagName)).toEqual(['TR', 'TR', 'TR', 'TR', 'TR']);
  });

  it('lose to a real attribute', () => {
    const f = mountFixture(FIXTURE);
    expect(readDci(f.get('#r3'), { infer })?.label).toBe('Special order');
    expect(readDci(f.get('#r1'), { infer })?.label).toBe('Order #1001');
  });

  it('are sent as annotated context, with the inferred fields as data', () => {
    const f = mountFixture(FIXTURE);
    expect(toContextNode(f.get('#r1'), { root: f.root, infer })).toEqual({
      type: 'order',
      label: 'Order #1001',
      data: { Order: '#1001', Customer: 'Ada' },
      source: 'annotated',
      ancestors: [],
    });
  });

  it('are cached until refreshed', () => {
    const f = mountFixture(FIXTURE);
    const spy = vi.fn(infer);
    const row = f.get('#r1');
    readDci(row, { infer: spy });
    readDci(row, { infer: spy });
    expect(spy).toHaveBeenCalledTimes(1);
    row.querySelector('td:last-child')!.textContent = 'Ada Lovelace';
    expect(readDci(row, { infer: spy })?.data.Customer).toBe('Ada');
    refreshInferred();
    expect(readDci(row, { infer: spy })?.data.Customer).toBe('Ada Lovelace');
  });

  it('work end to end: Alt+Click selects the row, Alt+Double-click all rows, and sends them', async () => {
    const f = mountFixture(FIXTURE);
    const fake = fakeTransport(() => reply('ok'));
    const dci = createDci({ transport: fake.transport, root: f.root, infer });
    instances.push(dci);

    fakeKey('Alt', { altKey: true });
    fakePointer(f.get('#c1'), { altKey: true });
    expect(dci.selection.elements()).toEqual([f.get('#r1')]);
    fakePointer(f.get('#c1'), { type: 'dblclick', altKey: true });
    expect(dci.selection.elements().map((el) => el.id)).toEqual(['r1', 'r2', 'r3']);
    fakeKey('Alt', { type: 'keyup' });

    await tick(); // The selection store batches its change events.
    await dci.chat.send('Compare these');
    await tick();
    expect(fake.requests[0]!.context.map((n) => n.label)).toEqual([
      'Order #1001',
      'Order #1002',
      'Special order',
    ]);
  });

  it('must be a function', () => {
    expect(validateConfig({ endpoint: '/x', infer: 'rows' as never }).errors).toEqual([
      '`infer` must be a function `(el) => annotation | null`.',
    ]);
  });
});
