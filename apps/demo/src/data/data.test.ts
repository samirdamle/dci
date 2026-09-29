import { describe, expect, it, vi } from 'vitest';
import {
  createOrgStore,
  generateOrg,
  objectOf,
  sfId,
  type JourneyStep,
  type OrgData,
} from './index';

const TODAY = new Date(2026, 8, 29); // a fixed "today" for stable snapshots
/** FNV-1a over the JSON: any change to any record changes the digest. */
const digest = (data: OrgData) => {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(data)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
};

describe('generateOrg', () => {
  it('is deterministic for a seed and date', () => {
    const a = generateOrg(TODAY);
    const b = generateOrg(TODAY);
    expect(digest(a)).toBe(digest(b));
    const counts = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.length]));
    expect({ counts, digest: digest(a) }).toMatchSnapshot();
  });

  it('keeps dates relative to today', () => {
    const later = generateOrg(new Date(2026, 9, 29));
    const now = generateOrg(TODAY);
    expect(later.Opportunity[15]!.CloseDate).toBe('2026-11-07');
    expect(now.Opportunity[15]!.CloseDate).toBe('2026-10-08');
  });

  it('uses 18-character ids with Salesforce key prefixes and checksums', () => {
    const org = generateOrg(TODAY);
    expect(org.Account[0]!.Id).toMatch(/^001[A-Za-z0-9]{15}$/);
    expect(org.Opportunity[0]!.Id.startsWith('006')).toBe(true);
    expect(org.Lead[0]!.Id.startsWith('00Q')).toBe(true);
    // The suffix encodes which of the first 15 characters are upper case.
    expect(sfId('006', 1).slice(15)).toBe('IAA');
    expect(objectOf(org.Campaign[0]!.Id)).toBe('Campaign');
  });

  it('resolves every lookup id', () => {
    const org = generateOrg(TODAY);
    const ids = new Set(
      (Object.values(org) as Array<Array<{ Id?: string }>>)
        .flat()
        .flatMap((r) => (r.Id ? [r.Id] : [])),
    );
    const refs: Array<[string, string | null]> = [
      ...org.Account.map((a) => ['Account.OwnerId', a.OwnerId] as [string, string]),
      ...org.Contact.map((c) => ['Contact.AccountId', c.AccountId] as [string, string]),
      ...org.Opportunity.flatMap((o) => [
        ['Opportunity.AccountId', o.AccountId] as [string, string],
        ['Opportunity.OwnerId', o.OwnerId] as [string, string],
      ]),
      ...org.OpportunityLineItem.map(
        (l) => ['LineItem.OpportunityId', l.OpportunityId] as [string, string],
      ),
      ...org.Lead.flatMap((l) => [
        ['Lead.OwnerId', l.OwnerId] as [string, string],
        ['Lead.CampaignId', l.CampaignId] as [string, string | null],
      ]),
      ...org.Task.flatMap((t) => [
        ['Task.WhatId', t.WhatId] as [string, string],
        ['Task.WhoId', t.WhoId] as [string, string | null],
      ]),
      ...org.EmailSend.map((e) => ['EmailSend.CampaignId', e.CampaignId] as [string, string]),
    ];
    const broken = refs.filter(([, id]) => id !== null && !ids.has(id));
    expect(broken).toEqual([]);
  });

  it('contains the story hooks', () => {
    const org = generateOrg(TODAY);
    const today = '2026-09-29';
    const stalled = org.Opportunity.filter(
      (o) => !o.StageName.startsWith('Closed') && o.CloseDate < today,
    );
    expect(stalled.length).toBeGreaterThanOrEqual(3);
    expect(org.Campaign.find((c) => c.Name === 'Spring Trail Webinar')).toMatchObject({
      ActualCost: 42_000,
      LeadsGenerated: 18,
    });
    expect(Math.min(...org.EmailSend.map((e) => e.Opens / e.Delivered))).toBeLessThan(0.05);
    expect(org.Lead.find((l) => l.Name === 'Jordan Park')).toMatchObject({
      Rating: 'Hot',
      LastContactedDate: null,
    });
    const steps = (s: JourneyStep[]): JourneyStep[] =>
      s.flatMap((x) => [x, ...(x.Branches ?? []).flatMap((b) => steps(b.Steps))]);
    expect(
      steps(org.Journey[0]!.Steps).find((s) => s.Name === 'Gear care tips email')?.DropOff,
    ).toBe(0.62);
    expect(org.Opportunity.some((o) => o.Name.endsWith('200 Tents'))).toBe(true);
  });
});

describe('store', () => {
  it('updates immutably, recomputes derived fields and notifies', () => {
    const store = createOrgStore(generateOrg(TODAY));
    const before = store.data();
    const opp = store.list('Opportunity', { StageName: 'Prospecting' })[0]!;
    const fn = vi.fn();
    store.subscribe(fn);
    const next = store.update('Opportunity', opp.Id, { StageName: 'Negotiation' });
    expect(next).toMatchObject({ StageName: 'Negotiation', Probability: 80 });
    expect(fn).toHaveBeenCalledWith({ type: 'update', object: 'Opportunity', id: opp.Id });
    expect(store.data()).not.toBe(before);
    expect(before.Opportunity.find((o) => o.Id === opp.Id)?.StageName).toBe('Prospecting');
    expect(store.getById(opp.Id)?.record).toBe(next);
  });

  it('creates records with fresh ids and finds nested journey steps', () => {
    const store = createOrgStore(generateOrg(TODAY));
    const opp = store.data().Opportunity[0]!;
    const task = store.create('Task', {
      Subject: 'Follow up',
      Type: 'Call',
      Status: 'Not Started',
      ActivityDate: '2026-10-01',
      WhatId: opp.Id,
      WhoId: null,
      OwnerId: opp.OwnerId,
    });
    expect(task.Id.startsWith('00T')).toBe(true);
    expect(store.get('Task', task.Id)).toBe(task);
    const decision = store.data().Journey[0]!.Steps[3]!;
    const nested = decision.Branches![0]!.Steps[0]!;
    expect(store.getById(nested.Id)).toEqual({ object: 'JourneyStep', record: nested });
  });
});
