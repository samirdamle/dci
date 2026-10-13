import { dci } from '@samirdamle/dci-react';
import { Card } from '@/components/ui/card';
import { SAMPLE_DEALS, type SampleDeal } from './tour-data';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export function SampleDealCard({ deal }: { deal: SampleDeal }) {
  return (
    <Card
      className="cursor-default gap-1 p-3 text-sm shadow-xs select-none"
      {...dci({
        id: deal.id,
        type: 'opportunity',
        label: deal.name,
        account: deal.account,
        stage: deal.stage,
        amount: deal.amount,
        probability: deal.probability,
      })}
    >
      <p className="truncate font-medium">{deal.name}</p>
      <p className="text-xs text-muted-foreground">
        {deal.stage} · {money(deal.amount)}
      </p>
    </Card>
  );
}

export function SampleDeals({ deals = SAMPLE_DEALS }: { deals?: readonly SampleDeal[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {deals.map((deal) => (
        <SampleDealCard key={deal.id} deal={deal} />
      ))}
    </div>
  );
}
