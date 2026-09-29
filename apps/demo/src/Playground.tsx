import {
  createActionRegistry,
  createChatController,
  createChatUi,
  createInteractions,
  type ActionsConfig,
  type ChatMode,
  type ChatUi,
  type DciContextNode,
} from '@dci/core';
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dci, INVOICES, OPPORTUNITIES } from './data';
import { mockTransport } from './mock-backend';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

const GESTURES: Array<[string, string]> = [
  ['Hold Alt (⌥)', 'Highlight the node under the pointer'],
  ['Alt+Click', 'Select it'],
  ['Alt+Shift+Click', 'Add or remove it'],
  ['Alt+Wheel', 'Move the highlight up/down the tree'],
  ['Alt+Drag', 'Window select (→ contained, ← touched)'],
  ['Alt+Double-click', 'Select all of the same type'],
  ['Arrows / Shift+arrows', 'Move / extend the selection'],
  ['Esc', 'Close the chat, then clear the selection'],
];

/** Suggested actions per `type` (`'*'` applies to everything). */
const ACTIONS: ActionsConfig = {
  invoice: [
    { id: 'explain', label: 'Explain' },
    { id: 'remind', label: 'Draft reminder', prompt: 'Draft a payment reminder' },
    { id: 'total', label: 'Total', prompt: 'What is the total?' },
  ],
  opportunity: [{ id: 'next', label: 'Next steps', prompt: 'Suggest next steps for this deal' }],
  '*': [{ id: 'summarize', label: 'Summarize' }],
};

const MODES: ChatMode[] = ['popover', 'panel'];

/** Annotated sample content wired to `createInteractions` from `@dci/core`. */
export function Playground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<ChatUi | null>(null);
  const [context, setContext] = useState<DciContextNode[]>([]);
  const [mode, setMode] = useState<ChatMode>('popover');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const interactions = createInteractions({
      root,
      // The first Esc closes the chat; the next one clears the selection.
      onEscape: () => chatRef.current?.escape() ?? false,
    });
    const controller = createChatController({
      transport: mockTransport,
      selection: interactions.selection,
      contextOptions: { root },
      actions: createActionRegistry({
        selection: interactions.selection,
        root,
        overlay: { flash: (el) => interactions.bus.emit('flash', el) },
      }),
    });
    const chat = createChatUi({ controller, interactions, actions: ACTIONS, pushContent: true });
    chatRef.current = chat;
    const off = interactions.selection.subscribe(() =>
      setContext(interactions.selection.toContext()),
    );
    return () => {
      off();
      chat.destroy();
      chatRef.current = null;
      controller.destroy();
      interactions.destroy();
    };
  }, []);

  const switchMode = (next: ChatMode) => {
    setMode(next);
    chatRef.current?.setMode(next);
    chatRef.current?.controller.open();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div
        ref={rootRef}
        className="space-y-6"
        data-dci={dci({ id: 'workspace', type: 'page', label: 'Sales workspace' })}
      >
        <Card data-dci={dci({ id: 'invoices', type: 'table', label: 'Invoices' })}>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Rows and amount cells are annotated.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-testid="invoices">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Invoice</th>
                  <th className="py-2 font-medium">Customer</th>
                  <th className="py-2 font-medium">Due</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {INVOICES.map((inv) => (
                  <tr
                    key={inv.id}
                    data-dci={dci({
                      id: inv.id,
                      type: 'invoice',
                      label: `Invoice ${inv.number}`,
                      customer: inv.customer,
                      amount: inv.amount,
                      status: inv.status,
                    })}
                  >
                    <td className="py-2 font-mono">{inv.number}</td>
                    <td className="py-2">{inv.customer}</td>
                    <td className="py-2">
                      {inv.due}{' '}
                      {inv.status === 'overdue' && (
                        <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">
                          overdue
                        </span>
                      )}
                    </td>
                    <td
                      className="py-2 text-right tabular-nums"
                      data-dci={dci({
                        id: `${inv.id}.amount`,
                        type: 'amount',
                        label: 'Amount',
                        value: inv.amount,
                      })}
                    >
                      {money(inv.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card data-dci={dci({ id: 'pipeline', type: 'list', label: 'Pipeline' })}>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>
              A nested scroll container: highlights stay aligned and clipped.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="grid max-h-56 gap-3 overflow-y-auto pr-2 sm:grid-cols-2"
              data-testid="pipeline-scroller"
            >
              {OPPORTUNITIES.map((opp) => (
                <div
                  key={opp.id}
                  className="rounded-lg border p-3"
                  data-dci={dci({
                    id: opp.id,
                    type: 'opportunity',
                    label: opp.name,
                    stage: opp.stage,
                    value: opp.value,
                  })}
                >
                  <div className="font-medium">{opp.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {opp.stage} · {money(opp.value)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="overflow-hidden rounded-lg border p-4" data-testid="clipped">
          <div
            className="rounded-md bg-muted p-3 text-sm"
            data-dci={dci({ id: 'note', type: 'note', label: 'Account note' })}
          >
            Inside <code>overflow: hidden</code>: the highlight is drawn in a separate layer, so it
            isn&apos;t clipped.{' '}
            <span className="text-muted-foreground">Unannotated text works too.</span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Try it</CardTitle>
            <CardDescription>macOS: use ⌥ Option for Alt.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-sm">
              {GESTURES.map(([keys, action]) => (
                <div key={keys} className="flex justify-between gap-3">
                  <dt className="font-medium whitespace-nowrap">{keys}</dt>
                  <dd className="text-right text-muted-foreground">{action}</dd>
                </div>
              ))}
            </dl>
            <div
              className="mt-4 flex items-center gap-2 text-sm"
              role="group"
              aria-label="Chat mode"
            >
              <span className="font-medium">Chat</span>
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => switchMode(m)}
                  className="rounded-md border px-2 py-0.5 capitalize aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                >
                  {m}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Selected context ({context.length})</CardTitle>
            <CardDescription>What DCI would send to the AI.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre
              className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs"
              data-testid="context"
            >
              {context.length ? JSON.stringify(context, null, 2) : 'Nothing selected yet.'}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
