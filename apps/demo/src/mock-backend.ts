import type { DciContextNode, DciEvent, DciRequest, Transport } from '@samirdamle/dci-core';

/**
 * A pretend backend so the static demo (GitHub Pages) works end to end. It
 * streams a canned, context-aware markdown reply with tool progress and a
 * `highlight` client action, exactly like a real `@samirdamle/dci-server` endpoint.
 */
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

const name = (n: DciContextNode) => n.label ?? n.type ?? n.fallback?.tagName ?? 'element';
const money = (v: unknown) => (typeof v === 'number' ? `$${v.toLocaleString('en-US')}` : '—');

function answer(req: DciRequest): string {
  const nodes = req.context;
  const invoices = nodes.filter((n) => n.type === 'invoice');
  if (!nodes.length)
    return 'Nothing is selected yet. Hold **Alt** and click an invoice, a deal or a note, then ask again.';

  if (req.action === 'remind' && invoices.length) {
    return invoices
      .map(
        (inv) =>
          `**To:** ${String(inv.data.customer)}\n\n` +
          `Hi, a friendly reminder that ${name(inv)} for ${money(inv.data.amount)} ` +
          `is ${inv.data.status === 'overdue' ? '**overdue**' : 'due soon'}. ` +
          `You can pay online at [our billing portal](https://example.com/billing).`,
      )
      .join('\n\n---\n\n');
  }

  if (invoices.length > 1 || req.action === 'total') {
    const total = invoices.reduce((sum, n) => sum + (Number(n.data.amount) || 0), 0);
    return [
      `You selected **${invoices.length} invoices** totalling **${money(total)}**:`,
      '',
      ...invoices.map(
        (n) =>
          `- ${name(n)} · ${String(n.data.customer)} · ${money(n.data.amount)} (${String(n.data.status)})`,
      ),
      '',
      invoices.some((n) => n.data.status === 'overdue')
        ? 'At least one is overdue: consider the **Draft reminder** action.'
        : 'None of them are overdue.',
    ].join('\n');
  }

  const first = nodes[0]!;
  const lines = [
    `Here's what I can see about **${name(first)}**${first.type ? ` (a \`${first.type}\`)` : ''}:`,
    '',
    ...Object.entries(first.data).map(
      ([k, v]) =>
        `- **${k}**: ${typeof v === 'number' && k !== 'probability' ? money(v) : String(v)}`,
    ),
  ];
  if (first.ancestors?.length)
    lines.push('', `It sits inside ${first.ancestors.map((a) => a.label ?? a.type).join(' › ')}.`);
  if (nodes.length > 1) lines.push('', `Plus ${nodes.length - 1} more item(s) in context.`);
  lines.push('', `_Your prompt was:_ "${req.prompt}". In a real app, an LLM would answer here.`);
  return lines.join('\n');
}

export const mockTransport: Transport = {
  async *send(req, { signal }): AsyncGenerator<DciEvent> {
    const ids = req.context.flatMap((n) => (n.id ? [n.id] : []));
    await sleep(250, signal);
    yield { type: 'tool-start', id: 't1', name: 'read_context', label: 'Reading the selection' };
    await sleep(400, signal);
    yield { type: 'tool-end', id: 't1', ok: true };
    if (ids.length) yield { type: 'client-action', name: 'highlight', args: { ids } };
    // Stream word by word, like a model would.
    for (const word of answer(req).split(/(?<=\s)/)) {
      if (signal.aborted) return;
      yield { type: 'text-delta', text: word };
      await sleep(12, signal);
    }
    yield { type: 'done' };
  },
};
