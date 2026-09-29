import { PROTOCOL_VERSION, type DciEvent, type DciRequest } from './types';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isString = (x: unknown): x is string => typeof x === 'string';

function contextIssues(context: unknown, issues: string[]) {
  if (!Array.isArray(context)) {
    issues.push('context must be an array');
    return;
  }
  context.forEach((node, i) => {
    if (!isObject(node)) return issues.push(`context[${i}] must be an object`);
    if (!isObject(node.data)) issues.push(`context[${i}].data must be an object`);
    if (node.source !== 'annotated' && node.source !== 'fallback') {
      issues.push(`context[${i}].source must be 'annotated' or 'fallback'`);
    }
    for (const key of ['id', 'type', 'label'] as const) {
      if (node[key] !== undefined && !isString(node[key])) {
        issues.push(`context[${i}].${key} must be a string`);
      }
    }
    if (node.ancestors !== undefined && !Array.isArray(node.ancestors)) {
      issues.push(`context[${i}].ancestors must be an array`);
    }
  });
}

/**
 * Check a parsed request body. Unknown extra fields are allowed (additive
 * changes within a version); the version itself is checked by the caller.
 */
export function validateRequest(x: unknown): ValidationResult<DciRequest> {
  const issues: string[] = [];
  if (!isObject(x)) return { ok: false, issues: ['request must be a JSON object'] };
  if (typeof x.v !== 'number' || !Number.isInteger(x.v)) issues.push('v must be an integer');
  if (!isString(x.sessionId) || !x.sessionId) issues.push('sessionId must be a non-empty string');
  if (!isString(x.prompt)) issues.push('prompt must be a string');
  if (x.action !== undefined && !isString(x.action)) issues.push('action must be a string');
  contextIssues(x.context, issues);
  if (!isObject(x.page) || !isString(x.page.url) || !isString(x.page.title)) {
    issues.push('page must be { url: string, title: string }');
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: x as unknown as DciRequest };
}

export const isDciRequest = (x: unknown): x is DciRequest => validateRequest(x).ok;

/** Whether a request's major version is one this code understands. */
export const isSupportedVersion = (v: number): boolean => v === PROTOCOL_VERSION;

/**
 * Build a typed event from a type and a payload, or `null` when the type is
 * unknown or the payload doesn't match (forward compatibility: skip it).
 */
export function toEvent(type: string, data: unknown): DciEvent | null {
  const d = isObject(data) ? data : {};
  switch (type) {
    case 'text-delta':
      return isString(d.text) ? { type, text: d.text } : null;
    case 'tool-start':
      if (!isString(d.id) || !isString(d.name)) return null;
      return { type, id: d.id, name: d.name, ...(isString(d.label) ? { label: d.label } : {}) };
    case 'tool-end':
      if (!isString(d.id) || typeof d.ok !== 'boolean') return null;
      return { type, id: d.id, ok: d.ok, ...(isString(d.label) ? { label: d.label } : {}) };
    case 'client-action':
      if (!isString(d.name)) return null;
      return { type, name: d.name, args: isObject(d.args) ? d.args : {} };
    case 'error':
      if (!isString(d.message)) return null;
      return { type, message: d.message, ...(isString(d.code) ? { code: d.code } : {}) };
    case 'done':
      return { type };
    default:
      return type.startsWith('x-') ? { ...d, type: type as `x-${string}` } : null;
  }
}
