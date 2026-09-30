import { describe, expect, it } from 'vitest';
import { selectBackend } from '../src/backends/index';
import { capHistory, isSecureEndpoint, redactUrl } from '../src/privacy';
import { DEFAULT_SETTINGS } from '../src/settings';

describe('redactUrl', () => {
  it('drops the fragment and user info, and masks secret-looking parameters', () => {
    expect(
      redactUrl('https://ada:pw@example.com/cb?q=tents&access_token=abc&Code=1#id_token=xyz'),
    ).toBe('https://example.com/cb?q=tents&access_token=redacted&Code=redacted');
  });

  it('keeps ordinary URLs as they are', () => {
    expect(redactUrl('https://shop.example/orders?page=2&sort=date')).toBe(
      'https://shop.example/orders?page=2&sort=date',
    );
    expect(redactUrl('not a url')).toBe('');
  });
});

describe('isSecureEndpoint', () => {
  it('allows https anywhere, and http only on this machine', () => {
    expect(isSecureEndpoint(new URL('https://api.example.com/dci'))).toBe(true);
    expect(isSecureEndpoint(new URL('http://localhost:8787/api/dci'))).toBe(true);
    expect(isSecureEndpoint(new URL('http://127.0.0.1/api/dci'))).toBe(true);
    expect(isSecureEndpoint(new URL('http://api.example.com/dci'))).toBe(false);
  });

  it('keeps the endpoint backend from sending a header over http', async () => {
    const backend = selectBackend(
      { ...DEFAULT_SETTINGS, backend: 'endpoint', endpointUrl: 'http://api.example.com/dci' },
      { anthropicApiKey: '', endpointAuthorization: 'Bearer secret' },
      { get: async () => [], set: async () => {} },
    );
    const events = [];
    for await (const e of backend(
      { v: 1, sessionId: 's', prompt: 'hi', context: [], page: { url: '', title: '' } },
      new AbortController().signal,
    ))
      events.push(e);
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'not_configured' })]);
  });
});

describe('capHistory', () => {
  const turns = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', i }));

  it('leaves short conversations alone', () => {
    const short = turns(6);
    expect(capHistory(short, 10)).toBe(short);
  });

  it('keeps the newest turns, starting with a user turn', () => {
    const capped = capHistory(turns(15), 10);
    expect(capped[0]).toEqual({ role: 'user', i: 6 });
    expect(capped.at(-1)).toEqual({ role: 'user', i: 14 });
    expect(capped).toHaveLength(9);
  });
});
