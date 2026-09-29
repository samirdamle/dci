import Anthropic from '@anthropic-ai/sdk';
import type { DciHandlerFn } from '@dci/server';
import { formatContextForPrompt } from '@dci/server';
import { ACTION_INSTRUCTIONS } from '../src/agent/actions';
import { runCrmTool, TOOL_DEFINITIONS, toolLabel } from '../src/agent/crm-tools';
import { dayOffset } from '../src/data/random';
import type { SessionStore } from './sessions';

/** A current Sonnet-class model by default; override with `DCI_DEMO_MODEL`. */
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set([
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
]);

const MAX_ITERATIONS = 8;

const SYSTEM = `You are a CRM assistant for Summit Gear Co.'s (fictional) Salesforce org. Summit Gear sells outdoor equipment (tents, packs, apparel) to retailers.

The user points at records on their screen (with Alt+Click) and asks about them. Each turn includes the records they selected in <selected_records>: treat those as "this", "these", "them". Earlier turns stay in this conversation, so follow-up questions can refer back.

Use the tools to look up related records and to make changes the user asks for. When you change records, the page updates automatically; use highlight to point at records you mention when that helps. Never invent ids: use the ids from the selected records or from tool results.

Answer in concise markdown: short paragraphs or bullets, with amounts and dates. Drafted emails are drafts: never claim to have sent anything.`;

/** The user turn: selected records, the suggested action, today's date, then the prompt. */
function userTurn(req: Parameters<DciHandlerFn>[0], today: string): string {
  const parts = [`<page title="${req.page.title}" />`, `Today is ${today}.`];
  if (req.context.length)
    parts.push(
      `<selected_records>\n${formatContextForPrompt(req.context, { style: 'xml' })}\n</selected_records>`,
    );
  const instruction = req.action ? ACTION_INSTRUCTIONS[req.action] : undefined;
  if (instruction)
    parts.push(`<suggested_action id="${req.action}">${instruction}</suggested_action>`);
  parts.push(req.prompt);
  return parts.join('\n\n');
}

export interface ClaudeAgentOptions {
  sessions: SessionStore;
  client?: Anthropic;
  model?: string;
}

/**
 * The Claude agent: a streaming tool-use loop over the CRM tools. Text
 * streams to the page as `text-delta`; each tool call shows as a tool row;
 * record changes go back as `client-action`s. The API key never leaves the
 * server.
 */
export function createClaudeAgent({
  sessions,
  client = new Anthropic(),
  model = DEFAULT_MODEL,
}: ClaudeAgentOptions): DciHandlerFn {
  const tools: Anthropic.Beta.BetaTool[] = TOOL_DEFINITIONS.map((t) => ({
    ...t,
    eager_input_streaming: true,
  }));

  return async (req, stream, { signal }) => {
    const session = sessions.get(req.sessionId);
    const today = dayOffset(new Date(), 0);
    session.messages.push({ role: 'user', content: userTurn(req, today) });

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = client.beta.messages.stream(
        {
          model,
          max_tokens: 16000,
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          tools,
          messages: session.messages,
          // Agentic tool use: medium effort is a good speed/quality balance here.
          output_config: { effort: 'medium' },
          ...(FALLBACK_MODELS.has(model)
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        },
        { signal },
      );
      response.on('text', (delta) => stream.text(delta));

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await response.finalMessage();
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof Anthropic.AuthenticationError)
          return stream.error(
            'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on the demo server.',
            'auth',
          );
        if (err instanceof Anthropic.RateLimitError)
          return stream.error(
            'Claude is rate limited right now. Try again in a moment.',
            'rate_limited',
          );
        if (err instanceof Anthropic.APIError)
          return stream.error(`Claude API error ${err.status ?? ''}: ${err.message}`, 'upstream');
        // A tool input that was not parseable JSON (eager input streaming): re-issue the turn.
        if (iteration < MAX_ITERATIONS - 1) continue;
        throw err;
      }

      // Append-only: the assistant turn goes back exactly as received.
      session.messages.push({ role: 'assistant', content: message.content });

      if (message.stop_reason === 'refusal') {
        stream.text('\n\nI can’t help with that request.');
        return;
      }
      const toolUses = message.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
      );
      if (!toolUses.length) return;
      if (message.stop_reason === 'max_tokens')
        return stream.error(
          'The response was cut off mid tool call; please try again.',
          'max_tokens',
        );

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        stream.toolStart(use.id, use.name, toolLabel(session.store, use.name, use.input));
        const outcome = runCrmTool(session.store, use.name, use.input);
        stream.toolEnd(use.id, outcome.ok);
        if (outcome.clientAction)
          stream.clientAction(outcome.clientAction.name, outcome.clientAction.args);
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(outcome.output),
          ...(outcome.ok ? {} : { is_error: true }),
        });
      }
      session.messages.push({ role: 'user', content: results });
    }
    stream.text('\n\n(Stopped after too many steps.)');
  };
}
