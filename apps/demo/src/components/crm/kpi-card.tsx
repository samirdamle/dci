import { dci } from '@samirdamle/dci-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  id: string;
  label: string;
  /** Display value, e.g. `$1.2M`. */
  value: string;
  /** Raw value sent to the AI. */
  raw?: number;
  /** Change vs. the previous period, e.g. `0.12` for +12%. */
  delta?: number;
  hint?: string;
}

/** A metric tile, annotated `type: 'kpi'`. */
export function KpiCard({ id, label, value, raw, delta, hint }: KpiCardProps) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card
      className="gap-2 py-4"
      {...dci({
        id: `kpi.${id}`,
        type: 'kpi',
        label,
        value,
        ...(raw !== undefined ? { raw } : {}),
        ...(delta !== undefined ? { delta } : {}),
      })}
    >
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2 px-4 text-xs text-muted-foreground">
        {delta !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              up ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
            )}
          >
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {`${up ? '+' : ''}${(delta * 100).toFixed(0)}%`}
          </span>
        )}
        {hint}
      </CardContent>
    </Card>
  );
}
