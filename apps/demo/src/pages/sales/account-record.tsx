import { dci } from '@dci/react';
import { Building2, CalendarClock } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { OwnerAvatar, RecordHeader, RecordTable, RelatedList, StatusBadge } from '@/components/crm';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Contact, Opportunity } from '@/data';
import {
  accountAnnotation,
  contactAnnotation,
  opportunityAnnotation,
  taskAnnotation,
} from '@/lib/annotations';
import { useLookups } from '@/lib/lookups';
import { formatDate, money, moneyShort, useOrg } from '@/lib/org';

/** Deep hierarchy: account › related list › record › field. `CreditLimit` is private. */
export function AccountRecordPage() {
  const { id = '' } = useParams();
  const org = useOrg();
  const lookup = useLookups(org);
  const account = lookup.account(id);
  if (!account) {
    return (
      <p className="text-muted-foreground">
        Account not found.{' '}
        <Link to="/sales/accounts" className="text-primary underline">
          Back to accounts
        </Link>
      </p>
    );
  }
  const owner = lookup.user(account.OwnerId);
  const contacts = org.Contact.filter((c) => c.AccountId === id);
  const opps = org.Opportunity.filter((o) => o.AccountId === id);
  const oppIds = new Set(opps.map((o) => o.Id));
  const activities = org.Task.filter((t) => t.WhatId === id || oppIds.has(t.WhatId)).sort((a, b) =>
    b.ActivityDate.localeCompare(a.ActivityDate),
  );

  return (
    <div className="space-y-6">
      <RecordHeader
        annotation={accountAnnotation(account, owner?.Name)}
        icon={<Building2 className="size-5" />}
        kind="Account"
        title={account.Name}
        fields={[
          { field: 'Industry', label: 'Industry', value: account.Industry },
          {
            field: 'Rating',
            label: 'Rating',
            value: account.Rating,
            display: <StatusBadge value={account.Rating} />,
          },
          {
            field: 'Health',
            label: 'Health',
            value: account.Health,
            display: <StatusBadge value={account.Health} />,
          },
          {
            field: 'OwnerId',
            label: 'Owner',
            value: owner?.Name,
            display: <OwnerAvatar user={owner} />,
          },
          {
            field: 'AnnualRevenue',
            label: 'Annual Revenue',
            value: account.AnnualRevenue,
            display: moneyShort(account.AnnualRevenue),
          },
          {
            field: 'CreditLimit',
            label: 'Credit Limit',
            value: account.CreditLimit,
            display: money(account.CreditLimit),
            private: true,
          },
        ]}
      />
      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities ({opps.length})</TabsTrigger>
          <TabsTrigger value="activities">Activities ({activities.length})</TabsTrigger>
        </TabsList>
        <Card className="mt-2">
          <CardContent>
            <TabsContent value="contacts">
              <RelatedList id={`${id}.contacts`} title="Contacts" count={contacts.length}>
                <RecordTable<Contact>
                  id={`${id}.contacts.table`}
                  label="Contacts"
                  rows={contacts}
                  annotateRow={(c) => contactAnnotation(c, account.Name)}
                  columns={[
                    { field: 'Name', header: 'Name' },
                    { field: 'Title', header: 'Title' },
                    { field: 'Role', header: 'Role' },
                    { field: 'Email', header: 'Email' },
                    { field: 'Phone', header: 'Phone' },
                    { field: 'PersonalMobile', header: 'Personal mobile', private: true },
                  ]}
                />
              </RelatedList>
            </TabsContent>
            <TabsContent value="opportunities">
              <RelatedList id={`${id}.opportunities`} title="Opportunities" count={opps.length}>
                <RecordTable<Opportunity>
                  id={`${id}.opportunities.table`}
                  label="Opportunities"
                  rows={opps}
                  annotateRow={(o) => opportunityAnnotation(o, account.Name)}
                  columns={[
                    { field: 'Name', header: 'Opportunity' },
                    {
                      field: 'StageName',
                      header: 'Stage',
                      cell: (o) => <StatusBadge value={o.StageName} />,
                    },
                    {
                      field: 'Amount',
                      header: 'Amount',
                      align: 'right',
                      cell: (o) => money(o.Amount),
                    },
                    {
                      field: 'CloseDate',
                      header: 'Close Date',
                      cell: (o) => formatDate(o.CloseDate),
                    },
                    { field: 'NextStep', header: 'Next Step' },
                  ]}
                />
              </RelatedList>
            </TabsContent>
            <TabsContent value="activities">
              <RelatedList
                id={`${id}.activities`}
                title="Activity timeline"
                count={activities.length}
              >
                <ol className="relative space-y-3 border-l pl-4 text-sm">
                  {activities.map((t) => (
                    <li key={t.Id} {...dci(taskAnnotation(t))}>
                      <CalendarClock className="absolute -left-2 size-4 bg-card text-muted-foreground" />
                      <div className="font-medium">
                        {t.Subject} <StatusBadge value={t.Status} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.Type} · {formatDate(t.ActivityDate)} ·{' '}
                        {opps.find((o) => o.Id === t.WhatId)?.Name}
                      </div>
                    </li>
                  ))}
                </ol>
              </RelatedList>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
