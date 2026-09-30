import { dci } from '@samirdamle/dci-react';
import { CalendarClock } from 'lucide-react';
import { useMemo } from 'react';
import { ChartCard, KpiCard, OwnerAvatar, RecordTable, StatusBadge } from '@/components/crm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { OPPORTUNITY_STAGES, type Opportunity } from '@/data';
import { opportunityAnnotation } from '@/lib/annotations';
import { formatDate, money, moneyShort, percent, today, useOrg } from '@/lib/org';

/** The signed-in rep for "My …" lists. */
const ME = 1;

export function SalesHome() {
  const org = useOrg();
  const me = org.User[ME]!;
  const now = today();
  const month = now.slice(0, 7);
  const quarterStart = `${now.slice(0, 5)}${String(Math.floor((Number(now.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  const accountName = useMemo(() => new Map(org.Account.map((a) => [a.Id, a.Name])), [org.Account]);

  const open = org.Opportunity.filter((o) => !o.StageName.startsWith('Closed'));
  const won = org.Opportunity.filter((o) => o.StageName === 'Closed Won');
  const lost = org.Opportunity.filter((o) => o.StageName === 'Closed Lost');
  const wonQtd = won.filter((o) => o.CloseDate >= quarterStart);
  const pipeline = open.reduce((s, o) => s + o.Amount, 0);
  const winRate = won.length / Math.max(1, won.length + lost.length);
  const avgDeal = won.reduce((s, o) => s + o.Amount, 0) / Math.max(1, won.length);

  const byStage = OPPORTUNITY_STAGES.filter((s) => !s.startsWith('Closed')).map((stage) => {
    const deals = open.filter((o) => o.StageName === stage);
    return { stage, amount: deals.reduce((s, o) => s + o.Amount, 0), count: deals.length };
  });

  const closingThisMonth = open.filter((o) => o.CloseDate.startsWith(month) || o.CloseDate < now);
  const tasks = org.Task.filter((t) => t.Status !== 'Completed' && t.OwnerId === me.Id)
    .sort((a, b) => a.ActivityDate.localeCompare(b.ActivityDate))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sales Home</h1>
        <p className="text-sm text-muted-foreground">
          Hold <kbd>Alt</kbd> and click any tile, bar, row or value to ask about it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          id="open-pipeline"
          label="Open Pipeline"
          value={moneyShort(pipeline)}
          raw={pipeline}
          delta={0.08}
          hint={`${open.length} open deals`}
        />
        <KpiCard
          id="closed-won-qtd"
          label="Closed Won (QTD)"
          value={moneyShort(wonQtd.reduce((s, o) => s + o.Amount, 0))}
          raw={wonQtd.reduce((s, o) => s + o.Amount, 0)}
          delta={-0.05}
          hint={`${wonQtd.length} deals`}
        />
        <KpiCard
          id="win-rate"
          label="Win Rate"
          value={percent(winRate)}
          raw={winRate}
          delta={0.03}
          hint="closed deals"
        />
        <KpiCard
          id="avg-deal-size"
          label="Avg Deal Size"
          value={moneyShort(avgDeal)}
          raw={Math.round(avgDeal)}
          delta={0.11}
          hint="won deals"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <ChartCard
          id="chart.pipeline-by-stage"
          title="Pipeline by stage"
          description="Open opportunity amount per stage"
          kind="bar"
          data={byStage}
          x="stage"
          series={[{ key: 'amount', label: 'Amount', color: 'var(--primary)' }]}
          formatValue={moneyShort}
          annotatePoint={(row) => ({
            id: `datapoint.pipeline.${row.stage}`,
            type: 'datapoint',
            label: `${row.stage}: ${money(row.amount)}`,
            stage: row.stage,
            amount: row.amount,
            deals: row.count,
          })}
        />
        <Card {...dci({ id: 'my-tasks', type: 'list', label: 'My upcoming tasks' })}>
          <CardHeader>
            <CardTitle>Upcoming tasks</CardTitle>
            <CardDescription>{me.Name}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {tasks.map((t) => (
                <li
                  key={t.Id}
                  className="flex items-start gap-2"
                  {...dci({
                    id: t.Id,
                    type: 'task',
                    label: t.Subject,
                    taskType: t.Type,
                    status: t.Status,
                    due: t.ActivityDate,
                    relatedTo: t.WhatId,
                  })}
                >
                  <CalendarClock className="mt-0.5 size-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">{t.Subject}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.Type} · due {formatDate(t.ActivityDate)}
                    </div>
                  </div>
                  <StatusBadge value={t.Status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Opportunities closing this month</CardTitle>
          <CardDescription>Including overdue deals that are still open</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordTable<Opportunity>
            id="closing-this-month"
            label="Opportunities closing this month"
            rows={closingThisMonth}
            annotateRow={(o) => opportunityAnnotation(o, accountName.get(o.AccountId))}
            columns={[
              { field: 'Name', header: 'Opportunity' },
              { field: 'AccountId', header: 'Account', cell: (o) => accountName.get(o.AccountId) },
              {
                field: 'StageName',
                header: 'Stage',
                cell: (o) => <StatusBadge value={o.StageName} />,
              },
              { field: 'Amount', header: 'Amount', align: 'right', cell: (o) => money(o.Amount) },
              {
                field: 'CloseDate',
                header: 'Close Date',
                cell: (o) => (
                  <span
                    className={
                      o.CloseDate < now ? 'font-medium text-red-700 dark:text-red-400' : ''
                    }
                  >
                    {formatDate(o.CloseDate)}
                  </span>
                ),
              },
              {
                field: 'OwnerId',
                header: 'Owner',
                cell: (o) => <OwnerAvatar user={org.User.find((u) => u.Id === o.OwnerId)} />,
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Deliberately unannotated: Alt+Click still works through the fallback. */}
      <Card>
        <CardHeader>
          <CardTitle>Org notes</CardTitle>
          <CardDescription>Not annotated: DCI describes it from visible text</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Q3 focus: convert Proposal-stage tent deals before the winter catalog ships.</p>
          <p>Reminder: volume pricing above 200 units needs director approval (Maya Brooks).</p>
        </CardContent>
      </Card>
    </div>
  );
}
