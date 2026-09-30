import { dci, type DciAttrValue } from '@samirdamle/dci-react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Rectangle,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export interface ChartSeries {
  key: string;
  label: string;
  /** CSS color; defaults to the `--chart-N` palette. */
  color?: string;
}

export interface ChartCardProps<T extends Record<string, unknown>> {
  id: string;
  title: string;
  description?: string;
  kind: 'bar' | 'line';
  data: readonly T[];
  /** Category (x axis) field. */
  x: keyof T & string;
  series: ChartSeries[];
  /** The annotation for one datapoint (a bar or a line dot). */
  annotatePoint: (row: T, series: ChartSeries) => DciAttrValue;
  formatValue?: (n: number) => string;
  footer?: ReactNode;
}

/**
 * A shadcn chart whose bars and dots are each annotated (`type: 'datapoint'`),
 * so the user can point at one value. Recharts drops unknown props on its
 * shapes, so each shape is wrapped in an annotated `<g>`.
 */
export function ChartCard<T extends Record<string, unknown>>({
  id,
  title,
  description,
  kind,
  data,
  x,
  series,
  annotatePoint,
  formatValue = String,
  footer,
}: ChartCardProps<T>) {
  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.key,
      { label: s.label, color: s.color ?? `var(--chart-${(i % 5) + 1})` },
    ]),
  );
  // Recharts is typed per data shape; the card works with plain records.
  const rows = data as unknown as Array<Record<string, unknown>>;
  const point = (payload: unknown, index: number | undefined) =>
    (payload as T | undefined) ?? (data[index ?? 0] as T);
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey={x as string} tickLine={false} axisLine={false} tickMargin={8} />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={56}
        tickFormatter={(v: number) => formatValue(v)}
      />
      <ChartTooltip content={<ChartTooltipContent />} />
      {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
    </>
  );

  return (
    <Card {...dci({ id, type: 'chart', label: title })}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          {kind === 'bar' ? (
            <BarChart data={rows} accessibilityLayer>
              {axes}
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  fill={`var(--color-${s.key})`}
                  radius={4}
                  shape={(props: BarShapeProps) => (
                    <g {...dci(annotatePoint(point(props.payload, props.index), s))}>
                      <Rectangle {...props} />
                    </g>
                  )}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart data={rows} accessibilityLayer>
              {axes}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  type="monotone"
                  stroke={`var(--color-${s.key})`}
                  strokeWidth={2}
                  // Recharts' hover dot is drawn outside the annotated <g>, on top of the
                  // point, so Mod+Click would land on the chart instead. DCI highlights anyway.
                  activeDot={false}
                  dot={(props: { cx?: number; cy?: number; index?: number; payload?: unknown }) => (
                    <g
                      key={`${s.key}-${props.index}`}
                      {...dci(annotatePoint(point(props.payload, props.index), s))}
                    >
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={3.5}
                        fill="var(--background)"
                        stroke={`var(--color-${s.key})`}
                        strokeWidth={2}
                      />
                    </g>
                  )}
                />
              ))}
            </LineChart>
          )}
        </ChartContainer>
        {footer}
      </CardContent>
    </Card>
  );
}
