import { OwnerAvatar, PageHeader, RecordTable, StatusBadge } from '@/components/crm';
import { Card, CardContent } from '@/components/ui/card';
import type { Lead } from '@/data';
import { leadAnnotation } from '@/lib/annotations';
import { useLookups } from '@/lib/lookups';
import { formatDate, useOrg } from '@/lib/org';

export function LeadsPage() {
  const org = useOrg();
  const lookup = useLookups(org);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        hint="Try the hot lead nobody has contacted yet: ask the AI to qualify it or draft outreach."
      />
      <Card>
        <CardContent>
          <RecordTable<Lead>
            id="leads"
            label="Leads"
            filterable
            rows={org.Lead}
            annotateRow={(l) => leadAnnotation(l, lookup.campaignName(l.CampaignId))}
            columns={[
              { field: 'Name', header: 'Name' },
              { field: 'Company', header: 'Company' },
              { field: 'Status', header: 'Status', cell: (l) => <StatusBadge value={l.Status} /> },
              { field: 'LeadSource', header: 'Source' },
              { field: 'Rating', header: 'Rating', cell: (l) => <StatusBadge value={l.Rating} /> },
              {
                field: 'CampaignId',
                header: 'Campaign',
                cell: (l) => lookup.campaignName(l.CampaignId) ?? '—',
                sortValue: (l) => lookup.campaignName(l.CampaignId) ?? '',
              },
              {
                field: 'LastContactedDate',
                header: 'Last contacted',
                cell: (l) =>
                  l.LastContactedDate ? (
                    formatDate(l.LastContactedDate)
                  ) : (
                    <span className="text-amber-800 dark:text-amber-300">Never</span>
                  ),
                sortValue: (l) => l.LastContactedDate ?? '',
              },
              {
                field: 'OwnerId',
                header: 'Owner',
                cell: (l) => <OwnerAvatar user={lookup.user(l.OwnerId)} />,
                sortValue: (l) => lookup.userName(l.OwnerId) ?? '',
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
