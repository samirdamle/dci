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
      marker: 'A',
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
      context: [
        null,
        { data: [], source: 'x', id: 1, type: 2, label: 3, marker: 4, ancestors: {} },
      ],
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
      "context[1].source must be 'annotated', 'fallback' or 'text'",
      'context[1].id must be a string',
      'context[1].type must be a string',
      'context[1].label must be a string',
      'context[1].marker must be a string',
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

describe('validateRequest with text nodes', () => {
  const textNode = {
    label: 'Q3 focus: convert Proposal-stage tent deals before…',
    marker: 'A',
    data: {},
    ancestors: [{ id: 'home', type: 'page', label: 'Sales Home' }],
    source: 'text',
    text: {
      excerpt: 'Q3 focus: convert Proposal-stage tent deals before the winter catalog ships.',
      truncated: false,
      start: { path: 'main > div.card > p:nth-child(2)', offset: 0 },
      end: { path: 'main > div.card > p:nth-child(2)', offset: 74 },
    },
  };

  it('accepts a text node with a valid text object', () => {
    const result = validateRequest({ ...valid, context: [textNode] });
    expect(result).toEqual({ ok: true, value: { ...valid, context: [textNode] } });
  });

  it('rejects a text node with no text object', () => {
    const withoutText: Record<string, unknown> = { ...textNode };
    delete withoutText.text;
    const result = validateRequest({ ...valid, context: [withoutText] });
    expect(result).toEqual({ ok: false, issues: ['context[0].text must be an object'] });
  });

  it('rejects a text node with a malformed text object', () => {
    const result = validateRequest({
      ...valid,
      context: [
        {
          ...textNode,
          text: {
            excerpt: 1,
            truncated: 'no',
            start: { path: 1, offset: -1 },
            end: { path: 'main > p', offset: 1.5 },
          },
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      issues: [
        'context[0].text.excerpt must be a string',
        'context[0].text.truncated must be a boolean',
        'context[0].text.start.path must be a string',
        'context[0].text.start.offset must be an integer ≥ 0',
        'context[0].text.end.offset must be an integer ≥ 0',
      ],
    });
  });

  it('rejects a non-object text value and non-object endpoints', () => {
    const result = validateRequest({
      ...valid,
      context: [
        { ...textNode, text: 'excerpt' },
        { ...textNode, text: { ...textNode.text, start: 'p', end: null } },
      ],
    });
    expect(result).toEqual({
      ok: false,
      issues: [
        'context[0].text must be an object',
        'context[1].text.start must be an object',
        'context[1].text.end must be an object',
      ],
    });
  });
});

describe('isSupportedVersion', () => {
  it('accepts only the current major version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(isSupportedVersion(1)).toBe(true);
    expect(isSupportedVersion(2)).toBe(false);
  });
});
