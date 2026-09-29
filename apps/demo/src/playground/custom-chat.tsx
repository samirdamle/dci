import { resolveActions } from '@dci/core';
import { DciChat, useSelection, type UseChatResult } from '@dci/react';
import { Check, Loader2, Send, Square, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ACTIONS } from '@/app/dci-config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

/**
 * A chat built from shadcn primitives on the headless API (`useChat`,
 * `useSelection`). `<DciChat>` turns the built-in UI off while it is shown;
 * the conversation and selection carry over when switching back.
 */
export function CustomChat() {
  return <DciChat render={(chat) => <CustomChatPanel chat={chat} />} />;
}

function CustomChatPanel({ chat }: { chat: UseChatResult }) {
  const { nodes } = useSelection();
  const log = useRef<HTMLDivElement>(null);
  const busy = chat.status === 'sending' || chat.status === 'streaming';
  const actions = resolveActions(ACTIONS, chat.pendingContext).slice(0, 4);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [chat.messages]);

  return (
    <Card
      // DCI's own UI: its clicks and keys are never treated as gestures.
      data-dci-ui=""
      role="complementary"
      aria-label="Custom chat"
      className="fixed right-4 bottom-4 z-40 flex max-h-[70vh] w-96 flex-col gap-3 py-4 shadow-lg"
    >
      <CardHeader className="px-4">
        <CardTitle className="text-base">Custom shadcn chat</CardTitle>
        <CardDescription>Built with useChat() and useSelection()</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-4">
        <div className="flex flex-wrap gap-1" aria-label="Context">
          {chat.pendingContext.length ? (
            chat.pendingContext.map((node, i) => (
              <Badge key={`${node.id ?? i}`} variant="secondary" className="gap-1">
                {node.label ?? node.type ?? 'element'}
                <button
                  type="button"
                  aria-label={`Remove ${node.label ?? 'item'}`}
                  onClick={() => chat.removeContext(node)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              {nodes.length ? 'Context sent.' : 'Alt+Click anything to add context.'}
            </span>
          )}
        </div>
        <div
          ref={log}
          className="min-h-24 flex-1 space-y-3 overflow-y-auto text-sm"
          role="log"
          aria-live="polite"
        >
          {chat.messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === 'user' ? 'ml-8 rounded-lg bg-primary p-2 text-primary-foreground' : ''
              }
            >
              {m.tools.map((t) => (
                <div key={t.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t.state === 'running' ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : t.state === 'ok' ? (
                    <Check className="size-3 text-emerald-700" />
                  ) : (
                    <X className="size-3 text-red-700" />
                  )}
                  {t.label ?? t.name}
                </div>
              ))}
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.error && <p className="text-red-700">{m.error.message}</p>}
            </div>
          ))}
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {actions.map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void chat.send(a.prompt ?? a.label, { action: a.id })}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void chat.send();
          }}
        >
          <Textarea
            value={chat.draft}
            onChange={(e) => chat.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void chat.send();
              }
            }}
            placeholder="Ask about the selection…"
            aria-label="Message"
            className="min-h-9 resize-none"
            rows={1}
          />
          {busy ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Stop"
              onClick={chat.stop}
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Send">
              <Send className="size-4" />
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
