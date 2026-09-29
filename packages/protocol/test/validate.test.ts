import { describe, expect, it } from 'vitest';
import { isDciRequest, isSupportedVersion, PROTOCOL_VERSION, validateRequest } from '../src/index';

const valid = {
  v: 1,
  sessionId: 's1',
  prompt: 'Why is this overdue?',
  action: 'explain',
  context: [
    {
      id: 'inv_1',
      type: 'invoice',
      label: 'Invoice 1',
      data: { amount: 5 },
      source: 'annotated',
      ancestors: [],
    },
    { data: {}, source: 'fallback', fallback: { tagName: 'p', path: 'p' } },
  ],
  page: { url: 'https://x.test/', title: 'X' },
  futureField: true,
};

describe('validateRequest', () => {
  it('accepts a valid request, including unknown extra fields', () => {
    expect(validateRequest(valid)).toEqual({ ok: true, value: valid });
    expect(isDciRequest(valid)).toBe(true);
  });

  it('reports every issue', () => {
    const result = validateRequest({
      v: '1',
      sessionId: '',
      prompt: 3,
      action: 4,
      context: [null, { data: [], source: 'x', id: 1, type: 2, label: 3, ancestors: {} }],
      page: { url: 'u' },
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues).toEqual([
      'v must be an integer',
      'sessionId must be a non-empty string',
      'prompt must be a string',
      'action must be a string',
      'context[0] must be an object',
      'context[1].data must be an object',
      "context[1].source must be 'annotated' or 'fallback'",
      'context[1].id must be a string',
      'context[1].type must be a string',
      'context[1].label must be a string',
      'context[1].ancestors must be an array',
      'page must be { url: string, title: string }',
    ]);
  });

  it('rejects non-objects and a non-array context', () => {
    expect(validateRequest('x')).toEqual({ ok: false, issues: ['request must be a JSON object'] });
    expect(validateRequest([])).toEqual({ ok: false, issues: ['request must be a JSON object'] });
    const r = validateRequest({ ...valid, context: {} });
    expect(!r.ok && r.issues).toEqual(['context must be an array']);
  });
});

describe('isSupportedVersion', () => {
  it('accepts only the current major version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(isSupportedVersion(1)).toBe(true);
    expect(isSupportedVersion(2)).toBe(false);
  });
});
