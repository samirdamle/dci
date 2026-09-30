/**
 * Credentials for the backends. Stored in `storage.local` under their own key,
 * read only by the background worker (to call the backend) and the options page
 * (to edit them). The content script never reads them, and the page can't: it
 * has no access to extension storage.
 */
export interface Secrets {
  /** Anthropic API key, for the Claude backend. */
  anthropicApiKey: string;
  /** Sent as `Authorization` to the DCI endpoint, e.g. `Bearer …`. Optional. */
  endpointAuthorization: string;
}

export const SECRETS_KEY = 'secrets';

export const EMPTY_SECRETS: Secrets = { anthropicApiKey: '', endpointAuthorization: '' };

export function readSecrets(stored: unknown): Secrets {
  const s = (stored ?? {}) as Partial<Record<keyof Secrets, unknown>>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    anthropicApiKey: str(s.anthropicApiKey),
    endpointAuthorization: str(s.endpointAuthorization),
  };
}
