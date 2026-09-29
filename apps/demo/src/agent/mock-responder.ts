import type { DciContextNode, DciEvent, DciRequest } from '@dci/protocol';
import { dayOffset } from '../data/random';
import type { OrgStore } from '../data/store';
import {
  OPPORTUNITY_STAGES,
  type Account,
  type Campaign,
  type EmailSend,
  type JourneyStep,
  type Lead,
  type Opportunity,
  type OpportunityStage,
} from '../data/types';
import { runCrmTool, toolLabel, type ToolName, type ToolOutcome } from './crm-tools';

/**
 * A scripted, context-aware stand-in for the Claude agent: no API key, and
 * deterministic for a given request and store, so e2e tests can assert on
 * its text. It emits the same tool and `client-action` events as the real
 * agent, so write-back works offline. Runs on the server or in the browser.
 */

export interface MockResponderOptions {
  store: OrgStore;
  /** Delay between streamed words, in ms. `0` for tests. Default 12. */
  delayMs?: number;
  /** `YYYY-MM-DD`. Default: today. */
  today?: () => string;
}

export interface ToolCall {
  name: ToolName;
  input: Record<string, unknown>;
}

export interface MockPlan {
  calls: ToolCall[];
  /** The answer, written after the tools ran (so it can cite their results). */
  answer: (results: ToolOutcome[]) => string;
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const countWord = (n: number) => WORDS[n] ?? String(n);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) =>
  items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

function nextStage(stage: OpportunityStage): OpportunityStage {
  const open = OPPORTUNITY_STAGES.slice(0, 5);
  const i = open.indexOf(stage);
  return i < 0 ? stage : i === open.length - 1 ? 'Closed Won' : open[i + 1]!;
}

/** Records in context, grouped by what they are. */
function gather(store: OrgStore, context: DciContextNode[]) {
  const byObject = (object: string) =>
    context.flatMap((n) => {
      if (!n.id) return [];
      // A selected field (`<recordId>.<Field>`) stands for its record.
      const hit = store.getById(n.type === 'field' ? n.id.split('.')[0]! : n.id);
      return hit?.object === object ? [hit.record] : [];
    });
  return {
    opportunities: byObject('Opportunity') as Opportunity[],
    accounts: byObject('Account') as Account[],
    leads: byObject('Lead') as Lead[],
    campaigns: byObject('Campaign') as Campaign[],
    sends: byObject('EmailSend') as EmailSend[],
    steps: byObject('JourneyStep') as JourneyStep[],
    nodes: context,
  };
}

/** Decide what to do: which tools to call, and how to answer. */
export function planResponse(req: DciRequest, store: OrgStore, today: string): MockPlan {
  const g = gather(store, req.context);
  const p = req.prompt.toLowerCase();
  const action = req.action;
  const calls: ToolCall[] = [];

  // ── writes ─────────────────────────────────────────────────────────────
  const wantsMove =
    /\b(move|set|change|update|push|advance)\b/.test(p) || action === 'update-stage';
  const target = [...OPPORTUNITY_STAGES]
    .sort((a, b) => b.length - a.length)
    .find((s) => p.includes(s.toLowerCase()));
  const openOpps = g.opportunities.filter((o) => !o.StageName.startsWith('Closed'));
  if (wantsMove && (target || action === 'update-stage'))
    for (const o of openOpps)
      calls.push({
        name: 'update_opportunity',
        input: { id: o.Id, patch: { StageName: target ?? nextStage(o.StageName) } },
      });

  const wantsTask =
    /\b(add|create|schedule|log)\b[^.]*\b(tasks?|follow[- ]?ups?|calls?|reminders?)\b/.test(p);
  if (wantsTask)
    for (const r of [...g.opportunities, ...g.leads, ...g.accounts])
      calls.push({
        name: 'create_task',
        input: {
          whatId: r.Id,
          subject: `Follow up: ${r.Name}`,
          dueDate: dayOffset(new Date(`${today}T12:00:00Z`), 2),
          type: 'Call',
        },
      });

  const leadStatus = /\b(mark|set|change|move)\b/.test(p)
    ? (['Unqualified', 'Qualified', 'Working'] as const).find((s) => p.includes(s.toLowerCase()))
    : undefined;
  if (leadStatus)
    for (const l of g.leads)
      calls.push({ name: 'update_lead_status', input: { id: l.Id, status: leadStatus } });

  const budget = /budget\D*\$?\s*([\d][\d,.]*)\s*(k)?\b/.exec(p);
  if (budget && g.campaigns.length) {
    const amount = Math.round(Number(budget[1]!.replace(/,/g, '')) * (budget[2] ? 1000 : 1));
    for (const c of g.campaigns)
      calls.push({ name: 'update_campaign', input: { id: c.Id, patch: { Budget: amount } } });
  }

  const writes = calls.length;
  if (writes) {
    const ids = [...new Set(calls.map((c) => String(c.input.id ?? c.input.whatId)))];
    calls.push({ name: 'highlight', input: { ids } });
    return {
      calls,
      answer: (results) => {
        const done = results.slice(0, writes).filter((r) => r.ok);
        const failed = writes - done.length;
        return [
          `Done. I made ${plural(done.length, 'change')}:`,
          '',
          ...done.map((r) => `- ${r.label}`),
          ...(failed ? ['', `${countWord(failed)} change${failed === 1 ? '' : 's'} failed.`] : []),
          '',
          'The records on your screen are updated and highlighted.',
        ].join('\n');
      },
    };
  }

  // ── reads: look at up to three records first, like the agent would ───
  for (const n of req.context.slice(0, 3))
    if (n.id && store.getById(n.id)) calls.push({ name: 'get_record', input: { id: n.id } });

  return { calls, answer: () => answerFor(req, g, store, today) };
}

function answerFor(
  req: DciRequest,
  g: ReturnType<typeof gather>,
  store: OrgStore,
  today: string,
): string {
  const action = req.action ?? '';
  const p = req.prompt.toLowerCase();
  const data = store.data();
  const accountName = (id: string) => data.Account.find((a) => a.Id === id)?.Name ?? 'the account';

  if (!req.context.length)
    return 'Nothing is selected yet. Hold **Alt** and click a deal, an account, a campaign or any tile, then ask again.';

  // Campaigns: ROI, cost per lead, where to shift budget.
  if (
    g.campaigns.length &&
    (/roi|compare|budget|optimi/.test(p) ||
      /roi|campaign|optimi/.test(action) ||
      g.campaigns.length > 1)
  ) {
    const all = data.Campaign;
    const avgCpl =
      all.reduce((s, c) => s + c.ActualCost, 0) /
      Math.max(
        1,
        all.reduce((s, c) => s + c.LeadsGenerated, 0),
      );
    const rows = g.campaigns.map((c) => {
      const cpl = c.ActualCost / Math.max(1, c.LeadsGenerated);
      return { c, cpl, x: cpl / avgCpl };
    });
    const lines = rows.map(
      ({ c, cpl, x }) =>
        `- **${c.Name}** spent ${usd(c.ActualCost)} for ${plural(c.LeadsGenerated, 'lead')} (CPL ${usd(cpl)}, about ${x.toFixed(1)}× the org average), ROI ${pct(c.ROI)}.`,
    );
    const best = [...rows].sort((a, b) => b.c.ROI - a.c.ROI)[0]!;
    const worst = [...rows].sort((a, b) => a.c.ROI - b.c.ROI)[0]!;
    const advice =
      rows.length > 1 && best.c.Id !== worst.c.Id
        ? `**Recommendation:** shift budget from **${worst.c.Name}** (ROI ${pct(worst.c.ROI)}) to **${best.c.Name}** (ROI ${pct(best.c.ROI)}).`
        : worst.x > 2
          ? `**Recommendation:** pause or rework **${worst.c.Name}**: its cost per lead is ${worst.x.toFixed(1)}× the org average of ${usd(avgCpl)}.`
          : `Its cost per lead is in line with the org average of ${usd(avgCpl)}.`;
    return [`Org average cost per lead: **${usd(avgCpl)}**.`, '', ...lines, '', advice].join('\n');
  }

  // Email sends: the open rate story.
  if (g.sends.length) {
    const avgOpen =
      data.EmailSend.reduce((s, e) => s + e.Opens / e.Delivered, 0) / data.EmailSend.length;
    const e = g.sends[0]!;
    const rate = e.Opens / e.Delivered;
    if (action === 'suggest-subject-lines')
      return [
        `Subject lines to test against “${e.Subject}”:`,
        '',
        '1. Your spring restock, 20% off through Sunday',
        '2. Trail-tested gear your customers keep asking for',
        '3. New: the Ultralight line, now in wholesale',
        '4. A quick note on your next order',
        '5. Three bestsellers to reorder this month',
      ].join('\n');
    const shouty = /[A-Z]{4,}|!{2,}/.test(e.Subject);
    return [
      `**${e.Subject}** opened at **${pct(rate)}**, against an org average of ${pct(avgOpen)} (${(avgOpen / Math.max(rate, 0.001)).toFixed(1)}× lower).`,
      '',
      shouty
        ? '- The subject line uses ALL CAPS and repeated exclamation marks, which spam filters and readers both penalize.'
        : '- The subject line is fine; check the send time and the audience instead.',
      `- ${plural(e.Bounces, 'bounce')} out of ${e.Sent.toLocaleString('en-US')} sent: list hygiene is not the main issue.`,
      '',
      '**Fix:** resend to non-openers with a calm, specific subject line (try **Suggest subject lines**).',
    ].join('\n');
  }

  // Journey steps: drop-off.
  if (g.steps.length) {
    const s = g.steps[0]!;
    const others = data.Journey.flatMap((j) => flatten(j.Steps)).filter(
      (x) => x.Kind === 'Email' && x.Id !== s.Id,
    );
    const avg = others.reduce((sum, x) => sum + x.DropOff, 0) / Math.max(1, others.length);
    return [
      `**${s.Name}** (${s.Kind.toLowerCase()} step): ${s.Entered.toLocaleString('en-US')} entered and ${s.Exited.toLocaleString('en-US')} left here, a **${pct(s.DropOff)} drop-off** vs ${pct(avg)} for other email steps.`,
      '',
      s.DropOff > 0.4
        ? '- Contacts who just opened a welcome email are ready to buy, not to read care tips: the content does not match their intent.\n- **Try:** swap it for a product recommendation, or move the tips later in the journey.'
        : '- This step performs normally.',
    ].join('\n');
  }

  // Leads: qualify or draft outreach.
  if (g.leads.length) {
    const l = g.leads[0]!;
    if (action === 'draft-outreach' || /draft|email|outreach/.test(p))
      return `**To:** ${l.Email}\n**Subject:** Gear for ${l.Company} this season\n\nHi ${l.FirstName},\n\nThanks for your interest in Summit Gear. Retailers like ${l.Company} usually start with our Summit tents and Trailhead packs, with volume pricing from 50 units. Could we set up a 20-minute call this week?\n\nBest,\nLeo`;
    const contacted = l.LastContactedDate
      ? `last contacted ${l.LastContactedDate}`
      : '**never contacted**';
    return [
      `**${l.Name}** (${l.Title}, ${l.Company}): ${l.Rating} lead from ${l.LeadSource}, status ${l.Status}, ${contacted}.`,
      '',
      l.Rating === 'Hot' && !l.LastContactedDate
        ? 'This is a hot lead nobody has called yet. **Next step:** call today; buying intent fades fast.'
        : `Qualification: ${l.Rating === 'Cold' ? 'low' : 'medium'} priority. Confirm budget and timing on the first call.`,
    ].join('\n');
  }

  // Accounts: brief and risks.
  if (g.accounts.length) {
    const a = g.accounts[0]!;
    const opps = data.Opportunity.filter((o) => o.AccountId === a.Id);
    const open = opps.filter((o) => !o.StageName.startsWith('Closed'));
    const stalled = open.filter((o) => o.CloseDate < today);
    const lost = opps.filter((o) => o.StageName === 'Closed Lost');
    return [
      `**${a.Name}**: ${a.Industry} ${a.Type.toLowerCase()} in ${a.BillingCity}, ${a.BillingState}, rated ${a.Rating}, health **${a.Health}**.`,
      '',
      `- ${plural(open.length, 'open deal')} worth ${usd(open.reduce((s, o) => s + o.Amount, 0))}`,
      `- ${plural(stalled.length, 'stalled deal')} past close date${stalled.length ? `: ${list(stalled.map((o) => o.Name))}` : ''}`,
      `- ${plural(lost.length, 'lost deal')}`,
      '',
      stalled.length || lost.length
        ? '**Risk:** re-engage the buyer before the stalled deals slip further.'
        : 'No significant risks right now.',
    ].join('\n');
  }

  // Opportunities: summaries, next steps, follow-up drafts.
  if (g.opportunities.length) {
    const opps = g.opportunities;
    if (action === 'draft-follow-up' || /draft|email/.test(p)) {
      const o = opps[0]!;
      const contact = data.Contact.find((c) => c.AccountId === o.AccountId);
      return `**To:** ${contact ? `${contact.Name} <${contact.Email}>` : accountName(o.AccountId)}\n**Subject:** Next steps on ${o.Name}\n\nHi ${contact?.FirstName ?? 'there'},\n\nThanks again for your time. To keep your order on track for ${o.CloseDate}, the next step on our side is: ${o.NextStep || 'confirming quantities'}. Does that still work for you?\n\nBest,\nLeo`;
    }
    if (action === 'next-best-action' || /next|should/.test(p))
      return opps
        .map((o) => {
          const overdue = o.CloseDate < today && !o.StageName.startsWith('Closed');
          const step = overdue
            ? `the close date passed (${o.CloseDate}); call the buyer and agree a new date`
            : o.StageName === 'Proposal'
              ? 'follow up on the proposal and ask for a decision date'
              : o.StageName === 'Negotiation'
                ? 'send final terms and a signature link'
                : `move it forward: ${o.NextStep || 'book a discovery call'}`;
          return `- **${o.Name}**: ${step}.`;
        })
        .join('\n');
    const total = opps.reduce((s, o) => s + o.Amount, 0);
    const overdue = opps.filter((o) => o.CloseDate < today && !o.StageName.startsWith('Closed'));
    const names = opps.slice(0, 3).map((o) => o.Name);
    return [
      opps.length === 1
        ? `**${opps[0]!.Name}** (${accountName(opps[0]!.AccountId)}) is in **${opps[0]!.StageName}** for ${usd(total)}, closing ${opps[0]!.CloseDate}.`
        : `You selected ${plural(opps.length, 'opportunity', 'opportunities')} (${list(names)}${opps.length > 3 ? ', …' : ''}) totalling **${usd(total)}**.`,
      overdue.length
        ? `${countWord(overdue.length)} ${overdue.length === 1 ? 'is' : 'are'} past the close date: ${list(overdue.map((o) => o.Name))}.`
        : 'None are past their close date.',
      '',
      ...opps
        .slice(0, 5)
        .map(
          (o) => `- ${o.Name}: ${o.StageName}, ${usd(o.Amount)}, next step “${o.NextStep || '—'}”`,
        ),
    ].join('\n');
  }

  // Everything else (KPIs, chart points, stages, segments, fallback nodes…).
  const n = req.context[0]!;
  const facts = Object.entries(n.data)
    .slice(0, 6)
    .map(
      ([k, v]) =>
        `- **${k}**: ${typeof v === 'number' && Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(v)}`,
    );
  const what = n.label ?? n.type ?? n.fallback?.text?.slice(0, 60) ?? 'this element';
  if (n.type === 'stage') {
    const stalled = data.Opportunity.filter((o) => o.StageName === n.label && o.CloseDate < today);
    return [
      `**${what}** holds ${String(n.data.deals ?? '?')} deals worth ${usd(Number(n.data.total ?? 0))}.`,
      stalled.length
        ? `${countWord(stalled.length)} ${stalled.length === 1 ? 'is' : 'are'} stuck past the close date: ${list(stalled.map((o) => o.Name))}. They are waiting on customer replies.`
        : 'No deals here are past their close date.',
    ].join('\n');
  }
  return [
    `Here is what I can see about **${what}**${n.type ? ` (a \`${n.type}\`)` : ''}:`,
    '',
    ...(facts.length ? facts : [`- ${n.fallback?.text ?? 'No annotated data.'}`]),
    ...(req.context.length > 1
      ? ['', `Plus ${plural(req.context.length - 1, 'more item')} in context.`]
      : []),
    '',
    `_Mock mode:_ a real deployment would send this to Claude with your prompt “${req.prompt}”.`,
  ].join('\n');
}

function flatten(steps: JourneyStep[]): JourneyStep[] {
  return steps.flatMap((s) => [s, ...(s.Branches ?? []).flatMap((b) => flatten(b.Steps))]);
}

const sleep = (ms: number, signal: AbortSignal) =>
  ms <= 0
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
      });

/** Stream a response: tool calls (with client actions), then the answer word by word. */
export function createMockResponder({ store, delayMs = 12, today }: MockResponderOptions) {
  return async function* respond(req: DciRequest, signal: AbortSignal): AsyncGenerator<DciEvent> {
    const day = today?.() ?? dayOffset(new Date(), 0);
    const plan = planResponse(req, store, day);
    const results: ToolOutcome[] = [];
    for (const [i, call] of plan.calls.entries()) {
      if (signal.aborted) return;
      const id = `mock_${i + 1}`;
      yield {
        type: 'tool-start',
        id,
        name: call.name,
        label: toolLabel(store, call.name, call.input),
      };
      await sleep(delayMs * 15, signal);
      if (signal.aborted) return;
      const outcome = runCrmTool(store, call.name, call.input);
      results.push(outcome);
      yield { type: 'tool-end', id, ok: outcome.ok };
      if (outcome.clientAction) yield { type: 'client-action', ...outcome.clientAction };
    }
    for (const word of plan.answer(results).split(/(?<=\s)/)) {
      if (signal.aborted) return;
      yield { type: 'text-delta', text: word };
      await sleep(delayMs, signal);
    }
  };
}
