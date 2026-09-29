import { dci, type DciAttrValue } from '@dci/react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface KanbanColumnData<T> {
  id: string;
  label: string;
  items: readonly T[];
  /** Extra column data for the AI, e.g. `{ total: 184500 }`. */
  data?: Record<string, unknown>;
  footer?: ReactNode;
}

export interface KanbanBoardProps<T extends { Id: string }> {
  id: string;
  label: string;
  columns: KanbanColumnData<T>[];
  annotateCard: (item: T) => DciAttrValue;
  renderCard: (item: T) => ReactNode;
}

/** Board › column (`type: 'stage'`) › card: arrows move between siblings, ↑ to the column. */
export function KanbanBoard<T extends { Id: string }>({
  id,
  label,
  columns,
  annotateCard,
  renderCard,
}: KanbanBoardProps<T>) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" {...dci({ id, type: 'board', label })}>
      {columns.map((col) => (
        <KanbanColumn
          key={col.id}
          column={col}
          annotateCard={annotateCard}
          renderCard={renderCard}
        />
      ))}
    </div>
  );
}

export function KanbanColumn<T extends { Id: string }>({
  column,
  annotateCard,
  renderCard,
}: {
  column: KanbanColumnData<T>;
  annotateCard: (item: T) => DciAttrValue;
  renderCard: (item: T) => ReactNode;
}) {
  return (
    <section
      className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-2"
      aria-label={column.label}
      {...dci({
        id: column.id,
        type: 'stage',
        label: column.label,
        count: column.items.length,
        ...column.data,
      })}
    >
      <header className="flex items-center justify-between px-1 text-sm font-medium">
        <span>{column.label}</span>
        <span className="text-xs text-muted-foreground">{column.items.length}</span>
      </header>
      {column.items.map((item) => (
        <KanbanCard key={item.Id} annotation={annotateCard(item)}>
          {renderCard(item)}
        </KanbanCard>
      ))}
      {column.footer}
    </section>
  );
}

export function KanbanCard({
  annotation,
  children,
  className,
}: {
  annotation: DciAttrValue;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('gap-1 p-3 text-sm shadow-xs', className)} {...dci(annotation)}>
      {children}
    </Card>
  );
}
