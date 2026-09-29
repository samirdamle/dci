import { ChartCard, KpiCard } from '@/components/crm';
import { CHANNELS } from '@/data';
import { count, money, moneyShort, useOrg } from '@/lib/org';

export function MarketingHome() {
  const org = useOrg();
  const spend = org.Campaign.reduce((s, c) => s + c.ActualCost, 0);
  const leads = org.Campaign.reduce((s, c) => s + c.LeadsGenerated, 0);
  const sourcedPipeline = org.Opportunity.filter((o) =>
    ['Webinar', 'Email Campaign', 'Trade Show'].includes(o.LeadSource),
  ).reduce((s, o) => s + o.Amount, 0);

  const months = [...new Set(org.ChannelMetric.map((m) => m.Month))];
  const monthLabel = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const byMonth = months.map((month) => {
    const row: Record<string, string | number> = { month: monthLabel(month), iso: month };
    for (const m of org.ChannelMetric.filter((x) => x.Month === month))
      row[key(m.Channel)] = m.Leads;
    return row;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Marketing Home</h1>
        <p className="text-sm text-muted-foreground">
          Hold <kbd>Alt</kbd> and click a tile or a point on the chart to ask about it.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          id="total-spend"
          label="Total Spend"
          value={moneyShort(spend)}
          raw={spend}
          delta={0.14}
          hint={`${org.Campaign.length} campaigns`}
        />
        <KpiCard
          id="leads-generated"
          label="Leads Generated"
          value={count(leads)}
          raw={leads}
          delta={0.06}
        />
        <KpiCard
          id="cost-per-lead"
          label="Cost per Lead"
          value={money(spend / Math.max(1, leads))}
          raw={Math.round(spend / Math.max(1, leads))}
          delta={0.09}
          hint="lower is better"
        />
        <KpiCard
          id="marketing-pipeline"
          label="Marketing-sourced Pipeline"
          value={moneyShort(sourcedPipeline)}
          raw={sourcedPipeline}
          delta={-0.04}
        />
      </div>
      <ChartCard
        id="chart.channel-leads"
        title="Leads by channel"
        description="Monthly leads over the last 12 months"
        kind="line"
        data={byMonth}
        x="month"
        series={CHANNELS.map((c) => ({ key: key(c), label: c }))}
        formatValue={(n) => count(n)}
        annotatePoint={(row, s) => {
          const metric = org.ChannelMetric.find(
            (m) => m.Month === row.iso && key(m.Channel) === s.key,
          );
          return {
            id: `datapoint.channel.${s.key}.${String(row.iso)}`,
            type: 'datapoint',
            label: `${s.label}, ${String(row.month)}: ${String(row[s.key])} leads`,
            channel: s.label,
            month: row.iso,
            ...(metric
              ? { spend: metric.Spend, leads: metric.Leads, conversions: metric.Conversions }
              : {}),
          };
        }}
      />
    </div>
  );
}

/** Series keys must be CSS-safe (`--color-<key>`). */
const key = (channel: string) => channel.toLowerCase().replace(/[^a-z]+/g, '-');
