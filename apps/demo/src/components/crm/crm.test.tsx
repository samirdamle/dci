import { readDci } from '@dci/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KanbanBoard, KpiCard, RecordHeader, RecordTable, RelatedList } from './index';

afterEach(cleanup);

/** The parsed `data-dci` of the closest annotated ancestor-or-self of `el`. */
const annotation = (el: Element) => {
  const node = el.closest('[data-dci]');
  if (!node) throw new Error('not annotated');
  return readDci(node)!;
};

describe('KpiCard', () => {
  it('annotates a kpi with its value and delta', () => {
    render(<KpiCard id="win-rate" label="Win Rate" value="67%" raw={0.67} delta={0.03} />);
    expect(annotation(screen.getByText('67%'))).toMatchObject({
      id: 'kpi.win-rate',
      type: 'kpi',
      label: 'Win Rate',
      data: { value: '67%', raw: 0.67, delta: 0.03 },
    });
  });
});

describe('RecordTable', () => {
  const rows = [
    { Id: '006A', Name: 'Tents', Amount: 500, CreditLimit: 9000 },
    { Id: '006B', Name: 'Packs', Amount: 1500, CreditLimit: 5000 },
  ];
  const table = () =>
    render(
      <RecordTable
        id="opps"
        label="Opportunities"
        rows={rows}
        filterable
        annotateRow={(r) => ({ id: r.Id, type: 'opportunity', label: r.Name, amount: r.Amount })}
        columns={[
          { field: 'Name', header: 'Name' },
          { field: 'Amount', header: 'Amount', align: 'right', cell: (r) => `$${r.Amount}` },
          { field: 'CreditLimit', header: 'Credit limit', private: true },
        ]}
      />,
    );

  it('annotates table › row › field, with private cells', () => {
    table();
    const cell = screen.getByText('$500');
    expect(annotation(cell)).toMatchObject({
      id: '006A.Amount',
      type: 'field',
      label: 'Amount',
      data: { field: 'Amount', value: 500 },
    });
    expect(annotation(cell.closest('tr')!)).toMatchObject({ id: '006A', type: 'opportunity' });
    expect(annotation(cell.closest('table')!)).toMatchObject({
      id: 'opps',
      type: 'table',
      data: { rows: 2 },
    });
    expect(annotation(screen.getByText('9000'))).toMatchObject({
      id: '006A.CreditLimit',
      private: true,
    });
  });

  it('sorts and filters', () => {
    table();
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => (r as HTMLTableRowElement).cells[0]!.textContent);
    // Numbers sort descending first (TanStack's default), then ascending.
    act(() => screen.getByRole('button', { name: /Amount/ }).click());
    expect(names()).toEqual(['Packs', 'Tents']);
    act(() => screen.getByRole('button', { name: /Amount/ }).click());
    expect(names()).toEqual(['Tents', 'Packs']);
    const input = screen.getByLabelText('Filter Opportunities') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'tent');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(names()).toEqual(['Tents']);
  });
});

describe('KanbanBoard', () => {
  it('annotates board › stage › card', () => {
    render(
      <KanbanBoard
        id="board"
        label="Pipeline"
        columns={[
          {
            id: 'stage.Proposal',
            label: 'Proposal',
            items: [{ Id: '006A', Name: 'Tents' }],
            data: { total: 500 },
          },
        ]}
        annotateCard={(o) => ({ id: o.Id, type: 'opportunity', label: o.Name })}
        renderCard={(o) => <span>{o.Name}</span>}
      />,
    );
    const card = screen.getByText('Tents');
    expect(annotation(card)).toMatchObject({ id: '006A', type: 'opportunity' });
    const column = card.closest('section')!;
    expect(annotation(column)).toMatchObject({
      id: 'stage.Proposal',
      type: 'stage',
      data: { count: 1, total: 500 },
    });
    expect(annotation(column.parentElement!)).toMatchObject({ id: 'board', type: 'board' });
  });
});

describe('RecordHeader and RelatedList', () => {
  it('annotates the record, its fields and private fields', () => {
    render(
      <>
        <RecordHeader
          annotation={{ id: '001A', type: 'account', label: 'Alpine Co.' }}
          kind="Account"
          title="Alpine Co."
          fields={[
            { field: 'Industry', label: 'Industry', value: 'Retail' },
            {
              field: 'CreditLimit',
              label: 'Credit limit',
              value: 50000,
              display: '$50,000',
              private: true,
            },
          ]}
        />
        <RelatedList id="001A.contacts" title="Contacts" count={3}>
          <p>list</p>
        </RelatedList>
      </>,
    );
    expect(annotation(screen.getByText('Retail'))).toMatchObject({
      id: '001A.Industry',
      type: 'field',
      data: { value: 'Retail' },
    });
    expect(annotation(screen.getByText('$50,000'))).toMatchObject({ private: true });
    expect(annotation(screen.getByText('Alpine Co.'))).toMatchObject({
      id: '001A',
      type: 'account',
    });
    expect(annotation(screen.getByText('list'))).toMatchObject({
      id: '001A.contacts',
      type: 'related-list',
      data: { count: 3 },
    });
  });
});
