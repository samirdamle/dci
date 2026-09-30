/**
 * Privacy helpers shared by the content script, the worker and the options
 * page. See docs/extension.md#privacy for the review they come from.
 */

/** Query parameters that commonly carry credentials or one-time codes. */
const SECRET_PARAM =
  /^(access_?token|id_?token|refresh_?token|token|code|state|key|api_?key|secret|client_secret|password|passwd|pwd|auth|authorization|session|sessionid|sid|sig|signature|x-amz-[\w-]+)$/i;

/**
 * The page URL as sent with each request: without the fragment (OAuth tokens
 * often live there), user info, or query parameters that look like secrets.
 */
export function redactUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return '';
  }
  url.hash = '';
  url.username = '';
  url.password = '';
  for (const name of [...url.searchParams.keys()]) {
    if (SECRET_PARAM.test(name)) url.searchParams.set(name, 'redacted');
  }
  return url.href;
}

/** Page info for each request (`DciConfig.page`). */
export const pageInfo = () => ({ url: redactUrl(location.href), title: document.title });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether a credential may go to `url`: https, or plain http on this machine. */
export function isSecureEndpoint(url: URL): boolean {
  return url.protocol === 'https:' || LOCAL_HOSTS.has(url.hostname);
}

/** Conversation turns kept per session (user + assistant messages). */
export const MAX_HISTORY = 40;

/**
 * Keep the newest `max` messages, starting on a user turn. Until a
 * conversation reaches the cap its history only grows, so prompt caching
 * keeps working; after that, the oldest exchanges are dropped.
 */
export function capHistory<T extends { role: string }>(messages: T[], max = MAX_HISTORY): T[] {
  if (messages.length <= max) return messages;
  const kept = messages.slice(-max);
  const firstUser = kept.findIndex((m) => m.role === 'user');
  return firstUser <= 0 ? kept : kept.slice(firstUser);
}
