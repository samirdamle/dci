import { Fragment } from 'react';

/** Keys as chips joined by `+`, e.g. Alt + Shift + Click. */
export function KeyCombo({ keys }: { keys: readonly string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 whitespace-nowrap">
      {keys.map((key, i) => (
        <Fragment key={key}>
          {i > 0 && <span className="text-muted-foreground">+</span>}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
            {key}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}
