import { dayOffset, PREFIX, sfId, type Random } from './random';
import type {
  Account,
  Contact,
  Lead,
  LeadStatus,
  Opportunity,
  OpportunityLineItem,
  OpportunityStage,
  Task,
  User,
} from './types';

const FIRST = [
  'Avery',
  'Blake',
  'Casey',
  'Dana',
  'Elliot',
  'Finley',
  'Gray',
  'Harper',
  'Indigo',
  'Jules',
  'Kai',
  'Logan',
  'Morgan',
  'Noor',
  'Oakley',
  'Parker',
  'Quinn',
  'Riley',
  'Sage',
  'Tatum',
  'Uma',
  'Val',
  'Wren',
  'Yael',
  'Zion',
];
const LAST = [
  'Alvarez',
  'Brooks',
  'Chen',
  'Diaz',
  'Ellis',
  'Fischer',
  'Garcia',
  'Hughes',
  'Ito',
  'Jensen',
  'Kowalski',
  'Lee',
  'Mensah',
  'Novak',
  'Okafor',
  'Patel',
  'Reyes',
  'Singh',
  'Tanaka',
  'Umar',
  'Vargas',
  'Walsh',
  'Young',
  'Zhang',
];
const COMPANY_A = [
  'Alpine',
  'Basecamp',
  'Cascade',
  'Desert',
  'Evergreen',
  'Fjord',
  'Glacier',
  'Highland',
  'Ironwood',
  'Juniper',
  'Kestrel',
  'Lakeside',
  'Mesa',
  'Northstar',
  'Old Pine',
  'Pinnacle',
  'Quarry',
  'Redwood',
  'Sierra',
  'Timberline',
  'Upland',
  'Valley',
  'Wildflower',
  'Yellowstone Trail',
  'Zephyr',
];
const COMPANY_B = [
  'Outfitters',
  'Co.',
  'Sports',
  'Adventures',
  'Supply',
  'Gear Shop',
  'Expeditions',
  'Mountain Store',
];
const INDUSTRY = ['Retail', 'Hospitality', 'Education', 'Government', 'Recreation', 'Nonprofit'];
const CITY: Array<[string, string]> = [
  ['Denver', 'CO'],
  ['Boulder', 'CO'],
  ['Seattle', 'WA'],
  ['Portland', 'OR'],
  ['Bend', 'OR'],
  ['Salt Lake City', 'UT'],
  ['Bozeman', 'MT'],
  ['Boise', 'ID'],
  ['Flagstaff', 'AZ'],
  ['Asheville', 'NC'],
];
const TITLES = [
  'Store Manager',
  'Buyer',
  'Purchasing Director',
  'Operations Lead',
  'Owner',
  'Program Director',
  'Merchandising VP',
];
const ROLES: Contact['Role'][] = [
  'Decision Maker',
  'Economic Buyer',
  'Influencer',
  'Evaluator',
  'Technical Buyer',
];
const SOURCES = ['Web', 'Referral', 'Trade Show', 'Webinar', 'Partner', 'Email Campaign'];
const PRODUCTS: Array<[string, number]> = [
  ['Summit 4P Tent', 420],
  ['Ridge 2P Tent', 260],
  ['Trailhead 45L Pack', 180],
  ['Daypack 22L', 75],
  ['Storm Shell Jacket', 210],
  ['Down Sleeping Bag', 290],
  ['Trekking Poles (pair)', 95],
  ['Camp Stove Kit', 120],
];
const NEXT_STEPS = [
  'Send revised quote',
  'Schedule product demo',
  'Confirm budget with buyer',
  'Legal review of terms',
  'Sample shipment',
  'Follow-up call',
  'Present volume pricing',
];

const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  Prospecting: 10,
  Qualification: 20,
  'Needs Analysis': 40,
  Proposal: 60,
  Negotiation: 80,
  'Closed Won': 100,
  'Closed Lost': 0,
};
const OPEN_STAGES: OpportunityStage[] = [
  'Prospecting',
  'Qualification',
  'Needs Analysis',
  'Proposal',
  'Negotiation',
];

export interface SalesData {
  User: User[];
  Account: Account[];
  Contact: Contact[];
  Opportunity: Opportunity[];
  OpportunityLineItem: OpportunityLineItem[];
  Lead: Lead[];
  Task: Task[];
}

export function generateSales(r: Random, today: Date, campaignIds: string[]): SalesData {
  const day = (offset: number) => dayOffset(today, offset);
  const person = () => {
    const FirstName = r.pick(FIRST);
    const LastName = r.pick(LAST);
    return { FirstName, LastName, Name: `${FirstName} ${LastName}` };
  };
  const email = (name: string, domain: string) =>
    `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${domain}`;
  const phone = () => `(${r.int(200, 989)}) 555-${String(r.int(100, 9999)).padStart(4, '0')}`;

  const User: User[] = [
    ['Maya Brooks', 'Regional Sales Director'],
    ['Leo Park', 'Account Executive'],
    ['Priya Nair', 'Account Executive'],
    ['Sam Ortiz', 'Account Executive'],
    ['Ines Carter', 'Sales Development Rep'],
    ['Theo Walsh', 'Sales Development Rep'],
  ].map(([Name, Title], i) => ({
    Id: sfId(PREFIX.User, i + 1),
    Name: Name!,
    Title: Title!,
    Email: email(Name!, 'summitgear.example'),
    Alias: Name!
      .split(' ')
      .map((w) => w[0])
      .join(''),
  }));
  const reps = User.slice(1);

  const usedNames = new Set<string>();
  const Account: Account[] = Array.from({ length: 25 }, (_, i) => {
    let Name: string;
    do Name = `${r.pick(COMPANY_A)} ${r.pick(COMPANY_B)}`;
    while (usedNames.has(Name));
    usedNames.add(Name);
    const [BillingCity, BillingState] = r.pick(CITY);
    return {
      Id: sfId(PREFIX.Account, i + 1),
      Name,
      Industry: r.pick(INDUSTRY),
      Type: r.pick(['Customer', 'Customer', 'Prospect', 'Partner'] as const),
      Rating: r.pick(['Hot', 'Warm', 'Warm', 'Cold'] as const),
      AnnualRevenue: r.round(500_000, 40_000_000, 50_000),
      BillingCity,
      BillingState,
      Phone: phone(),
      Website: `www.${Name.toLowerCase().replace(/[^a-z]+/g, '')}.example`,
      OwnerId: r.pick(reps).Id,
      CreditLimit: r.round(10_000, 250_000, 5_000),
      Health: 'Healthy',
    };
  });

  const Contact: Contact[] = Array.from({ length: 80 }, (_, i) => {
    const account = Account[i % Account.length]!;
    const p = person();
    return {
      Id: sfId(PREFIX.Contact, i + 1),
      ...p,
      Title: r.pick(TITLES),
      Email: email(p.Name, account.Website.replace(/^www\./, '')),
      Phone: phone(),
      ...(r.chance(0.3) ? { PersonalMobile: phone() } : {}),
      AccountId: account.Id,
      Role: r.pick(ROLES),
    };
  });

  const Opportunity: Opportunity[] = Array.from({ length: 60 }, (_, i) => {
    const account = r.pick(Account);
    const [product] = r.pick(PRODUCTS);
    const qty = r.round(20, 400, 10);
    const StageName: OpportunityStage =
      i < 12 ? (i % 3 === 0 ? 'Closed Lost' : 'Closed Won') : r.pick(OPEN_STAGES);
    const closed = StageName.startsWith('Closed');
    return {
      Id: sfId(PREFIX.Opportunity, i + 1),
      Name: `${account.Name} – ${qty} × ${product}`,
      AccountId: account.Id,
      StageName,
      Amount: r.round(8_000, 180_000, 500),
      CloseDate: day(closed ? -r.int(5, 85) : r.int(3, 75)),
      Probability: STAGE_PROBABILITY[StageName],
      NextStep: closed ? '' : r.pick(NEXT_STEPS),
      LeadSource: r.pick(SOURCES),
      OwnerId: account.OwnerId,
      CreatedDate: day(-r.int(20, 160)),
    };
  });

  // Story hook: stalled deals, still open but past their close date.
  for (const [i, overdue] of [
    [12, 12],
    [13, 26],
    [14, 41],
  ] as const) {
    const opp = Opportunity[i]!;
    opp.StageName = i === 14 ? 'Proposal' : 'Negotiation';
    opp.Probability = STAGE_PROBABILITY[opp.StageName];
    opp.CloseDate = day(-overdue);
    opp.NextStep = 'Waiting on customer (no reply)';
  }
  // A recognizable flagship deal for demos and tests.
  const alpine = Account.find((a) => a.Name.startsWith('Alpine')) ?? Account[0]!;
  Object.assign(Opportunity[15]!, {
    Name: `${alpine.Name} – 200 Tents`,
    AccountId: alpine.Id,
    OwnerId: alpine.OwnerId,
    StageName: 'Proposal',
    Probability: STAGE_PROBABILITY.Proposal,
    Amount: 84_000,
    CloseDate: day(9),
    NextStep: 'Present volume pricing',
  } satisfies Partial<Opportunity>);

  const OpportunityLineItem: OpportunityLineItem[] = Array.from({ length: 150 }, (_, i) => {
    const [Product, UnitPrice] = r.pick(PRODUCTS);
    const Quantity = r.round(10, 200, 5);
    return {
      Id: sfId(PREFIX.OpportunityLineItem, i + 1),
      OpportunityId: Opportunity[i % Opportunity.length]!.Id,
      Product,
      Quantity,
      UnitPrice,
      TotalPrice: Quantity * UnitPrice,
    };
  });

  const LEAD_STATUS: LeadStatus[] = ['Open', 'Working', 'Working', 'Qualified', 'Unqualified'];
  const Lead: Lead[] = Array.from({ length: 40 }, (_, i) => {
    const p = person();
    const Company = `${r.pick(COMPANY_A)} ${r.pick(COMPANY_B)}`;
    const Status = r.pick(LEAD_STATUS);
    return {
      Id: sfId(PREFIX.Lead, i + 1),
      ...p,
      Company,
      Title: r.pick(TITLES),
      Email: email(p.Name, `${Company.toLowerCase().replace(/[^a-z]+/g, '')}.example`),
      Status,
      LeadSource: r.pick(SOURCES),
      Rating: r.pick(['Hot', 'Warm', 'Cold', 'Cold'] as const),
      CampaignId: r.chance(0.6) ? r.pick(campaignIds) : null,
      OwnerId: r.pick(reps).Id,
      CreatedDate: day(-r.int(4, 90)),
      LastContactedDate: Status === 'Open' ? null : day(-r.int(1, 30)),
    };
  });
  // Story hook: a hot lead nobody has contacted.
  Object.assign(Lead[0]!, {
    FirstName: 'Jordan',
    LastName: 'Park',
    Name: 'Jordan Park',
    Company: 'Ridgeline Outfitters',
    Title: 'Purchasing Director',
    Email: 'jordan.park@ridgelineoutfitters.example',
    Status: 'Open',
    Rating: 'Hot',
    LeadSource: 'Webinar',
    CreatedDate: day(-3),
    LastContactedDate: null,
  } satisfies Partial<Lead>);

  const SUBJECTS: Record<Task['Type'], string[]> = {
    Call: ['Discovery call', 'Pricing call', 'Check-in call'],
    Email: ['Send catalog', 'Send revised quote', 'Share case study'],
    Meeting: ['On-site demo', 'Quarterly business review', 'Contract walkthrough'],
  };
  const Task: Task[] = Array.from({ length: 120 }, (_, i) => {
    const opp = Opportunity[i % Opportunity.length]!;
    const Type = r.pick(['Call', 'Email', 'Meeting'] as const);
    const offset = r.int(-40, 20);
    const contacts = Contact.filter((c) => c.AccountId === opp.AccountId);
    return {
      Id: sfId(PREFIX.Task, i + 1),
      Subject: r.pick(SUBJECTS[Type]),
      Type,
      Status: offset < 0 ? 'Completed' : r.pick(['Not Started', 'In Progress'] as const),
      ActivityDate: day(offset),
      WhatId: opp.Id,
      WhoId: contacts.length ? r.pick(contacts).Id : null,
      OwnerId: opp.OwnerId,
    };
  });

  // Derived account health: stalled deals and quiet accounts are at risk.
  const todayStr = day(0);
  for (const account of Account) {
    const open = Opportunity.filter(
      (o) => o.AccountId === account.Id && !o.StageName.startsWith('Closed'),
    );
    const stalled = open.filter((o) => o.CloseDate < todayStr).length;
    const lost = Opportunity.filter(
      (o) => o.AccountId === account.Id && o.StageName === 'Closed Lost',
    ).length;
    account.Health =
      stalled > 1 || (stalled && lost) ? 'Critical' : stalled || lost ? 'At Risk' : 'Healthy';
  }

  return { User, Account, Contact, Opportunity, OpportunityLineItem, Lead, Task };
}
