import type Anthropic from '@anthropic-ai/sdk';
import { generateOrg } from '../src/data/generate';
import { createOrgStore, type OrgStore } from '../src/data/store';

/**
 * Per-conversation state, keyed by the DCI `sessionId`. Memory lives on the
 * backend (the browser only sends the id): the Claude transcript, plus a
 * private copy of the org that matches what that browser tab started with,
 * so tool calls and client actions stay in sync.
 */
export interface Session {
  store: OrgStore;
  /** Append-only Claude transcript (thinking blocks must be passed back unchanged). */
  messages: Anthropic.Beta.BetaMessageParam[];
  lastUsed: number;
}

export interface SessionStoreOptions {
  /** Most sessions kept; the least recently used is dropped. Default 200. */
  max?: number;
  /** Idle time before a session expires, in ms. Default 1 hour. */
  ttlMs?: number;
  now?: () => number;
}

export function createSessionStore({
  max = 200,
  ttlMs = 60 * 60 * 1000,
  now = Date.now,
}: SessionStoreOptions = {}) {
  const sessions = new Map<string, Session>();

  function sweep() {
    const cutoff = now() - ttlMs;
    for (const [id, s] of sessions) if (s.lastUsed < cutoff) sessions.delete(id);
    while (sessions.size > max) sessions.delete(sessions.keys().next().value!);
  }

  return {
    get(id: string): Session {
      let session = sessions.get(id);
      if (session) sessions.delete(id); // re-insert: Map order is LRU order
      session ??= { store: createOrgStore(generateOrg()), messages: [], lastUsed: 0 };
      session.lastUsed = now();
      sessions.set(id, session);
      sweep();
      return session;
    },
    size: () => sessions.size,
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
