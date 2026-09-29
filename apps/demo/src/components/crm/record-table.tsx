import { dci, type DciAttrValue } from '@dci/react';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface RecordColumn<T> {
  /** Field name (also the key sent to the AI). */
  field: keyof T & string;
  header: string;
  /** Custom cell rendering; the raw field value is still what gets annotated. */
  cell?: (row: T) => ReactNode;
  /** Annotate the cell `private`: shown, but never selectable or sent. */
  private?: boolean;
  align?: 'left' | 'right';
  /** Sort by a different value than the displayed one. */
  sortValue?: (row: T) => string | number;
  /** Let long text wrap (cells don't wrap by default). */
  wrap?: boolean;
}

export interface RecordTableProps<T extends { Id: string }> {
  /** Table annotation id, e.g. `opportunities`. */
  id: string;
  label: string;
  rows: readonly T[];
  columns: RecordColumn<T>[];
  /** The row annotation (`id`, `type`, `label`, data…). */
  annotateRow: (row: T) => DciAttrValue;
  /** Show a filter box. */
  filterable?: boolean;
  empty?: string;
  className?: string;
}

/**
 * shadcn Table + TanStack Table, annotated as table › row › field, so a
 * user can point at a whole table, a record or a single value.
 */
export function RecordTable<T extends { Id: string }>({
  id,
  label,
  rows,
  columns,
  annotateRow,
  filterable = false,
  empty = 'No records.',
  className,
}: RecordTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState('');

  const defs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.field,
        header: c.header,
        accessorFn: (row) => (c.sortValue ? c.sortValue(row) : (row[c.field] as unknown)),
        enableGlobalFilter: !c.private,
      })),
    [columns],
  );
  // TanStack keeps stable references internally; the React Compiler can't memoize it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows as T[],
    columns: defs,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getRowId: (row) => row.Id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className={cn('space-y-2', className)}>
      {filterable && (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${label.toLowerCase()}…`}
          aria-label={`Filter ${label}`}
          className="h-8 max-w-xs"
        />
      )}
      <Table {...dci({ id, type: 'table', label, rows: rows.length })}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const column = columns.find((c) => c.field === header.column.id)!;
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className={cn(column.align === 'right' && 'text-right')}
                  >
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {column.header}
                      {sorted === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : sorted === 'desc' ? (
                        <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => {
              const record = row.original;
              const annotation = annotateRow(record);
              return (
                <TableRow key={row.id} {...dci(annotation)}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.field}
                      className={cn(
                        c.align === 'right' && 'text-right tabular-nums',
                        c.wrap && 'min-w-40 whitespace-normal',
                      )}
                      {...dci(
                        c.private
                          ? { id: `${record.Id}.${c.field}`, private: true }
                          : {
                              id: `${record.Id}.${c.field}`,
                              type: 'field',
                              label: c.header,
                              field: c.field,
                              value: record[c.field] as unknown,
                            },
                      )}
                    >
                      {c.cell ? c.cell(record) : String(record[c.field] ?? '')}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-16 text-center text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
