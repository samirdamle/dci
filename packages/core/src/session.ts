export interface SessionOptions {
  /**
   * `'page'` (default): a new random id per page load (per `createSession`).
   * `'manual'`: you supply `id` and control it.
   */
  scope?: 'page' | 'manual';
  /** Fixed id or a function returning one. Required for `'manual'`. */
  id?: string | (() => string);
}

export interface SessionChange {
  id: string;
  previous: string;
}

export interface Session {
  readonly id: string;
  /**
   * Start a new conversation: rotates the id (or uses `newId`). Chat history
   * listeners clear on `sessionchange`; memory lives on the backend, which
   * only ever sees the new id.
   */
  reset(newId?: string): string;
  onChange(fn: (change: SessionChange) => void): () => void;
}

/** A random UUID, with a fallback for environments without `crypto.randomUUID`. */
export function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-4${hex.slice(13, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

/**
 * The conversation id sent with every request. Conversations are not stored
 * in the browser: that is intentional, memory is the backend's job.
 */
export function createSession(options: SessionOptions = {}): Session {
  const scope = options.scope ?? 'page';
  const next = (): string => {
    if (typeof options.id === 'function') return options.id();
    if (options.id !== undefined) return options.id;
    if (scope === 'manual') throw new Error("session.scope 'manual' needs an id");
    return randomId();
  };
  let id = next();
  const listeners = new Set<(change: SessionChange) => void>();

  return {
    get id() {
      return id;
    },
    reset(newId) {
      const previous = id;
      id = newId ?? (scope === 'manual' ? next() : randomId());
      for (const fn of [...listeners]) fn({ id, previous });
      return id;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
