import type { Gesture, GestureContext } from './interactions';
import { readDci } from './parse';
import { eventTarget, resolveTarget } from './pointer';

type SameTypeContext = Pick<GestureContext, 'tree' | 'selection' | 'options'>;

/**
 * Nodes of the same kind as `node` among its siblings, including `node`, in
 * document order. Typed nodes match on `type`; untyped ones match on tag name
 * only when `fallback` is on. Returns `[]` when there is nothing to match on.
 */
export function sameTypeNodes(ctx: SameTypeContext, node: Element): Element[] {
  const attribute = ctx.options.attribute;
  const parsed = readDci(node, attribute ? { attribute } : {});
  if (parsed?.type !== undefined) return ctx.tree.sameTypeSiblings(node);
  if (!(ctx.options.fallback ?? true)) return [];

  const pool = parsed
    ? [node, ...ctx.tree.siblingNodes(node)]
    : Array.from(node.parentElement?.children ?? [node]);
  return pool
    .filter((el) => el.tagName === node.tagName)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

export interface SelectSameTypeOptions {
  /** Add to the selection instead of replacing it. */
  add?: boolean;
}

/**
 * Select every same-type sibling of `node` (default: the primary node).
 * Returns the matched nodes; `maxSelection` still applies.
 */
export function selectSameType(
  ctx: SameTypeContext,
  node: Element | null = ctx.selection.primary(),
  { add = false }: SelectSameTypeOptions = {},
): Element[] {
  if (!node) return [];
  const nodes = sameTypeNodes(ctx, node);
  if (!nodes.length) return [];
  if (add) ctx.selection.add(nodes);
  else ctx.selection.set(nodes);
  return nodes;
}

/** Mod+Double-click selects all same-type siblings (Shift adds). */
export const sameTypeGesture: Gesture = (ctx) =>
  ctx.input.on('dblclick', (e) => {
    if (!ctx.bindings.selectSameType || e.button !== 0) return;
    const leaf = resolveTarget(ctx, eventTarget(e));
    const node = leaf && leaf === ctx.hover.leaf() ? ctx.hover.node() : leaf;
    if (!node) return;
    return selectSameType(ctx, node, { add: e.shiftKey }).length ? 'consume' : undefined;
  });
