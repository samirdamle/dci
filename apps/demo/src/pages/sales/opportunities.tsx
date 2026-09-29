import { Card, CardContent } from '@/components/ui/card';
import { OwnerAvatar, PageHeader, RecordTable, StatusBadge } from '@/components/crm';
import type { Opportunity } from '@/data';
import { opportunityAnnotation } from '@/lib/annotations';
import { useLookups } from '@/lib/lookups';
import { formatDate, money, today, useOrg } from '@/lib/org';

/** The window-select showcase: Alt+Drag across rows to pick several deals. */
export function OpportunitiesPage() {
  const org = useOrg();
  const lookup = useLookups(org);
  const now = today();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunities"
        hint={
          <>
            <kbd>Alt</kbd>+drag across rows to select several deals, then ask to compare or update
            them.
          </>
        }
      />
      <Card>
        <CardContent>
          <RecordTable<Opportunity>
            id="opportunities"
            label="Opportunities"
            filterable
            rows={org.Opportunity}
            annotateRow={(o) => opportunityAnnotation(o, lookup.accountName(o.AccountId))}
            columns={[
              { field: 'Name', header: 'Opportunity', wrap: true },
              {
                field: 'AccountId',
                header: 'Account',
                cell: (o) => lookup.accountName(o.AccountId),
                sortValue: (o) => lookup.accountName(o.AccountId) ?? '',
              },
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
                      o.CloseDate < now && !o.StageName.startsWith('Closed')
                        ? 'font-medium text-red-700 dark:text-red-400'
                        : ''
                    }
                  >
                    {formatDate(o.CloseDate)}
                  </span>
                ),
              },
              {
                field: 'OwnerId',
                header: 'Owner',
                cell: (o) => <OwnerAvatar user={lookup.user(o.OwnerId)} />,
                sortValue: (o) => lookup.userName(o.OwnerId) ?? '',
              },
              { field: 'NextStep', header: 'Next Step', wrap: true },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
