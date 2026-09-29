import type { ReactNode } from 'react';

/** Page title and a one-line "what to try" hint. */
export function PageHeader({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {actions}
    </div>
  );
}
