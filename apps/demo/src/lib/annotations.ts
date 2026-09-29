import type {
  Account,
  Campaign,
  Contact,
  EmailSend,
  Journey,
  JourneyStep,
  Lead,
  Opportunity,
  Segment,
  Task,
} from '@/data';

// How each record is described to the AI, identical everywhere it appears.
// `type` is reserved for the annotation type, so record types use other keys.
// Sensitive fields (CreditLimit, PersonalMobile) are never included here.

export function opportunityAnnotation(o: Opportunity, account?: string) {
  return {
    id: o.Id,
    type: 'opportunity',
    label: o.Name,
    account,
    stage: o.StageName,
    amount: o.Amount,
    closeDate: o.CloseDate,
    probability: o.Probability,
    nextStep: o.NextStep,
  };
}

export function accountAnnotation(a: Account, owner?: string) {
  return {
    id: a.Id,
    type: 'account',
    label: a.Name,
    industry: a.Industry,
    accountType: a.Type,
    rating: a.Rating,
    health: a.Health,
    annualRevenue: a.AnnualRevenue,
    city: `${a.BillingCity}, ${a.BillingState}`,
    owner,
  };
}

export function contactAnnotation(c: Contact, account?: string) {
  return {
    id: c.Id,
    type: 'contact',
    label: c.Name,
    title: c.Title,
    role: c.Role,
    email: c.Email,
    account,
  };
}

export function leadAnnotation(l: Lead, campaign?: string) {
  return {
    id: l.Id,
    type: 'lead',
    label: `${l.Name} (${l.Company})`,
    company: l.Company,
    title: l.Title,
    status: l.Status,
    source: l.LeadSource,
    rating: l.Rating,
    campaign,
    created: l.CreatedDate,
    lastContacted: l.LastContactedDate ?? 'never',
  };
}

export function taskAnnotation(t: Task) {
  return {
    id: t.Id,
    type: 'task',
    label: t.Subject,
    taskType: t.Type,
    status: t.Status,
    due: t.ActivityDate,
    relatedTo: t.WhatId,
  };
}

export function stageAnnotation(stage: string, deals: readonly Opportunity[], today: string) {
  return {
    id: `stage.${stage}`,
    type: 'stage',
    label: stage,
    deals: deals.length,
    total: deals.reduce((s, o) => s + o.Amount, 0),
    overdue: deals.filter((o) => o.CloseDate < today).length,
  };
}

export function campaignAnnotation(c: Campaign) {
  return {
    id: c.Id,
    type: 'campaign',
    label: c.Name,
    campaignType: c.Type,
    status: c.Status,
    budget: c.Budget,
    actualCost: c.ActualCost,
    leads: c.LeadsGenerated,
    opportunitiesWon: c.OpportunitiesWon,
    wonAmount: c.WonAmount,
    roi: c.ROI,
    costPerLead: Math.round(c.ActualCost / Math.max(1, c.LeadsGenerated)),
  };
}

export const openRate = (e: EmailSend) => e.Opens / Math.max(1, e.Delivered);
export const clickRate = (e: EmailSend) => e.Clicks / Math.max(1, e.Delivered);

export function emailSendAnnotation(e: EmailSend, campaign?: string) {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    id: e.Id,
    type: 'email-send',
    label: e.Subject,
    campaign,
    sendDate: e.SendDate,
    sent: e.Sent,
    delivered: e.Delivered,
    opens: e.Opens,
    clicks: e.Clicks,
    openRate: round(openRate(e)),
    clickRate: round(clickRate(e)),
    unsubscribes: e.Unsubscribes,
    bounces: e.Bounces,
  };
}

export function journeyAnnotation(j: Journey) {
  return {
    id: j.Id,
    type: 'journey',
    label: j.Name,
    status: j.Status,
    entrySource: j.EntrySource,
    entered: j.Steps[0]?.Entered ?? 0,
  };
}

export function journeyStepAnnotation(s: JourneyStep) {
  return {
    id: s.Id,
    type: 'journey-step',
    label: s.Name,
    kind: s.Kind,
    entered: s.Entered,
    exited: s.Exited,
    dropOff: s.DropOff,
  };
}

export function segmentAnnotation(s: Segment) {
  return { id: s.Id, type: 'segment', label: s.Name, size: s.Size, criteria: s.Criteria };
}
