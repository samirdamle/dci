import { useState } from 'react';
import { KpiCard, PageHeader, RecordTable } from '@/components/crm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { EmailSend } from '@/data';
import { clickRate, emailSendAnnotation, openRate } from '@/lib/annotations';
import { useLookups } from '@/lib/lookups';
import { count, formatDate, percent, useOrg } from '@/lib/org';

export function EmailSendsPage() {
  const org = useOrg();
  const lookup = useLookups(org);
  const sends = [...org.EmailSend].sort((a, b) => b.SendDate.localeCompare(a.SendDate));
  // Start on the story send with the abnormal open rate.
  const lowest = [...sends].sort((a, b) => openRate(a) - openRate(b))[0];
  const [selectedId, setSelectedId] = useState(lowest?.Id);
  const send = sends.find((s) => s.Id === selectedId) ?? sends[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email sends"
        hint="Click a send to see its metrics; Alt+Click a metric to ask about it."
      />
      {send && (
        <Card>
          <CardHeader>
            <CardDescription>Selected send · {formatDate(send.SendDate)}</CardDescription>
            <CardTitle>{send.Subject}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <KpiCard id={`${send.Id}.sent`} label="Sent" value={count(send.Sent)} raw={send.Sent} />
            <KpiCard
              id={`${send.Id}.delivered`}
              label="Delivered"
              value={count(send.Delivered)}
              raw={send.Delivered}
            />
            <KpiCard
              id={`${send.Id}.open-rate`}
              label="Open %"
              value={percent(openRate(send), 1)}
              raw={openRate(send)}
            />
            <KpiCard
              id={`${send.Id}.ctr`}
              label="CTR"
              value={percent(clickRate(send), 1)}
              raw={clickRate(send)}
            />
            <KpiCard
              id={`${send.Id}.unsubscribes`}
              label="Unsubscribes"
              value={count(send.Unsubscribes)}
              raw={send.Unsubscribes}
            />
            <KpiCard
              id={`${send.Id}.bounces`}
              label="Bounces"
              value={count(send.Bounces)}
              raw={send.Bounces}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent>
          <RecordTable<EmailSend>
            id="email-sends"
            label="Email sends"
            filterable
            rows={sends}
            annotateRow={(e) => emailSendAnnotation(e, lookup.campaignName(e.CampaignId))}
            columns={[
              {
                field: 'Subject',
                header: 'Subject',
                cell: (e) => (
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.Id)}
                    aria-pressed={e.Id === send?.Id}
                    className="text-left font-medium text-primary hover:underline aria-pressed:underline"
                  >
                    {e.Subject}
                  </button>
                ),
              },
              {
                field: 'CampaignId',
                header: 'Campaign',
                cell: (e) => lookup.campaignName(e.CampaignId),
                sortValue: (e) => lookup.campaignName(e.CampaignId) ?? '',
              },
              { field: 'SendDate', header: 'Sent on', cell: (e) => formatDate(e.SendDate) },
              {
                field: 'Delivered',
                header: 'Delivered',
                align: 'right',
                cell: (e) => count(e.Delivered),
              },
              {
                field: 'Opens',
                header: 'Open %',
                align: 'right',
                cell: (e) => percent(openRate(e), 1),
                sortValue: openRate,
              },
              {
                field: 'Clicks',
                header: 'CTR',
                align: 'right',
                cell: (e) => percent(clickRate(e), 1),
                sortValue: clickRate,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
