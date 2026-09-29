import type { DciContextNode } from '@dci/protocol';

export interface SuggestedAction {
  id: string;
  label: string;
  /** Sent as the prompt; defaults to `label`. */
  prompt?: string;
  icon?: string;
  /** Extra filter on the current context. */
  when?: (nodes: readonly DciContextNode[]) => boolean;
  /** Offer when several nodes are selected. Default `true`. */
  multi?: boolean;
}

/** Actions per node `type`, with `'*'` for every selection, or a function. */
export type ActionsConfig =
  Record<string, SuggestedAction[]> | ((nodes: readonly DciContextNode[]) => SuggestedAction[]);

/**
 * Actions to offer for the given context:
 * - one type selected: that type's actions, then `'*'`
 * - mixed types: actions every type offers (by id), then `'*'`
 * - `when` and `multi` filter further; duplicates (by id) are dropped
 */
export function resolveActions(
  config: ActionsConfig | undefined,
  nodes: readonly DciContextNode[],
): SuggestedAction[] {
  if (!config || !nodes.length) return [];
  let candidates: SuggestedAction[];
  if (typeof config === 'function') candidates = config(nodes);
  else {
    const types = [...new Set(nodes.map((n) => n.type ?? ''))];
    const perType = types.map((t) => config[t] ?? []);
    const [first = [], ...rest] = perType;
    const shared = first.filter((a) => rest.every((list) => list.some((b) => b.id === a.id)));
    candidates = [...shared, ...(config['*'] ?? [])];
  }
  const seen = new Set<string>();
  return candidates.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    if (nodes.length > 1 && a.multi === false) return false;
    return a.when ? a.when(nodes) : true;
  });
}
