import type { DciContextNode, DciEvent, DciRequest } from '@dci/protocol';
import { describe, expect, it } from 'vitest';
import { createOrgStore, generateOrg } from '../data';
import { runCrmTool } from './crm-tools';
import { createMockResponder } from './mock-responder';

const TODAY = new Date(2026, 8, 29);
const today = () => '2026-09-29';
const fresh = () => createOrgStore(generateOrg(TODAY));

const node = (id: string, type: string, label = id): DciContextNode => ({
  id,
  type,
  label,
  data: {},
  source: 'annotated',
});

const request = (prompt: string, context: DciContextNode[], action?: string): DciRequest => ({
  v: 1,
  sessionId: 's',
  prompt,
  context,
  page: { url: 'http://x.test/', title: 'X' },
  ...(action ? { action } : {}),
});

async function run(store: ReturnType<typeof fresh>, req: DciRequest) {
  const respond = createMockResponder({ store, delayMs: 0, today });
  const events: DciEvent[] = [];
  for await (const e of respond(req, new AbortController().signal)) events.push(e);
  const text = events.flatMap((e) => (e.type === 'text-delta' ? [e.text] : [])).join('');
  return { events, text };
}

describe('mock responder', () => {
  it('moves deals and adds tasks with the same events as the agent', async () => {
    const store = fresh();
    const opps = store.list('Opportunity', (o) => !o.StageName.startsWith('Closed')).slice(0, 3);
    const { events, text } = await run(
      store,
      request(
        'Move these 3 deals to Negotiation and add a follow-up task for each',
        opps.map((o) => node(o.Id, 'opportunity', o.Name)),
      ),
    );
    const actions = events.filter((e) => e.type === 'client-action');
    expect(actions.map((a) => a.type === 'client-action' && a.name)).toEqual([
      'updateRecord',
      'updateRecord',
      'updateRecord',
      'createTask',
      'createTask',
      'createTask',
      'highlight',
    ]);
    expect(actions[0]).toMatchObject({
      args: { id: opps[0]!.Id, patch: { StageName: 'Negotiation' } },
    });
    expect(events.filter((e) => e.type === 'tool-start')[0]).toMatchObject({
      label: `Updating Opportunity: ${opps[0]!.Name}`,
    });
    for (const o of opps) expect(store.get('Opportunity', o.Id)?.StageName).toBe('Negotiation');
    expect(
      store
        .list('Task', { WhatId: opps[0]!.Id })
        .some((t) => t.Subject === `Follow up: ${opps[0]!.Name}`),
    ).toBe(true);
    expect(text).toContain('Done. I made 6 changes');
  });

  it('compares campaigns and recommends where to shift budget', async () => {
    const store = fresh();
    const [webinar, ...rest] = store.data().Campaign;
    const picked = [webinar!, rest[0]!, rest[1]!];
    const { text } = await run(
      store,
      request(
        'Compare these campaigns and recommend where to shift budget',
        picked.map((c) => node(c.Id, 'campaign', c.Name)),
        'compare-campaigns',
      ),
    );
    expect(text).toContain('**Spring Trail Webinar** spent $42,000 for 18 leads (CPL $2,333');
    expect(text).toMatch(/\*\*Recommendation:\*\* shift budget from \*\*Spring Trail Webinar\*\*/);
  });

  it('explains the low open rate story', async () => {
    const store = fresh();
    const send = store.data().EmailSend.find((e) => e.Subject.startsWith('LAST CHANCE'))!;
    const { text } = await run(
      store,
      request('Why is the open rate low?', [node(send.Id, 'email-send')], 'why-low-open-rate'),
    );
    expect(text).toMatch(/opened at \*\*4\.\d%\*\*/);
    expect(text).toContain('ALL CAPS');
  });

  it('is deterministic for a request', async () => {
    const lead = fresh().data().Lead[0]!;
    const req = request('Qualify this lead', [node(lead.Id, 'lead')], 'qualify-lead');
    const a = await run(fresh(), req);
    const b = await run(fresh(), req);
    expect(a.events).toEqual(b.events);
    expect(a.text).toContain('hot lead nobody has called yet');
  });

  it('stops streaming when aborted', async () => {
    const store = fresh();
    const respond = createMockResponder({ store, delayMs: 0, today });
    const controller = new AbortController();
    const seen: DciEvent[] = [];
    for await (const e of respond(
      request('Summarize', [node(store.data().Account[0]!.Id, 'account')]),
      controller.signal,
    )) {
      seen.push(e);
      controller.abort();
    }
    expect(seen).toHaveLength(1);
  });
});

describe('CRM tools', () => {
  it('never returns private fields', () => {
    const store = fresh();
    const account = store.data().Account[0]!;
    const out = runCrmTool(store, 'get_record', { id: account.Id });
    expect(out.ok).toBe(true);
    expect(JSON.stringify(out.output)).not.toContain('CreditLimit');
    const q = runCrmTool(store, 'query_records', { object: 'Contact', limit: 50 });
    expect(JSON.stringify(q.output)).not.toContain('PersonalMobile');
  });

  it('filters queries and rejects invalid input', () => {
    const store = fresh();
    const q = runCrmTool(store, 'query_records', {
      object: 'Opportunity',
      filters: [{ field: 'StageName', op: '=', value: 'Negotiation' }],
    });
    const out = q.output as { total: number; records: Array<{ StageName: string }> };
    expect(out.records.every((r) => r.StageName === 'Negotiation')).toBe(true);
    expect(runCrmTool(store, 'update_opportunity', { id: 'nope', patch: {} })).toMatchObject({
      ok: false,
    });
    expect(
      runCrmTool(store, 'update_opportunity', { id: 'x', patch: { Stage: 'X' } }),
    ).toMatchObject({ ok: false });
    expect(runCrmTool(store, 'drop_tables', {})).toMatchObject({ ok: false });
  });
});
