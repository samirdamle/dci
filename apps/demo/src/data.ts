export interface Invoice {
  id: string;
  number: string;
  customer: string;
  amount: number;
  due: string;
  status: 'paid' | 'open' | 'overdue';
}

export const INVOICES: Invoice[] = [
  {
    id: 'inv_101',
    number: 'INV-101',
    customer: 'Acme Outdoor',
    amount: 420,
    due: '2026-08-12',
    status: 'overdue',
  },
  {
    id: 'inv_102',
    number: 'INV-102',
    customer: 'Summit Gear',
    amount: 1280,
    due: '2026-09-30',
    status: 'open',
  },
  {
    id: 'inv_103',
    number: 'INV-103',
    customer: 'Acme Retail',
    amount: 96,
    due: '2026-07-01',
    status: 'paid',
  },
  {
    id: 'inv_104',
    number: 'INV-104',
    customer: 'Trailhead Co.',
    amount: 3150,
    due: '2026-08-28',
    status: 'overdue',
  },
];

export interface Opportunity {
  id: string;
  name: string;
  stage: 'Prospecting' | 'Proposal' | 'Negotiation';
  value: number;
}

export const OPPORTUNITIES: Opportunity[] = [
  { id: 'opp_1', name: 'Tents for Alpine Club', stage: 'Proposal', value: 18000 },
  { id: 'opp_2', name: 'Winter jackets restock', stage: 'Negotiation', value: 42000 },
  { id: 'opp_3', name: 'School trip kits', stage: 'Prospecting', value: 7500 },
  { id: 'opp_4', name: 'Climbing wall gear', stage: 'Proposal', value: 23000 },
  { id: 'opp_5', name: 'Kayak fleet', stage: 'Prospecting', value: 61000 },
  { id: 'opp_6', name: 'Trail running sponsorship', stage: 'Negotiation', value: 15000 },
];

/** Serialize a `data-dci` payload. */
export const dci = (payload: Record<string, unknown>) => JSON.stringify(payload);
