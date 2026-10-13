export interface SampleDeal {
  id: string;
  name: string;
  account: string;
  stage: string;
  amount: number;
  probability: number;
}

/** Made-up deals to practise on; same `type`, so double-click selects them all. */
export const SAMPLE_DEALS: readonly SampleDeal[] = [
  {
    id: 'tour.deal-1',
    name: 'Alpine Outfitters renewal',
    account: 'Alpine Outfitters',
    stage: 'Negotiation',
    amount: 48000,
    probability: 80,
  },
  {
    id: 'tour.deal-2',
    name: 'Basecamp Supply expansion',
    account: 'Basecamp Supply',
    stage: 'Proposal',
    amount: 22500,
    probability: 60,
  },
  {
    id: 'tour.deal-3',
    name: 'Ridge Runner new store',
    account: 'Ridge Runner',
    stage: 'Qualification',
    amount: 91000,
    probability: 20,
  },
  {
    id: 'tour.deal-4',
    name: 'Trailhead Co. upsell',
    account: 'Trailhead Co.',
    stage: 'Prospecting',
    amount: 15200,
    probability: 10,
  },
];

export const SAMPLE_COUNT = SAMPLE_DEALS.length;

/** Width of the tour's docked chat; the dialog centres in the space left of it. */
export const TOUR_CHAT_WIDTH = 360;
