import { Link } from 'react-router';
import { OwnerAvatar, PageHeader, RecordTable, StatusBadge } from '@/components/crm';
import { Card, CardContent } from '@/components/ui/card';
import type { Account } from '@/data';
import { accountAnnotation } from '@/lib/annotations';
import { useLookups } from '@/lib/lookups';
import { moneyShort, useOrg } from '@/lib/org';

export function AccountsPage() {
  const org = useOrg();
  const lookup = useLookups(org);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        hint="Open an account to see its contacts, deals and activity."
      />
      <Card>
        <CardContent>
          <RecordTable<Account>
            id="accounts"
            label="Accounts"
            filterable
            rows={org.Account}
            annotateRow={(a) => accountAnnotation(a, lookup.userName(a.OwnerId))}
            columns={[
              {
                field: 'Name',
                header: 'Account',
                cell: (a) => (
                  <Link
                    to={`/sales/accounts/${a.Id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {a.Name}
                  </Link>
                ),
              },
              { field: 'Industry', header: 'Industry' },
              { field: 'Type', header: 'Type' },
              { field: 'Rating', header: 'Rating', cell: (a) => <StatusBadge value={a.Rating} /> },
              { field: 'Health', header: 'Health', cell: (a) => <StatusBadge value={a.Health} /> },
              {
                field: 'AnnualRevenue',
                header: 'Annual Revenue',
                align: 'right',
                cell: (a) => moneyShort(a.AnnualRevenue),
              },
              {
                field: 'BillingCity',
                header: 'City',
                cell: (a) => `${a.BillingCity}, ${a.BillingState}`,
              },
              {
                field: 'OwnerId',
                header: 'Owner',
                cell: (a) => <OwnerAvatar user={lookup.user(a.OwnerId)} />,
                sortValue: (a) => lookup.userName(a.OwnerId) ?? '',
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
