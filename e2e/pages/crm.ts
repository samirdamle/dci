import type { Locator, Page } from '@playwright/test';

/** A `RecordTable` (list views, related lists) located by its label. */
export class RecordTable {
  readonly table: Locator;
  readonly rows: Locator;
  readonly filter: Locator;

  constructor(page: Page, label: string) {
    this.table = page.locator(`table[data-dci*='"label":"${label}"']`);
    this.rows = this.table.locator('tbody tr');
    this.filter = page.getByLabel(`Filter ${label}`);
  }

  row(text: string) {
    return this.rows.filter({ hasText: text }).first();
  }

  /** Cell `index` of a row (a `field` node). */
  cell(row: Locator, index = 0) {
    return row.locator('td').nth(index);
  }

  /** First-column text of the first `count` rows. */
  async names(count: number): Promise<string[]> {
    const all = await this.rows.evaluateAll((trs) =>
      trs.map((tr) => (tr as HTMLTableRowElement).cells[0]?.textContent ?? ''),
    );
    return all.slice(0, count);
  }
}

/** The opportunity Kanban board: board › stage column › card. */
export class KanbanBoard {
  readonly board: Locator;

  constructor(page: Page, label = 'Opportunity pipeline') {
    this.board = page.getByRole('region', { name: label });
  }

  column(stage: string) {
    return this.board.getByRole('region', { name: stage, exact: true });
  }

  cards(stage: string) {
    return this.column(stage).locator(`[data-dci*='"type":"opportunity"']`);
  }
}

/** The journey canvas: journey › step › branch › step. */
export class JourneyCanvas {
  constructor(private readonly page: Page) {}

  /** The label text of a step (clicking it lands on the step node). */
  step(name: string) {
    return this.page.getByText(name, { exact: true });
  }
}
