// Salesforce-style records for the fictional Summit Gear Co. org.
// Field names follow Salesforce API conventions.

export interface User {
  Id: string;
  Name: string;
  Title: string;
  Email: string;
  /** Avatar initials. */
  Alias: string;
}

export type Rating = 'Hot' | 'Warm' | 'Cold';

export interface Account {
  Id: string;
  Name: string;
  Industry: string;
  Type: 'Customer' | 'Prospect' | 'Partner';
  Rating: Rating;
  AnnualRevenue: number;
  BillingCity: string;
  BillingState: string;
  Phone: string;
  Website: string;
  OwnerId: string;
  /** Sensitive: annotated `private` in the UI, so it never reaches the AI. */
  CreditLimit: number;
  /** Derived from open pipeline, stalled deals and recent activity. */
  Health: 'Healthy' | 'At Risk' | 'Critical';
}

export interface Contact {
  Id: string;
  FirstName: string;
  LastName: string;
  Name: string;
  Title: string;
  Email: string;
  Phone: string;
  /** Sensitive: annotated `private` in the UI. */
  PersonalMobile?: string;
  AccountId: string;
  Role: 'Decision Maker' | 'Economic Buyer' | 'Influencer' | 'Evaluator' | 'Technical Buyer';
}

export const OPPORTUNITY_STAGES = [
  'Prospecting',
  'Qualification',
  'Needs Analysis',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface Opportunity {
  Id: string;
  Name: string;
  AccountId: string;
  StageName: OpportunityStage;
  Amount: number;
  CloseDate: string;
  Probability: number;
  NextStep: string;
  LeadSource: string;
  OwnerId: string;
  CreatedDate: string;
}

export interface OpportunityLineItem {
  Id: string;
  OpportunityId: string;
  Product: string;
  Quantity: number;
  UnitPrice: number;
  TotalPrice: number;
}

export type LeadStatus = 'Open' | 'Working' | 'Qualified' | 'Unqualified';

export interface Lead {
  Id: string;
  FirstName: string;
  LastName: string;
  Name: string;
  Company: string;
  Title: string;
  Email: string;
  Status: LeadStatus;
  LeadSource: string;
  Rating: Rating;
  CampaignId: string | null;
  OwnerId: string;
  CreatedDate: string;
  /** `null` when nobody has reached out yet. */
  LastContactedDate: string | null;
}

export interface Task {
  Id: string;
  Subject: string;
  Type: 'Call' | 'Email' | 'Meeting';
  Status: 'Not Started' | 'In Progress' | 'Completed';
  ActivityDate: string;
  /** The related record (account or opportunity). */
  WhatId: string;
  /** The related person (contact or lead). */
  WhoId: string | null;
  OwnerId: string;
}

export interface Campaign {
  Id: string;
  Name: string;
  Type: 'Email' | 'Webinar' | 'Event' | 'Paid Social';
  Status: 'Planned' | 'In Progress' | 'Completed' | 'Aborted';
  StartDate: string;
  EndDate: string;
  Budget: number;
  ActualCost: number;
  LeadsGenerated: number;
  OpportunitiesWon: number;
  WonAmount: number;
  /** Derived: (WonAmount − ActualCost) / ActualCost. */
  ROI: number;
}

export interface EmailSend {
  Id: string;
  Subject: string;
  CampaignId: string;
  SendDate: string;
  Sent: number;
  Delivered: number;
  Opens: number;
  Clicks: number;
  Unsubscribes: number;
  Bounces: number;
}

export type JourneyStepKind = 'Entry' | 'Email' | 'Wait' | 'Decision' | 'Exit';

export interface JourneyStep {
  Id: string;
  Name: string;
  Kind: JourneyStepKind;
  Entered: number;
  Exited: number;
  /** Share of contacts who left the journey here, 0–1. */
  DropOff: number;
  /** Decision splits only. */
  Branches?: JourneyBranch[];
}

export interface JourneyBranch {
  Label: string;
  Steps: JourneyStep[];
}

export interface Journey {
  Id: string;
  Name: string;
  Status: 'Running' | 'Paused' | 'Draft';
  EntrySource: string;
  Steps: JourneyStep[];
}

export interface Segment {
  Id: string;
  Name: string;
  Size: number;
  Criteria: string;
}

export const CHANNELS = ['Email', 'Paid Social', 'Search', 'Events', 'Webinar'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface ChannelMetric {
  /** `YYYY-MM`. */
  Month: string;
  Channel: Channel;
  Spend: number;
  Leads: number;
  Conversions: number;
}

/** Every record type, by object name. */
export interface OrgRecords {
  User: User;
  Account: Account;
  Contact: Contact;
  Opportunity: Opportunity;
  OpportunityLineItem: OpportunityLineItem;
  Lead: Lead;
  Task: Task;
  Campaign: Campaign;
  EmailSend: EmailSend;
  Journey: Journey;
  Segment: Segment;
}

export type OrgObject = keyof OrgRecords;

export type OrgData = { [K in OrgObject]: OrgRecords[K][] } & { ChannelMetric: ChannelMetric[] };
