/** JSON with object keys sorted (recursively), so equal data gives an equal string. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** The reserved keys plus any serializable data for the node. */
export interface DciAttrValue {
  id?: string;
  type?: string;
  label?: string;
  private?: boolean;
  [data: string]: unknown;
}

/**
 * Build the annotation attribute without hand-writing JSON:
 * `el.setAttribute(...Object.entries(dciAttr({ id, type, label }))[0])`, or
 * spread it in JSX. Keys are sorted, so re-renders don't churn the attribute.
 */
export function dciAttr<A extends string = 'data-dci'>(
  value: DciAttrValue,
  attribute: A = 'data-dci' as A,
): Record<A, string> {
  return { [attribute]: stableStringify(value) } as Record<A, string>;
}
