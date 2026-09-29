import { dci, type DciAttrValue } from '@dci/react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface RecordField {
  field: string;
  label: string;
  /** Raw value sent to the AI. */
  value: unknown;
  /** Displayed value (defaults to `value`). */
  display?: ReactNode;
  /** Shown, but annotated `private`: never selectable or sent. */
  private?: boolean;
}

export interface RecordHeaderProps {
  annotation: DciAttrValue & { id: string };
  icon?: ReactNode;
  kind: string;
  title: string;
  fields: RecordField[];
  actions?: ReactNode;
}

/** A record page header: the record itself, with each highlighted field inside it. */
export function RecordHeader({
  annotation,
  icon,
  kind,
  title,
  fields,
  actions,
}: RecordHeaderProps) {
  return (
    <Card {...dci(annotation)}>
      <CardHeader className="flex flex-row items-start gap-3">
        {icon && <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>}
        <div className="flex-1">
          <CardDescription>{kind}</CardDescription>
          <CardTitle className="text-xl">{title}</CardTitle>
        </div>
        {actions}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3 lg:grid-cols-6">
          {fields.map((f) => (
            <div
              key={f.field}
              {...dci(
                f.private
                  ? { id: `${annotation.id}.${f.field}`, private: true }
                  : {
                      id: `${annotation.id}.${f.field}`,
                      type: 'field',
                      label: f.label,
                      field: f.field,
                      value: f.value,
                    },
              )}
            >
              <dt className="text-xs text-muted-foreground">
                {f.label}
                {f.private && (
                  <span className="ml-1 rounded bg-muted px-1 text-[10px]">private</span>
                )}
              </dt>
              <dd className="font-medium">{f.display ?? String(f.value ?? '—')}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** A related list on a record page (contacts, opportunities, activities…). */
export function RelatedList({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section
      className="space-y-2"
      {...dci({
        id,
        type: 'related-list',
        label: title,
        ...(count !== undefined ? { count } : {}),
      })}
    >
      <h3 className="text-sm font-medium">
        {title}
        {count !== undefined && <span className="ml-1 text-muted-foreground">({count})</span>}
      </h3>
      {children}
    </section>
  );
}
