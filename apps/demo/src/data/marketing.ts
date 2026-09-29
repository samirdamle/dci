import { dayOffset, PREFIX, sfId, type Random } from './random';
import {
  CHANNELS,
  type Campaign,
  type ChannelMetric,
  type EmailSend,
  type Journey,
  type JourneyStep,
  type Segment,
} from './types';

export interface MarketingData {
  Campaign: Campaign[];
  EmailSend: EmailSend[];
  Journey: Journey[];
  Segment: Segment[];
  ChannelMetric: ChannelMetric[];
}

const CAMPAIGNS: Array<[string, Campaign['Type']]> = [
  ['Spring Trail Webinar', 'Webinar'],
  ['Summit Sale – Email Blast', 'Email'],
  ['Backcountry Expo 2026', 'Event'],
  ['Ultralight Launch – Paid Social', 'Paid Social'],
  ['Retail Partner Newsletter', 'Email'],
  ['Campus Outdoor Clubs', 'Event'],
  ['Winter Layering Guide', 'Email'],
  ['Trail Running Community', 'Paid Social'],
  ['Wholesale Buyer Roundtable', 'Webinar'],
  ['Holiday Gift Guide', 'Email'],
  ['Park Ranger Program', 'Event'],
  ['Retargeting – Abandoned Quotes', 'Paid Social'],
];

const SUBJECTS = [
  'New season, new gear',
  'Your wholesale price sheet',
  'Last chance: Summit Sale',
  'Layer up for winter',
  'Meet the Ultralight line',
  'Trail-tested by our team',
  'Restock before the rush',
  'Invitation: buyer roundtable',
];

export function generateMarketing(r: Random, today: Date): MarketingData {
  const day = (offset: number) => dayOffset(today, offset);

  const Campaign: Campaign[] = CAMPAIGNS.map(([Name, Type], i) => {
    const start = -r.int(10, 200);
    const Budget = r.round(8_000, 60_000, 1_000);
    const ActualCost = Math.round(Budget * (0.6 + r.next() * 0.5));
    const LeadsGenerated = r.int(40, 400);
    const OpportunitiesWon = r.int(2, 18);
    const WonAmount = OpportunitiesWon * r.round(6_000, 22_000, 500);
    return {
      Id: sfId(PREFIX.Campaign, i + 1),
      Name,
      Type,
      Status:
        start < -120
          ? 'Completed'
          : start < -30
            ? 'In Progress'
            : r.pick(['Planned', 'In Progress'] as const),
      StartDate: day(start),
      EndDate: day(start + r.int(20, 90)),
      Budget,
      ActualCost,
      LeadsGenerated,
      OpportunitiesWon,
      WonAmount,
      ROI: 0,
    };
  });
  // Story hook: high spend, few leads, poor return.
  Object.assign(Campaign[0]!, {
    Status: 'Completed',
    Budget: 40_000,
    ActualCost: 42_000,
    LeadsGenerated: 18,
    OpportunitiesWon: 1,
    WonAmount: 9_500,
  } satisfies Partial<Campaign>);
  for (const c of Campaign)
    c.ROI = Math.round(((c.WonAmount - c.ActualCost) / c.ActualCost) * 100) / 100;

  const emailCampaigns = Campaign.filter((c) => c.Type === 'Email' || c.Type === 'Webinar');
  const EmailSend: EmailSend[] = Array.from({ length: 30 }, (_, i) => {
    const Sent = r.round(2_000, 40_000, 100);
    const Bounces = Math.round(Sent * (0.005 + r.next() * 0.02));
    const Delivered = Sent - Bounces;
    const Opens = Math.round(Delivered * (0.18 + r.next() * 0.17));
    return {
      Id: sfId(PREFIX.EmailSend, i + 1),
      Subject: SUBJECTS[i % SUBJECTS.length]!,
      CampaignId: emailCampaigns[i % emailCampaigns.length]!.Id,
      SendDate: day(-r.int(1, 180)),
      Sent,
      Delivered,
      Opens,
      Clicks: Math.round(Opens * (0.08 + r.next() * 0.15)),
      Unsubscribes: Math.round(Delivered * r.next() * 0.004),
      Bounces,
    };
  });
  // Story hook: an abnormally low open rate (spam-folder subject line).
  const lowOpen = EmailSend[2]!;
  Object.assign(lowOpen, {
    Subject: 'LAST CHANCE!!! Summit Sale ends TONIGHT – 70% OFF',
    Opens: Math.round(lowOpen.Delivered * 0.041),
    Clicks: Math.round(lowOpen.Delivered * 0.004),
  } satisfies Partial<EmailSend>);

  let stepN = 0;
  const step = (
    Name: string,
    Kind: JourneyStep['Kind'],
    Entered: number,
    dropOff: number,
    Branches?: JourneyStep['Branches'],
  ): JourneyStep => ({
    Id: sfId(PREFIX.JourneyStep, ++stepN),
    Name,
    Kind,
    Entered,
    Exited: Math.round(Entered * dropOff),
    DropOff: dropOff,
    ...(Branches ? { Branches } : {}),
  });
  const journey = (
    i: number,
    Name: string,
    Status: Journey['Status'],
    EntrySource: string,
    entered: number,
  ): Journey => {
    const a = entered;
    const b = Math.round(a * 0.94);
    const opened = Math.round(b * 0.55);
    const notOpened = b - opened;
    // Story hook (first journey): a step where most contacts drop off.
    const careDrop = i === 0 ? 0.62 : 0.12;
    return {
      Id: sfId(PREFIX.Journey, i + 1),
      Name,
      Status,
      EntrySource,
      Steps: [
        step('Entry: ' + EntrySource, 'Entry', a, 0),
        step('Welcome email', 'Email', a, 0.06),
        step('Wait 3 days', 'Wait', b, 0),
        step('Opened welcome email?', 'Decision', b, 0, [
          {
            Label: 'Opened',
            Steps: [
              step('Gear care tips email', 'Email', opened, careDrop),
              step('Wait 5 days', 'Wait', Math.round(opened * (1 - careDrop)), 0),
              step('Product review request', 'Email', Math.round(opened * (1 - careDrop)), 0.2),
            ],
          },
          {
            Label: 'Not opened',
            Steps: [
              step('Resend with new subject', 'Email', notOpened, 0.3),
              step('Exit', 'Exit', Math.round(notOpened * 0.7), 1),
            ],
          },
        ]),
      ],
    };
  };
  const Journey: Journey[] = [
    journey(0, 'New Customer Onboarding', 'Running', 'First purchase', 4_200),
    journey(1, 'Wholesale Buyer Nurture', 'Running', 'Lead qualified', 860),
    journey(2, 'Win-back Lapsed Retailers', 'Paused', 'No order in 180 days', 1_450),
    journey(3, 'Webinar Follow-up', 'Draft', 'Webinar attended', 0),
  ];

  const Segment: Segment[] = [
    [
      'Independent retailers (West)',
      'Account Type = Customer AND Region = West AND Employees < 50',
    ],
    ['Wholesale buyers – high intent', 'Lead Rating = Hot AND Visited pricing page in 14 days'],
    ['Campus outdoor clubs', 'Industry = Education AND Tag = Outdoor Club'],
    ['Lapsed retailers', 'Last order > 180 days ago'],
    ['Ultralight enthusiasts', 'Clicked Ultralight content ≥ 2 times'],
    ['Webinar attendees (Q2)', 'Attended any webinar in Q2'],
    ['Park & government buyers', 'Industry = Government'],
    ['Newsletter subscribers', 'Opted in to newsletter'],
  ].map(([Name, Criteria], i) => ({
    Id: sfId(PREFIX.Segment, i + 1),
    Name: Name!,
    Criteria: Criteria!,
    Size: r.round(300, 24_000, 10),
  }));

  const ChannelMetric: ChannelMetric[] = [];
  for (let m = 11; m >= 0; m--) {
    const d = new Date(Date.UTC(today.getFullYear(), today.getMonth() - m, 1));
    const Month = d.toISOString().slice(0, 7);
    for (const Channel of CHANNELS) {
      const Spend = r.round(3_000, 25_000, 100);
      const Leads = Math.round(Spend / r.int(60, 220));
      ChannelMetric.push({
        Month,
        Channel,
        Spend,
        Leads,
        Conversions: Math.round(Leads * (0.05 + r.next() * 0.15)),
      });
    }
  }

  return { Campaign, EmailSend, Journey, Segment, ChannelMetric };
}
