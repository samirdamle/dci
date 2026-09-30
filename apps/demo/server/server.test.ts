// @vitest-environment node
import type Anthropic from '@anthropic-ai/sdk';
import { decodeSSEStream, type DciEvent, type DciRequest } from '@samirdamle/dci-protocol';
import { createDciStream } from '@samirdamle/dci-server';
import { describe, expect, it } from 'vitest';
import { createClaudeAgent } from './claude-agent';
import { createSessionStore } from './sessions';

type Message = Anthropic.Beta.BetaMessage;

/** A stand-in for `client.beta.messages.stream`: replays scripted messages. */
function fakeClient(script: Array<Partial<Message>>) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          calls.push(structuredClone(params));
          const message = script.shift()!;
          const handlers: Array<(t: string) => void> = [];
          return {
            on(event: string, fn: (t: string) => void) {
              if (event === 'text') handlers.push(fn);
              return this;
            },
            async finalMessage() {
              for (const block of message.content ?? [])
                if (block.type === 'text') handlers.forEach((fn) => fn(block.text));
              return message as Message;
            },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}

async function events(response: Response): Promise<DciEvent[]> {
  const out: DciEvent[] = [];
  for await (const e of decodeSSEStream(response.body!)) out.push(e);
  return out;
}

const request = (
  sessionId: string,
  prompt: string,
  context: DciRequest['context'] = [],
): DciRequest => ({
  v: 1,
  sessionId,
  prompt,
  context,
  page: { url: 'http://x.test/', title: 'Pipeline' },
});

describe('Claude agent', () => {
  it('runs tools, streams events and remembers the conversation', async () => {
    const sessions = createSessionStore();
    const opp = sessions.get('s1').store.data().Opportunity[20]!;
    const { client, calls } = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'On it. ', citations: null },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'update_opportunity',
            input: { id: opp.Id, patch: { StageName: 'Negotiation' } },
          } as Anthropic.Beta.BetaToolUseBlock,
        ],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Moved it.', citations: null }] },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'It is in Negotiation.', citations: null }],
      },
    ]);
    const agent = createClaudeAgent({ sessions, client, model: 'claude-sonnet-5-5' });

    const stream = createDciStream({ pingIntervalMs: 0 });
    await agent(
      request('s1', 'Move this to Negotiation', [
        { id: opp.Id, type: 'opportunity', label: opp.Name, data: {}, source: 'annotated' },
      ]),
      stream,
      {
        signal: new AbortController().signal,
        raw: new Request('http://x.test'),
      },
    );
    stream.done();
    const out = await events(stream.response);
    expect(out.map((e) => e.type)).toEqual([
      'text-delta',
      'tool-start',
      'tool-end',
      'client-action',
      'text-delta',
      'done',
    ]);
    expect(out[1]).toMatchObject({ label: `Updating Opportunity: ${opp.Name}` });
    expect(out[3]).toMatchObject({
      name: 'updateRecord',
      args: { id: opp.Id, patch: { StageName: 'Negotiation' } },
    });
    expect(sessions.get('s1').store.get('Opportunity', opp.Id)?.StageName).toBe('Negotiation');

    // The request carries the selected records, the tools and the fallback opt-in.
    const first = calls[0]!;
    expect(first.model).toBe('claude-sonnet-5-5');
    expect(first).toMatchObject({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    const turn = (first.messages as Anthropic.Beta.BetaMessageParam[])[0]!.content as string;
    expect(turn).toContain('<selected_records>');
    expect(turn).toContain(opp.Name);

    // A follow-up in the same session sends the whole transcript.
    const second = createDciStream({ pingIntervalMs: 0 });
    await agent(request('s1', 'Where is it now?'), second, {
      signal: new AbortController().signal,
      raw: new Request('http://x.test'),
    });
    const history = calls[2]!.messages as Anthropic.Beta.BetaMessageParam[];
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
  });

  it('turns an invalid tool input into an error result for the model', async () => {
    const sessions = createSessionStore();
    const { client, calls } = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 't',
            name: 'update_lead_status',
            input: { id: 'x', status: 'Maybe' },
          } as Anthropic.Beta.BetaToolUseBlock,
        ],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry.', citations: null }] },
    ]);
    const stream = createDciStream({ pingIntervalMs: 0 });
    await createClaudeAgent({ sessions, client })(request('s2', 'Mark it maybe'), stream, {
      signal: new AbortController().signal,
      raw: new Request('http://x.test'),
    });
    const results = (calls[1]!.messages as Anthropic.Beta.BetaMessageParam[])[2]!
      .content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results[0]).toMatchObject({ tool_use_id: 't', is_error: true });
  });
});

describe('session store', () => {
  it('keeps the most recent sessions and expires idle ones', () => {
    let now = 0;
    const store = createSessionStore({ max: 2, ttlMs: 100, now: () => now });
    const a = store.get('a');
    store.get('b');
    store.get('a');
    store.get('c'); // evicts b, the least recently used
    expect(store.size()).toBe(2);
    expect(store.get('a')).toBe(a);
    now = 1000;
    store.get('d'); // a and c have expired
    expect(store.size()).toBe(1);
  });
});
