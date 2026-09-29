import type { DciRequest } from '@dci/core';
import { useChat, useDci, useSelection } from '@dci/react';
import { useEffect, useState } from 'react';
import { useLastExchange } from './event-log';

/**
 * What DCI would send right now (`dci.previewRequest()`, updated as you
 * select and type) and the raw events of the last response.
 */
export function RequestInspector() {
  const dci = useDci();
  const { nodes } = useSelection();
  const chat = useChat();
  const last = useLastExchange();
  const [preview, setPreview] = useState<DciRequest | false | null>(null);

  useEffect(() => {
    let live = true;
    void dci?.previewRequest(chat.draft || '(your question)').then((r) => live && setPreview(r));
    return () => {
      live = false;
    };
  }, [dci, nodes, chat.draft, chat.pendingContext]);

  return (
    <div className="space-y-4 text-xs">
      <section>
        <h3 className="mb-1 text-sm font-medium">Next request</h3>
        <pre
          className="max-h-72 overflow-auto rounded-md bg-muted p-2"
          data-testid="request-preview"
          tabIndex={0}
        >
          {preview === false
            ? 'Cancelled by beforeSend.'
            : preview
              ? JSON.stringify(preview, null, 2)
              : '…'}
        </pre>
      </section>
      <section>
        <h3 className="mb-1 text-sm font-medium">
          Last response {last?.open ? '(streaming…)' : last ? `(${last.events.length} events)` : ''}
        </h3>
        <ol
          className="max-h-72 space-y-0.5 overflow-auto rounded-md bg-muted p-2 font-mono"
          data-testid="event-log"
          tabIndex={0}
        >
          {last ? (
            last.events.map((e, i) => (
              <li key={i} className="truncate">
                <span className="font-semibold">{e.type}</span>{' '}
                {JSON.stringify(
                  Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'type')),
                )}
              </li>
            ))
          ) : (
            <li>Nothing sent yet.</li>
          )}
        </ol>
      </section>
    </div>
  );
}
