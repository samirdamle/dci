import { PageHeader, RecordTable, StatusBadge } from '@/components/crm';
import { Card, CardContent } from '@/components/ui/card';
import type { Campaign } from '@/data';
import { campaignAnnotation } from '@/lib/annotations';
import { count, money, percent, useOrg } from '@/lib/org';

export function CampaignsPage() {
  const org = useOrg();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        hint={
          <>
            <kbd>Alt</kbd>+drag across a few campaigns and ask where to shift budget.
          </>
        }
      />
      <Card>
        <CardContent>
          <RecordTable<Campaign>
            id="campaigns"
            label="Campaigns"
            filterable
            rows={org.Campaign}
            annotateRow={campaignAnnotation}
            columns={[
              { field: 'Name', header: 'Campaign' },
              { field: 'Type', header: 'Type' },
              { field: 'Status', header: 'Status', cell: (c) => <StatusBadge value={c.Status} /> },
              { field: 'Budget', header: 'Budget', align: 'right', cell: (c) => money(c.Budget) },
              {
                field: 'ActualCost',
                header: 'Actual Cost',
                align: 'right',
                cell: (c) => money(c.ActualCost),
              },
              {
                field: 'LeadsGenerated',
                header: 'Leads',
                align: 'right',
                cell: (c) => count(c.LeadsGenerated),
              },
              { field: 'OpportunitiesWon', header: 'Opps Won', align: 'right' },
              {
                field: 'ROI',
                header: 'ROI',
                align: 'right',
                cell: (c) => (
                  <StatusBadge
                    value={percent(c.ROI)}
                    tone={c.ROI < 0 ? 'bad' : c.ROI < 1 ? 'warn' : 'good'}
                  />
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
